import { activeIds } from "./options.js"
import { requestFromSlot, requestHeaders } from "./request.js"
import { collectArchive, entriesFromPayload, parseArchiveText, scanEntries } from "./select.js"

function listSlot(options, slots) {
    return options.oldTweets ? slots.old : slots.replies
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
    for (;;) {
        const response = await ctx.fetch(url, init)
        if (response.ok) return response.json()
        if (response.status === 429) {
            ctx.log("limite de taxa, esperando 1 min")
            await ctx.sleep(60 * 1000)
            continue
        }
        if (retry === limit) throw new Error("Max retries reached")
        ctx.log(`(${label}) resposta ${response.status}, nova tentativa em ${10 * (1 + retry)} s`)
        await ctx.sleep(10000 * (1 + retry))
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
                ctx.log("limite de taxa, esperando 1 min")
                await ctx.sleep(60 * 1000)
                i -= 1
                continue
            }
            if (retry === 8) throw new Error("Max retries reached")
            ctx.log(`(delete_tweets) resposta ${response.status}, nova tentativa em ${10 * (1 + retry)} s`)
            i -= 1
            await ctx.sleep(10000 * (1 + retry))
            retry += 1
            continue
        }
        retry = 0
        ctx.log(`${i}/${ids.length}`)
        ctx.onProgress?.({ done: i + 1, total: ids.length })
        await ctx.sleep(100)
    }
}

async function deleteTimeline(ctx) {
    const slot = listSlot(ctx.options, ctx.slots)
    let cursor = null
    let stop = false
    while (cursor !== "finished" && !stop) {
        const built = requestFromSlot(slot, { userId: ctx.env.userId, cursor })
        const data = await fetchJson(built.url, {
            headers: headersFor(slot, ctx),
            referrer: `https://x.com/${ctx.env.username}/with_replies`,
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
        ctx.log(`falta o transaction id em ${missing.label}`)
        return { status: "fail", missing: missing.label }
    }

    if (ctx.options.fromArchive) {
        const text = await ctx.readArchive()
        const found = collectArchive(parseArchiveText(text), ctx.options, ctx.env.userId)
        await deleteIds(found.ids, ctx)
        ctx.log("DELETION COMPLETE (if error happened before this may be not true)")
        return { status: "done" }
    }

    const only = activeIds(ctx.options.onlyIds)
    if (only.length === 0) await deleteTimeline(ctx)
    else await deleteIds(only, ctx)
    ctx.log("DELETION COMPLETE (if error happened before this may be not true)")
    return { status: "done" }
}
