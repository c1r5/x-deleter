import { activeIds } from "./options.js"
import { requestFromSlot, requestHeaders } from "./request.js"
import { collectArchive, entriesFromPayload, parseArchiveText, scanEntries } from "./select.js"

const itemGap = 1000
const typeGap = 30000
const rateStart = 60 * 1000
const rateCap = 5 * 60 * 1000

const actionOrder = [
    { key: "unretweet", type: "repost", label: "unretweet" },
    { key: "deleteReplies", type: "reply", label: "delete replies" },
    { key: "deletePosts", type: "post", label: "delete posts" },
]

export function defaultActions() {
    return { nuke: false, unretweet: true, deletePosts: true, deleteReplies: true }
}

export function toggleAction(state, key, checked) {
    const next = { ...state, [key]: checked }
    if (key === "nuke" && checked) {
        next.unretweet = false
        next.deletePosts = false
        next.deleteReplies = false
    }
    if (key !== "nuke" && checked) next.nuke = false
    return next
}

export function actionGroups(actions, tweets) {
    const selected = (tweets || []).filter((tweet) => tweet.selected !== false)
    return actionOrder
        .filter((item) => actions.nuke || actions[item.key])
        .map((item) => ({
            ...item,
            ids: selected.filter((tweet) => tweet.type === item.type).map((tweet) => tweet.id),
        }))
        .filter((group) => group.ids.length > 0)
}

function listSlot(options, slots) {
    if (options.reposts) return slots.reposts
    return options.oldTweets ? slots.old : slots.replies
}

function referrerFor(slot, username) {
    const operation = String(slot.path || "").split("/").pop()
    const leaf = operation === "UserRepostsTimeline" ? "reposts" : "with_replies"
    return `https://x.com/${username}/${leaf}`
}

function missingSlot(options, slots) {
    const listed = activeIds(options.onlyIds).length === 0 && !options.fromArchive
    const slot = listSlot(options, slots)
    if (listed && !slot.transactionId) return slot
    if (!slots.delete.transactionId) return slots.delete
    return null
}

async function fetchJson(url, init, ctx, label, limit) {
    let retry = 0
    let rateWait = rateStart
    for (;;) {
        const response = await ctx.fetch(url, init)
        if (response.ok) return response.json()
        if (response.status === 429) {
            ctx.log(`⏳ limite de taxa, esperando ${rateWait / 1000} s`)
            await ctx.sleep(rateWait)
            rateWait = Math.min(rateWait * 2, rateCap)
            continue
        }
        if (retry === limit) throw new Error("Max retries reached")
        const wait = 10000 * (1 + retry)
        ctx.log(`⚠️ (${label}) resposta ${response.status}, nova tentativa em ${wait / 1000} s`)
        await ctx.sleep(wait)
        retry += 1
    }
}

function headersFor(slot, ctx) {
    return requestHeaders({
        authorization: slot.authorization,
        transactionId: slot.transactionId,
        clientUuid: slot.clientUuid,
        csrf: ctx.env.csrf,
        secChUa: ctx.env.secChUa || slot.secChUa || "",
        acceptLanguage: ctx.env.acceptLanguage,
        language: ctx.env.language,
        platform: ctx.env.platform || slot.platform || "",
    })
}

async function deleteIds(ids, ctx) {
    const slot = ctx.slots.delete
    let retry = 0
    let rateWait = rateStart
    for (let i = 0; i < ids.length; i++) {
        const built = requestFromSlot(slot, { tweetId: ids[i], userId: ctx.env.userId })
        const response = await ctx.fetch(built.url, {
            headers: headersFor(slot, ctx),
            referrer: `https://x.com/${ctx.env.username}/with_replies`,
            referrerPolicy: "strict-origin-when-cross-origin",
            body: built.body,
            method: built.method,
            mode: "cors",
            credentials: "include",
        })
        if (!response.ok) {
            if (response.status === 429) {
                ctx.log(`⏳ limite de taxa, esperando ${rateWait / 1000} s`)
                await ctx.sleep(rateWait)
                rateWait = Math.min(rateWait * 2, rateCap)
                i -= 1
                continue
            }
            if (retry === 8) throw new Error("Max retries reached")
            const wait = 10000 * (1 + retry)
            ctx.log(`⚠️ (delete_tweets) resposta ${response.status}, nova tentativa em ${wait / 1000} s`)
            i -= 1
            await ctx.sleep(wait)
            retry += 1
            continue
        }
        retry = 0
        rateWait = rateStart
        ctx.log(`✅ ${i}/${ids.length}`)
        ctx.onProgress?.({ done: i + 1, total: ids.length })
        await ctx.sleep(itemGap)
    }
}

const searchKeys = ["replies", "old", "reposts"]

function readySearchSlots(slots) {
    return searchKeys.map((key) => slots[key]).filter((slot) => slot && slot.transactionId)
}

function missingSearchSlot(options, slots) {
    if (activeIds(options.onlyIds).length > 0 || options.fromArchive) return null
    if (readySearchSlots(slots).length === 0) return slots.replies
    return null
}

async function walkTimeline(ctx, slot, push, seen) {
    let cursor = null
    let stop = false
    while (cursor !== "finished" && !stop) {
        if (ctx.isStopped?.()) return
        const built = requestFromSlot(slot, { userId: ctx.env.userId, cursor })
        const data = await fetchJson(built.url, {
            headers: headersFor(slot, ctx),
            referrer: referrerFor(slot, ctx.env.username),
            referrerPolicy: "strict-origin-when-cross-origin",
            body: null,
            method: "GET",
            mode: "cors",
            credentials: "include",
        }, ctx, "fetch_tweets", 5)
        const scanned = scanEntries(entriesFromPayload(data), ctx.options, ctx.env.userId)
        for (const tweet of scanned.tweets) {
            if (seen.has(tweet.id)) continue
            seen.add(tweet.id)
            push(tweet)
        }
        cursor = scanned.cursor
        stop = scanned.stop
        if (cursor !== "finished" && !stop) await ctx.sleep(3000)
    }
}

export async function runSearch(ctx) {
    const missing = missingSearchSlot(ctx.options, ctx.slots)
    if (missing) {
        ctx.log(`❌ falta o transaction id em ${missing.label}`)
        return { status: "fail", missing: missing.label, tweets: [] }
    }
    ctx.onReady?.()
    const tweets = []
    const push = (tweet) => {
        tweets.push(tweet)
        ctx.log(`➕ ${tweet.id} ${tweet.type}`)
        ctx.onTweet?.(tweet)
    }
    if (ctx.options.fromArchive) {
        ctx.log("🔎 arquivo")
        const text = await ctx.readArchive()
        const found = collectArchive(parseArchiveText(text), { ...ctx.options, unretweet: null }, ctx.env.userId)
        for (const tweet of found.tweets) push(tweet)
    } else {
        const only = activeIds(ctx.options.onlyIds)
        if (only.length === 0) {
            const seen = new Set()
            for (const slot of readySearchSlots(ctx.slots)) {
                if (ctx.isStopped?.()) break
                ctx.log(`🔎 ${slot.label}`)
                await walkTimeline(ctx, slot, push, seen)
            }
        } else {
            ctx.log("🔎 lista de ids")
            for (const id of only) push({ id, type: "post", text: "", date: "" })
        }
    }
    ctx.log(`🔎 ${tweets.length} tweets`)
    return { status: "done", tweets }
}

export async function runExecution(ctx, tweets, actions) {
    if (!ctx.slots.delete.transactionId) {
        ctx.log(`❌ falta o transaction id em ${ctx.slots.delete.label}`)
        return { status: "fail", missing: ctx.slots.delete.label }
    }
    const groups = actionGroups(actions, tweets)
    if (groups.length === 0) {
        ctx.log("❌ nada selecionado para a ação")
        return { status: "fail" }
    }
    if (actions.nuke) ctx.log("💥 Nuke")
    const total = groups.reduce((sum, group) => sum + group.ids.length, 0)
    let done = 0
    const outer = ctx.onProgress
    ctx.onProgress = () => {
        done += 1
        outer?.({ done, total })
    }
    for (let index = 0; index < groups.length; index++) {
        if (index > 0) {
            ctx.log(`⏳ intervalo entre ações, ${typeGap / 1000} s`)
            await ctx.sleep(typeGap)
        }
        const group = groups[index]
        ctx.log(`▶️ ${group.label}, ${group.ids.length} itens`)
        await deleteIds(group.ids, ctx)
    }
    ctx.onProgress = outer
    ctx.log("🏁 execução terminou")
    return { status: "done" }
}

async function deleteTimeline(ctx) {
    const slot = listSlot(ctx.options, ctx.slots)
    let cursor = null
    let stop = false
    while (cursor !== "finished" && !stop) {
        const built = requestFromSlot(slot, { userId: ctx.env.userId, cursor })
        const data = await fetchJson(built.url, {
            headers: headersFor(slot, ctx),
            referrer: referrerFor(slot, ctx.env.username),
            referrerPolicy: "strict-origin-when-cross-origin",
            body: null,
            method: "GET",
            mode: "cors",
            credentials: "include",
        }, ctx, "fetch_tweets", 5)
        const scanned = scanEntries(entriesFromPayload(data), ctx.options, ctx.env.userId)
        cursor = scanned.cursor
        stop = scanned.stop
        await deleteIds(scanned.ids, ctx)
        await ctx.sleep(3000)
    }
}

export async function runDeletion(ctx) {
    const missing = missingSlot(ctx.options, ctx.slots)
    if (missing) {
        ctx.log(`❌ falta o transaction id em ${missing.label}`)
        return { status: "fail", missing: missing.label }
    }

    if (ctx.options.fromArchive) {
        const text = await ctx.readArchive()
        const found = collectArchive(parseArchiveText(text), ctx.options, ctx.env.userId)
        await deleteIds(found.ids, ctx)
        ctx.log("🏁 execução terminou")
        return { status: "done" }
    }

    const only = activeIds(ctx.options.onlyIds)
    if (only.length === 0) await deleteTimeline(ctx)
    else await deleteIds(only, ctx)
    ctx.log("🏁 execução terminou")
    return { status: "done" }
}
