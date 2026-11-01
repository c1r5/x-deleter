// Cole este arquivo no console de x.com, com a conta aberta.
(async () => {
const publicBearer = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

function defaultOptions() {
    return {
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        keywords: [],
        ignoreIds: [],
        onlyIds: [],
        afterDate: "1900-01-01",
        beforeDate: "2026-10-30",
    }
}

function defaultSlots() {
    return {
        replies: {
            label: "Buscar respostas",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
        old: {
            label: "Buscar tweets antigos",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
        delete: {
            label: "Apagar tweet",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
    }
}

function activeIds(ids) {
    return (ids || []).filter((id) => id !== "")
}

function midnight(value) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
}

function ignored(id, list) {
    return list.includes(id) || list.includes(parseInt(id, 10))
}

function keywordsMatch(text, words) {
    if (!words || words.length === 0) return true
    return words.some((word) => String(text).includes(word))
}

function dateMatches(createdAt, options, signal) {
    const tweetDate = midnight(createdAt)
    const after = midnight(options.afterDate)
    const before = midnight(options.beforeDate)
    if (tweetDate < after) signal.stop = true
    return tweetDate > after && tweetDate < before
}

function timelineDate(tweet, options, signal) {
    if (tweet.legacy && Object.prototype.hasOwnProperty.call(tweet.legacy, "created_at")) {
        return dateMatches(tweet.legacy.created_at, options, signal)
    }
    return true
}

function ownsTweet(tweet, userId, unretweet) {
    if (tweet.legacy && tweet.legacy.retweeted === true && unretweet === false) return false
    if (tweet.user_id_str === userId) return true
    if (tweet.legacy && tweet.legacy.user_id_str === userId) return true
    return false
}

function passesTimeline(tweet, options, signal) {
    const id = tweet.legacy && tweet.legacy.id_str
    if (id && ignored(id, options.ignoreIds)) return false
    const text = (tweet.legacy && tweet.legacy.full_text) || ""
    const urls = (tweet.legacy && tweet.legacy.entities && tweet.legacy.entities.urls) || []
    const words = keywordsMatch(text, options.keywords)
    const dated = timelineDate(tweet, options, signal)
    if (options.urlsOnly) return urls.length > 0 && words && dated
    return words && dated
}

function passesArchive(tweet, options, signal) {
    if (ignored(tweet.id, options.ignoreIds)) return false
    return keywordsMatch(tweet.text, options.keywords) && dateMatches(tweet.date, options, signal)
}

function collectTimeline(root, options, userId) {
    const ids = []
    const signal = { stop: false }

    function recurse(current) {
        if (typeof current !== "object" || current === null) return
        if (options.keepPinned && current.__type === "TimelinePinEntry") return

        if (current.__typename === "TweetWithVisibilityResults" && current.tweet
            && ownsTweet(current.tweet, userId, options.unretweet)
            && passesTimeline(current.tweet, options, signal)) {
            ids.push(current.tweet.id_str || current.tweet.legacy.id_str)
        } else if (current.__typename === "Tweet"
            && ownsTweet(current, userId, options.unretweet)
            && passesTimeline(current, options, signal)) {
            ids.push(current.id_str || current.legacy.id_str)
        }

        for (const key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) recurse(current[key])
        }
    }

    recurse(root)
    return { ids, stop: signal.stop }
}

function collectArchive(data, options, userId) {
    const ids = []
    const signal = { stop: false }
    for (const item of data) {
        if (!item.tweet || !item.tweet.id_str) continue
        const replyToSelf = item.tweet.in_reply_to_user_id_str === userId
        const startsWithRt = item.tweet.full_text.startsWith("RT ")
        const rtOk = (options.unretweet === true && startsWithRt) || (options.unretweet === false && !startsWithRt)
        const tweet = {
            id: item.tweet.id_str,
            text: item.tweet.full_text,
            date: item.tweet.created_at,
        }
        if (!replyToSelf && rtOk && passesArchive(tweet, options, signal)) ids.push(item.tweet.id_str)
    }
    return { ids, stop: signal.stop }
}

function parseArchiveText(content) {
    const parts = content.split("=")
    parts.shift()
    return JSON.parse(parts.join("=").trim())
}

function entriesFromPayload(data) {
    let entries = data.data.user.result.timeline.timeline.instructions
    for (const item of entries) {
        if (item.type === "TimelineAddEntries") entries = item.entries
    }
    return entries
}

function scanEntries(entries, options, userId) {
    const ids = []
    let stop = false
    for (const item of entries) {
        if (item.entryId.startsWith("profile-conversation") || item.entryId.startsWith("tweet-")) {
            const found = collectTimeline(item, options, userId)
            ids.push(...found.ids)
            if (found.stop) stop = true
        } else if (item.entryId.startsWith("cursor-bottom") && entries.length > 2) {
            return { ids, stop, cursor: item.content.value }
        }
    }
    return { ids, stop, cursor: "finished" }
}

const repliesPath = "/i/api/graphql/xz348nziCm96wndJ1S0MUQ/UserRepliesTimeline"
const deletePath = "/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet"
const deleteQueryId = "VaenaVgh5q5ih7kvyVjgtg"

const featureFlags = {
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_media_download_video_enabled: false,
    responsive_web_enhance_cards_enabled: false,
}

function featuresFor(kind) {
    if (kind === "old") return featureFlags
    return { rweb_lists_timeline_redesign_enabled: true, ...featureFlags }
}

function variablesFor(kind, userId, cursor) {
    const variables = { userId, count: 20 }
    if (cursor) variables.cursor = cursor
    variables.includePromotedContent = true
    if (kind === "old") variables.withQuickPromoteEligibilityTweetFields = true
    else variables.withCommunity = true
    variables.withVoice = true
    variables.withV2Timeline = true
    return variables
}

function timelineUrl(kind, userId, cursor) {
    const variables = encodeURIComponent(JSON.stringify(variablesFor(kind, userId, cursor)))
    const features = encodeURIComponent(JSON.stringify(featuresFor(kind)))
    return `https://x.com${repliesPath}?variables=${variables}&features=${features}`
}

function deleteUrl() {
    return `https://x.com${deletePath}`
}

function deleteBody(tweetId) {
    return JSON.stringify({
        variables: { tweet_id: tweetId, dark_request: false },
        queryId: deleteQueryId,
    })
}

function requestHeaders({ authorization, transactionId, clientUuid, csrf, secChUa, acceptLanguage, language }) {
    return {
        accept: "*/*",
        "accept-language": acceptLanguage,
        authorization,
        "content-type": "application/json",
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client-transaction-id": transactionId,
        "x-client-uuid": clientUuid,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": language,
    }
}





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
        secChUa: ctx.env.secChUa,
        acceptLanguage: ctx.env.acceptLanguage,
        language: ctx.env.language,
    })
}

async function deleteIds(ids, ctx) {
    const slot = ctx.slots.delete
    let retry = 0
    for (let i = 0; i < ids.length; i++) {
        const response = await ctx.fetch(deleteUrl(), {
            headers: headersFor(slot, ctx),
            referrer: `https://x.com/${ctx.env.username}/with_replies`,
            referrerPolicy: "strict-origin-when-cross-origin",
            body: deleteBody(ids[i]),
            method: "POST",
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
        await ctx.sleep(100)
    }
}

async function deleteTimeline(ctx) {
    const slot = listSlot(ctx.options, ctx.slots)
    let cursor = null
    let stop = false
    while (cursor !== "finished" && !stop) {
        const kind = ctx.options.oldTweets ? "old" : "replies"
        const data = await fetchJson(timelineUrl(kind, ctx.env.userId, cursor), {
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

async function runDeletion(ctx) {
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

function cookie(name) {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop().split(";").shift()
    return ""
}

function acceptLanguage() {
    const languages = navigator.languages
    if (!languages || languages.length === 0) return "en-US,en;q=0.9"
    let q = 1
    return languages.map((lang) => {
        if (q < 1) {
            const result = `${lang};q=${q.toFixed(1)}`
            q -= 0.1
            return result
        }
        q -= 0.1
        return lang
    }).join(",")
}

function secChUa() {
    if (!navigator.userAgentData || !navigator.userAgentData.brands) return ""
    return navigator.userAgentData.brands.map((brand) => `"${brand.brand}";v="${brand.version}"`).join(", ")
}

function username() {
    const part = location.pathname.split("/").filter(Boolean)[0]
    if (!part || ["i", "home", "explore", "search", "settings", "messages"].includes(part)) return ""
    return part
}

function readEnv() {
    const language = (navigator.language || "en").split("-")[0]
    return {
        userId: cookie("twid").substring(4),
        username: username(),
        csrf: cookie("ct0"),
        secChUa: secChUa(),
        acceptLanguage: acceptLanguage(),
        language,
    }
}

function waitForArchive() {
    return new Promise((resolve) => {
        const modal = document.createElement("div")
        modal.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"
        const card = document.createElement("div")
        card.style.cssText = "background:#fff;padding:20px;border-radius:5px;width:400px;text-align:center;"
        const title = document.createElement("h2")
        title.textContent = "Drop Your File Here"
        const drop = document.createElement("div")
        drop.textContent = "Drop your tweets.js from your Twitter Archive here"
        drop.style.cssText = "border:2px dashed #007bff;border-radius:5px;padding:60px;cursor:pointer;"
        const confirm = document.createElement("button")
        confirm.textContent = "Confirm"
        confirm.style.marginTop = "5px"
        let text = ""
        function take(file) {
            const reader = new FileReader()
            reader.onload = () => {
                text = String(reader.result || "")
                console.log("JSON data loaded into global variable.")
            }
            reader.readAsText(file)
        }
        drop.addEventListener("dragover", (event) => {
            event.preventDefault()
            drop.style.borderColor = "#0056b3"
        })
        drop.addEventListener("dragleave", () => {
            drop.style.borderColor = "#007bff"
        })
        drop.addEventListener("drop", (event) => {
            event.preventDefault()
            drop.style.borderColor = "#007bff"
            if (event.dataTransfer.files[0]) take(event.dataTransfer.files[0])
        })
        drop.addEventListener("click", () => {
            const input = document.createElement("input")
            input.type = "file"
            input.onchange = () => {
                if (input.files[0]) take(input.files[0])
            }
            input.click()
        })
        confirm.addEventListener("click", () => {
            if (!text) {
                console.error("No file loaded. Please load a file before confirming.")
                return
            }
            console.log("Confirmation received. File processed.")
            modal.remove()
            resolve(text)
        })
        card.append(title, drop, confirm)
        modal.append(card)
        document.body.append(modal)
    })
}

const env = readEnv()
const options = defaultOptions()
const slots = defaultSlots()
await runDeletion({
    options,
    slots,
    env,
    fetch: globalThis.fetch.bind(globalThis),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
    readArchive: waitForArchive,
})

})()
