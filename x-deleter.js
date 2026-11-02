// ==UserScript==
// @name         Tweet deleter
// @namespace    https://github.com/c1r5/x-deleter
// @version      1
// @description  Apaga os próprios tweets no x.com
// @author       c1r5
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/c1r5/x-deleter/main/x-deleter.js
// @downloadURL  https://raw.githubusercontent.com/c1r5/x-deleter/main/x-deleter.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==
// Cole este arquivo no console de x.com, com a conta aberta, ou instale no Tampermonkey.
(async () => {
const bootDeleter = async () => {
if (document.documentElement.dataset.xDeleter === "on") return
document.documentElement.dataset.xDeleter = "on"


const publicBearer = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

function defaultOptions() {
    return {
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        reposts: false,
        keywords: [],
        ignoreIds: [],
        onlyIds: [],
        afterDate: "1900-01-01",
        beforeDate: "2026-10-30",
    }
}

function slot(label, kind) {
    return {
        label,
        transactionId: "",
        clientUuid: "",
        authorization: publicBearer,
        secChUa: "",
        platform: "",
        ...defaultSlotRequest(kind),
    }
}

function defaultSlots() {
    return {
        replies: slot("Buscar respostas", "replies"),
        old: slot("Buscar tweets antigos", "old"),
        reposts: slot("Buscar reposts", "reposts"),
        delete: slot("Apagar tweet", "delete"),
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

function kindOf(text, legacy) {
    if (String(text).startsWith("RT ") || legacy.retweeted === true) return "repost"
    if (legacy.in_reply_to_status_id_str) return "reply"
    return "post"
}

function viewOf(tweet) {
    const legacy = tweet.legacy || {}
    const text = legacy.full_text || ""
    return {
        id: String(tweet.id_str || legacy.id_str),
        type: kindOf(text, legacy),
        text,
        date: legacy.created_at || "",
    }
}

function collectTimeline(root, options, userId) {
    const tweets = []
    const signal = { stop: false }

    function recurse(current) {
        if (typeof current !== "object" || current === null) return
        if (options.keepPinned && current.__type === "TimelinePinEntry") return

        if (current.__typename === "TweetWithVisibilityResults" && current.tweet
            && ownsTweet(current.tweet, userId, options.unretweet)
            && passesTimeline(current.tweet, options, signal)) {
            tweets.push(viewOf(current.tweet))
        } else if (current.__typename === "Tweet"
            && ownsTweet(current, userId, options.unretweet)
            && passesTimeline(current, options, signal)) {
            tweets.push(viewOf(current))
        }

        for (const key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) recurse(current[key])
        }
    }

    recurse(root)
    return { tweets, ids: tweets.map((tweet) => tweet.id), stop: signal.stop }
}

function collectArchive(data, options, userId) {
    const tweets = []
    const signal = { stop: false }
    for (const item of data) {
        if (!item.tweet || !item.tweet.id_str) continue
        const replyToSelf = item.tweet.in_reply_to_user_id_str === userId
        const startsWithRt = item.tweet.full_text.startsWith("RT ")
        const rtOk = options.unretweet == null || (options.unretweet === true && startsWithRt) || (options.unretweet === false && !startsWithRt)
        const tweet = {
            id: item.tweet.id_str,
            text: item.tweet.full_text,
            date: item.tweet.created_at,
        }
        if (!replyToSelf && rtOk && passesArchive(tweet, options, signal)) {
            tweets.push({
                id: item.tweet.id_str,
                type: kindOf(item.tweet.full_text, item.tweet),
                text: item.tweet.full_text,
                date: item.tweet.created_at || "",
            })
        }
    }
    return { tweets, ids: tweets.map((tweet) => tweet.id), stop: signal.stop }
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
    const tweets = []
    let stop = false
    for (const item of entries) {
        if (item.entryId.startsWith("profile-conversation") || item.entryId.startsWith("tweet-")) {
            const found = collectTimeline(item, options, userId)
            tweets.push(...found.tweets)
            if (found.stop) stop = true
        } else if (item.entryId.startsWith("cursor-bottom") && entries.length > 2) {
            return { tweets, ids: tweets.map((tweet) => tweet.id), stop, cursor: item.content.value }
        }
    }
    return { tweets, ids: tweets.map((tweet) => tweet.id), stop, cursor: "finished" }
}

const repliesPath = "/i/api/graphql/xz348nziCm96wndJ1S0MUQ/UserRepliesTimeline"
const repostsPath = "/i/api/graphql/q5tCz6UCo5FOK8DSqsjS2A/UserRepostsTimeline"
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

function applyValue(value, ctx) {
    if (Array.isArray(value)) return value.map((item) => applyValue(item, ctx))
    if (value && typeof value === "object") {
        const out = {}
        for (const [key, child] of Object.entries(value)) {
            if (child === "{{cursor}}" && !ctx.cursor) continue
            out[key] = applyValue(child, ctx)
        }
        return out
    }
    if (typeof value === "string") {
        return value
            .replaceAll("{{tweet_id}}", ctx.tweetId || "")
            .replaceAll("{{user_id}}", ctx.userId || "")
            .replaceAll("{{cursor}}", ctx.cursor || "")
    }
    return value
}

function variablesTemplate(kind) {
    if (kind === "reposts") {
        return {
            userId: "{{user_id}}",
            count: 20,
            cursor: "{{cursor}}",
            includePromotedContent: true,
            withVoice: true,
        }
    }
    const variables = { userId: "{{user_id}}", count: 20, cursor: "{{cursor}}" }
    variables.includePromotedContent = true
    if (kind === "old") variables.withQuickPromoteEligibilityTweetFields = true
    else variables.withCommunity = true
    variables.withVoice = true
    variables.withV2Timeline = true
    return variables
}

function defaultSlotRequest(kind) {
    if (kind === "delete") {
        return {
            method: "POST",
            path: deletePath,
            variables: null,
            features: null,
            body: {
                variables: { tweet_id: "{{tweet_id}}", dark_request: false },
                queryId: deleteQueryId,
            },
            contentType: "application/json",
            successStatus: 200,
        }
    }
    if (kind === "reposts") {
        return {
            method: "GET",
            path: repostsPath,
            variables: variablesTemplate(kind),
            features: featuresFor("old"),
            fieldToggles: { withPayments: false, withArticlePlainText: false },
            body: null,
            contentType: "application/json",
            successStatus: 200,
        }
    }
    return {
        method: "GET",
        path: repliesPath,
        variables: variablesTemplate(kind),
        features: featuresFor(kind),
        body: null,
        contentType: "application/json",
        successStatus: 200,
    }
}

function requestFromSlot(slot, ctx) {
    const filled = {
        tweetId: ctx.tweetId || "",
        userId: ctx.userId || "",
        cursor: ctx.cursor || "",
    }
    let url = `https://x.com${slot.path}`
    if ((slot.method || "GET").toUpperCase() !== "POST") {
        const parts = []
        if (slot.variables) parts.push(`variables=${encodeURIComponent(JSON.stringify(applyValue(slot.variables, filled)))}`)
        if (slot.features) parts.push(`features=${encodeURIComponent(JSON.stringify(applyValue(slot.features, filled)))}`)
        if (slot.fieldToggles) parts.push(`fieldToggles=${encodeURIComponent(JSON.stringify(applyValue(slot.fieldToggles, filled)))}`)
        if (parts.length) url += `?${parts.join("&")}`
        return { url, method: "GET", body: null }
    }
    return { url, method: "POST", body: JSON.stringify(applyValue(slot.body, filled)) }
}

function timelineUrl(kind, userId, cursor) {
    return requestFromSlot(defaultSlotRequest(kind), { userId, cursor }).url
}

function deleteUrl() {
    return requestFromSlot(defaultSlotRequest("delete"), {}).url
}

function deleteBody(tweetId) {
    return requestFromSlot(defaultSlotRequest("delete"), { tweetId }).body
}

function requestHeaders({ authorization, transactionId, clientUuid, csrf, secChUa, acceptLanguage, language, platform }) {
    return {
        accept: "*/*",
        "accept-language": acceptLanguage,
        authorization,
        "content-type": "application/json",
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": platform || "\"Windows\"",
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

const slotByOperation = {
    UserRepliesTimeline: "replies",
    UserTweetsAndReplies: "replies",
    UserTweets: "old",
    UserOriginalsTimeline: "old",
    UserRepostsTimeline: "reposts",
    DeleteTweet: "delete",
}

const labels = {
    replies: "Buscar respostas",
    old: "Buscar tweets antigos",
    reposts: "Buscar reposts",
    delete: "Apagar tweet",
}

const knownPlaceholders = {
    tweet_id: "{{tweet_id}}",
    tweetId: "{{tweet_id}}",
    user_id: "{{user_id}}",
    userId: "{{user_id}}",
    user_id_str: "{{user_id}}",
    cursor: "{{cursor}}",
}

function isSnowflake(value) {
    return typeof value === "string" && /^\d{15,}$/.test(value)
}

function collect(value, path, candidates) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => collect(item, `${path}[${index}]`, candidates))
        return
    }
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key
        if (!knownPlaceholders[key] && isSnowflake(child)) candidates.push(childPath)
        collect(child, childPath, candidates)
    }
}

function substitute(value) {
    if (Array.isArray(value)) return value.map((item) => substitute(item))
    if (!value || typeof value !== "object") return value
    const out = {}
    for (const [key, child] of Object.entries(value)) {
        if (knownPlaceholders[key] && (typeof child === "string" || typeof child === "number")) out[key] = knownPlaceholders[key]
        else out[key] = substitute(child)
    }
    return out
}

function extractJsonObject(text, start) {
    const begin = text.indexOf("{", start)
    if (begin < 0) return ""
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = begin; i < text.length; i++) {
        const char = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (char === "\\") escaped = true
            else if (char === "\"") inString = false
            continue
        }
        if (char === "\"") inString = true
        else if (char === "{") depth += 1
        else if (char === "}") {
            depth -= 1
            if (depth === 0) return text.slice(begin, i + 1)
        }
    }
    return ""
}

function headerMap(headers) {
    const out = {}
    if (!headers) return out
    for (const [key, value] of Object.entries(headers)) out[String(key).toLowerCase()] = value
    return out
}

function finish(urlString, options) {
    let url
    try {
        url = new URL(urlString)
    } catch {
        return { ok: false, error: "url_ausente" }
    }
    const headers = headerMap(options.headers)
    let variables = null
    let features = null
    let fieldToggles = null
    if (url.searchParams.has("variables")) {
        try {
            variables = JSON.parse(url.searchParams.get("variables"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    if (url.searchParams.has("features")) {
        try {
            features = JSON.parse(url.searchParams.get("features"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    if (url.searchParams.has("fieldToggles")) {
        try {
            fieldToggles = JSON.parse(url.searchParams.get("fieldToggles"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    let body = null
    if (options.body) {
        try {
            body = JSON.parse(options.body)
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    const path = url.pathname
    const operation = path.split("/").filter(Boolean).pop() || ""
    const slotKey = slotByOperation[operation] || ""
    const candidates = []
    collect(variables, "variables", candidates)
    collect(features, "features", candidates)
    collect(fieldToggles, "fieldToggles", candidates)
    collect(body, "body", candidates)
    path.split("/").forEach((segment, index) => {
        if (isSnowflake(segment)) candidates.push(`caminho[${index}]`)
    })
    const ambiguous = candidates.length > 0
    const method = String(options.method || (body ? "POST" : "GET")).toUpperCase()
    let nextVariables = ambiguous || !variables ? variables : substitute(variables)
    if (!ambiguous && nextVariables && slotKey && slotKey !== "delete" && !Object.hasOwn(nextVariables, "cursor")) {
        nextVariables = { ...nextVariables, cursor: "{{cursor}}" }
    }
    return {
        ok: true,
        error: "",
        slotKey,
        ambiguous,
        candidates,
        operation,
        slot: {
            label: labels[slotKey] || "",
            method,
            path,
            variables: nextVariables,
            features: ambiguous || !features ? features : substitute(features),
            fieldToggles: ambiguous || !fieldToggles ? fieldToggles : substitute(fieldToggles),
            body: ambiguous || !body ? body : substitute(body),
            contentType: headers["content-type"] || "application/json",
            successStatus: 200,
            authorization: headers.authorization || "",
            transactionId: headers["x-client-transaction-id"] || "",
            clientUuid: headers["x-client-uuid"] || "",
            secChUa: headers["sec-ch-ua"] || "",
            platform: headers["sec-ch-ua-platform"] || "",
        },
    }
}

function parseFetch(text) {
    if (!/fetch\s*\(/.test(text)) return { ok: false, error: "formato_nao_reconhecido" }
    const urlMatch = text.match(/fetch\s*\(\s*"([^"]*)"/)
    if (!urlMatch || !urlMatch[1]) return { ok: false, error: "url_ausente" }
    const objectText = extractJsonObject(text, urlMatch.index + urlMatch[0].length)
    let options = {}
    if (objectText) {
        try {
            options = JSON.parse(objectText)
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    return finish(urlMatch[1], options)
}

function parseCurl(text) {
    const unfolded = text.replace(/\\\r?\n/g, " ")
    if (!/^\s*curl\b/.test(unfolded)) return { ok: false, error: "formato_nao_reconhecido" }
    const urlMatch = unfolded.match(/--url\s+'([^']*)'|--url\s+"([^"]*)"|\bcurl\s+'([^']*)'|\bcurl\s+"([^"]*)"/)
    const url = urlMatch ? (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? urlMatch[4]) : ""
    if (!url) return { ok: false, error: "url_ausente" }
    const headers = {}
    const headerPattern = /-H\s+'([^']*)'|-H\s+"([^"]*)"/g
    for (const match of unfolded.matchAll(headerPattern)) {
        const raw = match[1] ?? match[2]
        const colon = raw.indexOf(":")
        if (colon < 0) continue
        headers[raw.slice(0, colon).trim().toLowerCase()] = raw.slice(colon + 1).trim()
    }
    let body = null
    const dataMatch = unfolded.match(/--data-raw\s+\$?'([^']*)'|--data-raw\s+\$?"([^"]*)"|--data\s+'([^']*)'|--data\s+"([^"]*)"/)
    if (dataMatch) body = dataMatch[1] ?? dataMatch[2] ?? dataMatch[3] ?? dataMatch[4]
    const methodMatch = unfolded.match(/-X\s+'([^']+)'|-X\s+"([^"]+)"|-X\s+([A-Z]+)/)
    const method = methodMatch ? (methodMatch[1] || methodMatch[2] || methodMatch[3]) : (body ? "POST" : "GET")
    return finish(url, { headers, body, method })
}

function parseCapturedRequest(text) {
    const raw = String(text || "").trim()
    if (/^\s*fetch\s*\(/.test(raw)) return parseFetch(raw)
    if (/^\s*curl\b/.test(raw)) return parseCurl(raw)
    return { ok: false, error: "formato_nao_reconhecido" }
}





const itemGap = 1000
const typeGap = 30000
const rateStart = 60 * 1000
const rateCap = 5 * 60 * 1000

const actionOrder = [
    { key: "unretweet", type: "repost", label: "unretweet" },
    { key: "deleteReplies", type: "reply", label: "delete replies" },
    { key: "deletePosts", type: "post", label: "delete posts" },
]

function defaultActions() {
    return { nuke: false, unretweet: true, deletePosts: true, deleteReplies: true }
}

function toggleAction(state, key, checked) {
    const next = { ...state, [key]: checked }
    if (key === "nuke" && checked) {
        next.unretweet = false
        next.deletePosts = false
        next.deleteReplies = false
    }
    if (key !== "nuke" && checked) next.nuke = false
    return next
}

function actionGroups(actions, tweets) {
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

async function runSearch(ctx) {
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

async function runExecution(ctx, tweets, actions) {
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

async function runDeletion(ctx) {
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

function isDark(color) {
    const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!match) return false
    const red = Number(match[1])
    const green = Number(match[2])
    const blue = Number(match[3])
    return (red * 299 + green * 587 + blue * 114) / 1000 < 128
}

function themeFrom(sample) {
    const dark = sample.scheme ? sample.scheme === "dark" : isDark(sample.background)
    return {
        bg: sample.background,
        text: sample.color,
        muted: sample.muted || sample.color,
        line: sample.border || sample.color,
        surface: sample.surface || sample.background,
        accent: sample.accent || "#1d9bf0",
        scheme: dark ? "dark" : "light",
        btnBg: dark ? "#eff3f4" : sample.color,
        btnText: dark ? "#0f1419" : sample.background,
    }
}

function painted(color) {
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return ""
    return color
}

function sampleTheme(document, view) {
    const body = view.getComputedStyle(document.body)
    const link = document.querySelector("a[href]")
    const accent = link ? view.getComputedStyle(link).color : ""
    const column = document.querySelector('[data-testid="sidebarColumn"]')
        || document.querySelector('[data-testid="primaryColumn"]')
    const columnStyle = column ? view.getComputedStyle(column) : null
    const surface = painted(columnStyle && columnStyle.backgroundColor) || body.backgroundColor
    const border = painted(columnStyle && columnStyle.borderTopColor) || body.borderTopColor
    const declared = document.documentElement.style.colorScheme
    const scheme = declared === "dark" || declared === "light" ? declared : (isDark(body.backgroundColor) ? "dark" : "light")
    return themeFrom({
        background: body.backgroundColor,
        color: body.color,
        muted: body.color,
        border,
        surface,
        accent,
        scheme,
    })
}

function applyTheme(target, theme) {
    target.style.setProperty("--bg", theme.bg)
    target.style.setProperty("--text", theme.text)
    target.style.setProperty("--muted", theme.muted)
    target.style.setProperty("--line", theme.line)
    target.style.setProperty("--surface", theme.surface)
    target.style.setProperty("--accent", theme.accent)
    target.style.setProperty("--scheme", theme.scheme)
    target.style.setProperty("--btn-bg", theme.btnBg)
    target.style.setProperty("--btn-text", theme.btnText)
    target.style.colorScheme = theme.scheme
}

function list(value) {
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean)
}

function optionsFromFields(fields) {
    return {
        fromArchive: Boolean(fields.fromArchive),
        unretweet: fields.unretweet == null ? true : Boolean(fields.unretweet),
        keepPinned: Boolean(fields.keepPinned),
        urlsOnly: Boolean(fields.urlsOnly),
        oldTweets: Boolean(fields.oldTweets),
        reposts: Boolean(fields.reposts),
        keywords: list(fields.keywords),
        ignoreIds: list(fields.ignoreIds),
        onlyIds: list(fields.onlyIds),
        afterDate: fields.afterDate || "1900-01-01",
        beforeDate: fields.beforeDate || "2026-10-30",
    }
}



async function begin(fields, fileText, deps) {
    const options = optionsFromFields(fields)
    if (options.fromArchive && !fileText) {
        deps.panel.log("falta o tweets.js")
        deps.panel.setStatus("fail")
        return { status: "fail" }
    }
    deps.panel.setStatus(deps.statusWord || "deleting")
    try {
        const result = await deps.run(options)
        deps.panel.setStatus(result.status)
        return result
    } catch (error) {
        deps.panel.log(error instanceof Error ? error.message : String(error))
        deps.panel.setStatus("fail")
        return { status: "fail" }
    }
}



function analyze(text, deps) {
    const parsed = parseCapturedRequest(text)
    if (!parsed.ok) {
        deps.panel.log(parsed.error)
        return parsed
    }
    if (parsed.ambiguous) {
        deps.panel.log(`placeholder ambíguo: ${parsed.candidates.join(", ")}`)
        deps.openManual?.(parsed)
        return parsed
    }
    if (!parsed.slotKey) {
        deps.panel.log("escolha o slot")
        return parsed
    }
    deps.saveSlot(parsed.slotKey, parsed.slot)
    deps.panel.log(parsed.slot.label)
    return parsed
}

const slotLabels = {
    replies: "Buscar respostas",
    old: "Buscar tweets antigos",
    reposts: "Buscar reposts",
    delete: "Apagar tweet",
}

function presentManual(slotKey, slot, candidates = []) {
    const search = slotKey !== "delete"
    return {
        slotKey,
        title: slotLabels[slotKey] || slot.label || "",
        search,
        method: slot.method || (search ? "GET" : "POST"),
        path: slot.path || "",
        successStatus: String(slot.successStatus || 200),
        contentType: slot.contentType || "application/json",
        variables: search && slot.variables ? JSON.stringify(slot.variables, null, 2) : "",
        features: search && slot.features ? JSON.stringify(slot.features, null, 2) : "",
        body: !search && slot.body ? JSON.stringify(slot.body, null, 2) : "",
        candidates,
    }
}

function openSlot(slotKey, slots, pending) {
    const fromPending = pending && (pending.slotKey === slotKey || !pending.slotKey)
    const slot = fromPending ? { ...pending.slot, label: slotLabels[slotKey] } : slots[slotKey]
    const candidates = fromPending && pending.ambiguous ? pending.candidates : []
    return presentManual(slotKey, slot, candidates)
}

function parsedJson(text) {
    if (!String(text || "").trim()) return null
    return JSON.parse(text)
}

function slotFromForm(slotKey, form, previous) {
    const search = slotKey !== "delete"
    let variables = null
    let features = null
    let body = null
    try {
        if (search) {
            variables = parsedJson(form.variables)
            features = parsedJson(form.features)
        } else {
            body = parsedJson(form.body)
        }
    } catch {
        return { ok: false, error: "json_invalido" }
    }
    const slot = {
        label: slotLabels[slotKey],
        method: form.method || previous.method,
        path: form.path,
        variables,
        features,
        fieldToggles: search ? (previous.fieldToggles ?? null) : null,
        body,
        contentType: form.contentType || previous.contentType || "application/json",
        successStatus: Number(form.successStatus || previous.successStatus || 200),
        authorization: previous.authorization || "",
        transactionId: previous.transactionId || "",
        clientUuid: previous.clientUuid || "",
        secChUa: previous.secChUa || "",
        platform: previous.platform || "",
    }
    const required = search ? "{{user_id}}" : "{{tweet_id}}"
    const haystack = JSON.stringify(search ? slot.variables : slot.body)
    if (!haystack.includes(required)) return { ok: false, error: `falta ${required}` }
    return { ok: true, slot }
}

const hideStyle = `[data-testid="sidebarColumn"] > :not([data-x-deleter-host]) { display: none !important; }`

function shown(node, view) {
    if (!node || node.isConnected === false) return false
    const style = view.getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden") return false
    const rect = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null
    if (rect && rect.width === 0) return false
    return true
}

function ensureHideStyle(document) {
    if (document.getElementById("x-deleter-sidebar")) return
    const style = document.createElement("style")
    style.id = "x-deleter-sidebar"
    style.textContent = hideStyle
    ;(document.head || document.documentElement).append(style)
}

function attachPanel(host, document, view) {
    ensureHideStyle(document)
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]')
    const primary = document.querySelector('[data-testid="primaryColumn"]')
    const target = shown(sidebar, view) ? sidebar : (primary || document.body)
    const mode = target === sidebar ? "sidebar" : "primary"
    host.setAttribute("data-x-deleter-host", "")
    host.dataset.place = mode
    host.style.cssText = "box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100dvh;max-height:100dvh;position:sticky;top:0;min-width:0;z-index:1;"
    if (host.parentElement !== target) target.prepend(host)
    return mode
}

function watchPlacement(host, document, view) {
    let scheduled = false
    const schedule = () => {
        if (scheduled) return
        scheduled = true
        const frame = view.requestAnimationFrame || ((callback) => callback())
        frame(() => {
            scheduled = false
            attachPanel(host, document, view)
        })
    }
    attachPanel(host, document, view)
    view.addEventListener?.("resize", schedule)
    const observer = new view.MutationObserver(schedule)
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true })
    return schedule
}




const modalChrome = `
<style>
  :host { all: initial; }
  .back {
    box-sizing: border-box;
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--text) 35%, transparent);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
    color-scheme: var(--scheme);
  }
  .modal {
    box-sizing: border-box;
    width: min(720px, 100%);
    max-height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg)));
    border-radius: 16px;
    overflow: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; }
  button.close { border: 0; background: transparent; color: var(--accent); font-size: 17px; padding: 0; }
  .sheet { overflow: auto; min-height: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-top: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg))); vertical-align: top; }
  th { font-size: 13px; color: var(--muted); font-weight: 700; }
  td.text { white-space: pre-wrap; word-break: break-word; }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  footer { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; font: inherit; }
  button.primary:disabled { opacity: 0.6; }
  footer label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
</style>
<div class="back">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Tweets encontrados">
    <header>
      <h2>Tweets encontrados</h2>
      <button class="close" type="button" data-action="close">Fechar</button>
    </header>
    <div class="sheet">
      <table>
        <thead><tr><th></th><th>Tipo</th><th>Data</th><th>Texto</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <footer>
      <button class="primary" type="button" data-action="execute" disabled>Executar</button>
      <label><input type="checkbox" data-choice="nuke"> Nuke</label>
      <label><input type="checkbox" data-choice="unretweet" checked> unretweet</label>
      <label><input type="checkbox" data-choice="deletePosts" checked> delete posts</label>
      <label><input type="checkbox" data-choice="deleteReplies" checked> delete replies</label>
    </footer>
  </div>
</div>`

function modalMarkup() {
    return modalChrome
}

function showDate(value) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const day = String(date.getUTCDate()).padStart(2, "0")
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${day}/${month}/${date.getUTCFullYear()}`
}

function openSearchModal(document, theme, onExecute) {
    const host = document.createElement("div")
    host.setAttribute("data-x-deleter-modal", "")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = modalChrome
    applyTheme(shadow.querySelector(".back"), theme)
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;"
    const body = shadow.querySelector("tbody")
    const rows = []
    const actions = defaultActions()
    const execute = shadow.querySelector("[data-action=execute]")
    function paintActions() {
        for (const input of shadow.querySelectorAll("[data-choice]")) {
            input.checked = Boolean(actions[input.dataset.choice])
        }
    }
    const api = {
        stopped: false,
        enable() {
            if (!api.stopped) execute.disabled = false
        },
        addTweet(tweet) {
            if (api.stopped) return
            const record = { ...tweet, selected: true }
            rows.push(record)
            const row = document.createElement("tr")
            const pick = document.createElement("td")
            const box = document.createElement("input")
            box.type = "checkbox"
            box.checked = true
            box.dataset.id = tweet.id
            box.addEventListener("change", () => {
                record.selected = box.checked
            })
            pick.append(box)
            const type = document.createElement("td")
            type.textContent = tweet.type
            const date = document.createElement("td")
            date.textContent = showDate(tweet.date)
            const text = document.createElement("td")
            text.className = "text"
            text.textContent = tweet.text
            row.append(pick, type, date, text)
            body.append(row)
        },
        close() {
            api.stopped = true
            host.remove()
        },
    }
    for (const input of shadow.querySelectorAll("[data-choice]")) {
        input.addEventListener("change", () => {
            Object.assign(actions, toggleAction(actions, input.dataset.choice, input.checked))
            paintActions()
        })
    }
    execute.addEventListener("click", () => {
        if (execute.disabled || !onExecute) return
        execute.disabled = true
        Promise.resolve(onExecute(rows.map((row) => ({ ...row })), { ...actions })).finally(() => {
            if (!api.stopped) execute.disabled = false
        })
    })
    shadow.querySelector("[data-action=close]").addEventListener("click", () => api.close())
    shadow.querySelector(".back").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) api.close()
    })
    document.body.append(host)
    return api
}






const chevron = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19 L8 12 L15 5"/></svg>`

const markup = `
<style>
  :host { all: initial; }
  .wrap {
    --edge: color-mix(in srgb, var(--text) 22%, var(--bg));
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 16px 16px;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    color-scheme: var(--scheme);
    border: 1px solid var(--edge);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    transition: background-color 0.2s ease;
  }
  .wrap:hover { background: color-mix(in srgb, var(--text) 5%, var(--bg)); }
  .screen { display: none; flex: 0 1 auto; min-height: 0; flex-direction: column; gap: 12px; overflow: auto; }
  .screen.on { display: flex; }
  .screen.main.on { flex: 0 1 auto; overflow: hidden; }
  .screen.main.on .quick { flex: 1 1 auto; min-height: 0; overflow: auto; }
  header { display: flex; align-items: center; justify-content: space-between; min-height: 53px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.2; min-width: 0; }
  button.icon { width: 34px; height: 34px; border: 0; border-radius: 999px; background: transparent; color: var(--text); transition: background-color 0.2s ease; }
  button.icon:hover { background: color-mix(in srgb, var(--text) 10%, transparent); }
  button.icon svg { width: 20px; height: 20px; }
  a.back { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); text-decoration: none; font-weight: 400; font-size: 17px; }
  a.back svg { width: 22px; height: 22px; flex: none; }
  .logs { flex: none; height: 112px; overflow: auto; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.5; transition: background-color 0.2s ease; }
  .logs:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  .progress { height: 4px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .progress > span { display: block; height: 100%; width: 0; background: var(--accent); }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 15px; }
  .meter { flex: none; }
  .status-row .k { color: var(--muted); }
  .pill { border: 1px solid var(--edge); border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; background: var(--surface); color: var(--accent); }
  .quick, .setup { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); transition: background-color 0.2s ease; }
  .quick:hover, .setup:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  .quick h3 { margin: 0; font-size: 15px; font-weight: 800; }
  .quick-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .marks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; max-height: calc(3 * 24px + 16px); overflow-y: auto; }
  .marks label { min-width: 0; min-height: 24px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  label.field, label.date { flex-direction: column; align-items: stretch; gap: 4px; font-size: 13px; color: var(--muted); }
  .dates { display: flex; flex-wrap: wrap; gap: 8px; }
  .dates .date { flex: 1 1 9rem; min-width: 0; }
  input, button.primary, textarea { font: inherit; color: var(--text); }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  input[type="date"], input[type="text"] { width: 100%; box-sizing: border-box; border: 1px solid var(--edge); border-radius: 4px; padding: 8px 10px; background: var(--bg); transition: background-color 0.2s ease; }
  input[type="date"]:hover, input[type="text"]:hover { background: color-mix(in srgb, var(--text) 8%, var(--bg)); }
  textarea.curl { min-height: 120px; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; transition: background-color 0.2s ease; }
  textarea.curl:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; transition: background-color 0.2s ease; }
  button.primary:hover { background: color-mix(in srgb, var(--btn-text) 12%, var(--btn-bg)); }
  button.primary:disabled { opacity: 0.6; }
  button.icon.on { color: var(--accent); }
  ul.setup { list-style: none; margin: 0; padding: 0; }
  ul.setup li { display: flex; align-items: center; gap: 10px; font-size: 15px; padding: 10px 0; border-bottom: 1px solid var(--edge); }
  button.name { border: 0; background: transparent; color: var(--accent); font-weight: 700; font-size: 15px; padding: 0; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
  select, textarea.box { border: 1px solid var(--edge); border-radius: 4px; padding: 8px 10px; background: var(--bg); width: 100%; box-sizing: border-box; transition: background-color 0.2s ease; }
  select:hover, textarea.box:hover { background: color-mix(in srgb, var(--text) 8%, var(--bg)); }
  textarea.box { font-family: ui-monospace, monospace; font-size: 12.5px; }
  ul.candidates { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; }
</style>
<div class="wrap">
  <section class="screen main on" data-screen="main">
    <header>
      <h2>Tweet deleter</h2>
      <button class="icon" type="button" aria-label="Configurações Avançadas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/></svg>
      </button>
    </header>
    <section class="quick">
      <div class="quick-head">
        <h3>Configurações rápidas</h3>
        <button class="icon" type="button" data-action="import" aria-label="Importar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.5"/></svg></button>
      </div>
      <div class="marks">
        <label><input type="checkbox" data-field="keepPinned" checked> Manter o fixado</label>
        <label><input type="checkbox" data-field="urlsOnly"> Só com link</label>
      </div>
      <div class="dates">
        <label class="date">De <input type="date" data-field="afterDate" value="1900-01-01"></label>
        <label class="date">Até <input type="date" data-field="beforeDate" value="2026-10-30"></label>
      </div>
      <label class="field">Palavras <input type="text" data-field="keywords"></label>
      <label class="field">Ignorar estes IDs <input type="text" data-field="ignoreIds"></label>
      <label class="field">Apagar só estes IDs <input type="text" data-field="onlyIds"></label>
      <button class="primary" type="button">Buscar</button>
    </section>
  </section>
  <section class="screen advanced" data-screen="advanced">
    <header><h2>Configurações Avançadas</h2></header>
    <a class="back" data-action="back-main" href="#main">${chevron}Tweet deleter</a>
    <textarea class="curl" placeholder="Cole um cURL ou um Copy as fetch"></textarea>
    <div><button class="primary" type="button" data-action="analyze">Analisar</button></div>
    <p class="hint">Clique no nome para o preenchimento manual. A caixa marca a configuração pronta.</p>
    <ul class="setup">
      <li><input type="checkbox" disabled data-ready="replies"> <button class="name" type="button" data-slot="replies">Buscar respostas</button></li>
      <li><input type="checkbox" disabled data-ready="old"> <button class="name" type="button" data-slot="old">Buscar tweets antigos</button></li>
      <li><input type="checkbox" disabled data-ready="reposts"> <button class="name" type="button" data-slot="reposts">Buscar reposts</button></li>
      <li><input type="checkbox" disabled data-ready="delete"> <button class="name" type="button" data-slot="delete">Apagar tweet</button></li>
    </ul>
    <div><button class="primary" type="button" data-action="restore-all">Restaurar tudo</button></div>
  </section>
  <section class="screen manual" data-screen="manual">
    <header><h2>Apagar tweet</h2></header>
    <a class="back" data-action="back-advanced" href="#advanced">${chevron}Configurações Avançadas</a>
    <div class="quick">
      <label class="field">Método <select data-field="method"><option>GET</option><option>POST</option></select></label>
      <label class="field">Caminho <input type="text" data-field="path"></label>
      <div data-part="post">
        <label class="field">Status de sucesso <input type="text" data-field="successStatus"></label>
        <label class="field">Content-Type <input type="text" data-field="contentType"></label>
        <label class="field">Corpo <textarea class="box" data-field="body" rows="7"></textarea></label>
      </div>
      <div data-part="search">
        <label class="field">Variáveis <textarea class="box" data-field="variables" rows="5"></textarea></label>
        <label class="field">Features <textarea class="box" data-field="features" rows="3"></textarea></label>
      </div>
      <ul class="candidates"></ul>
      <div class="actions">
        <button class="primary" type="button" data-action="save">Guardar</button>
        <button class="primary" type="button" data-action="restore">Restaurar</button>
      </div>
    </div>
  </section>
  <div class="meter">
    <div class="progress"><span></span></div>
    <div class="status-row"><span class="k">status</span> <span class="pill">idle</span></div>
  </div>
  <div class="logs"></div>
</div>`

function panelMarkup() {
    return markup
}

function showAnalyze(button, area, work, view) {
    const text = area.value
    button.disabled = true
    button.textContent = "Analisando..."
    view.setTimeout(() => {
        try {
            work(text)
        } finally {
            area.value = ""
            button.textContent = "Analisar"
            button.disabled = false
        }
    }, 0)
}

function mountPanel(document, view, handlers) {
    const host = document.createElement("div")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = markup
    const root = shadow.querySelector(".wrap")
    const logs = shadow.querySelector(".logs")
    const bar = shadow.querySelector(".progress > span")
    const pill = shadow.querySelector(".pill")
    let fileText = ""
    let pending = null

    function fillManual(state) {
        const screen = shadow.querySelector("[data-screen=manual]")
        screen.dataset.slot = state.slotKey
        screen.querySelector("h2").textContent = state.title
        shadow.querySelector("[data-field=method]").value = state.method
        shadow.querySelector("[data-field=path]").value = state.path
        shadow.querySelector("[data-field=successStatus]").value = state.successStatus
        shadow.querySelector("[data-field=contentType]").value = state.contentType
        shadow.querySelector("[data-field=variables]").value = state.variables
        shadow.querySelector("[data-field=features]").value = state.features
        shadow.querySelector("[data-field=body]").value = state.body
        shadow.querySelector("[data-part=search]").hidden = !state.search
        shadow.querySelector("[data-part=post]").hidden = state.search
        const list = shadow.querySelector(".candidates")
        list.replaceChildren()
        for (const candidate of state.candidates) {
            const item = document.createElement("li")
            item.textContent = candidate
            list.append(item)
        }
    }

    function markReady(key, ready) {
        const box = shadow.querySelector(`[data-ready="${key}"]`)
        if (box) box.checked = ready
    }

    function paintReady() {
        const slots = handlers.slots ? handlers.slots() : null
        if (!slots) return
        for (const key of ["replies", "old", "reposts", "delete"]) {
            markReady(key, Boolean(slots[key] && slots[key].transactionId))
        }
    }

    function formFields() {
        return {
            method: shadow.querySelector("[data-field=method]").value,
            path: shadow.querySelector("[data-field=path]").value,
            successStatus: shadow.querySelector("[data-field=successStatus]").value,
            contentType: shadow.querySelector("[data-field=contentType]").value,
            variables: shadow.querySelector("[data-field=variables]").value,
            features: shadow.querySelector("[data-field=features]").value,
            body: shadow.querySelector("[data-field=body]").value,
        }
    }

    function show(name) {
        for (const screen of shadow.querySelectorAll(".screen")) {
            screen.classList.toggle("on", screen.dataset.screen === name)
        }
    }

    function paint() {
        applyTheme(root, sampleTheme(document, view))
    }
    paint()
    const observer = new view.MutationObserver(paint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] })
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] })

    paintReady()

    shadow.querySelector("[data-action=import]").addEventListener("click", () => {
        const input = document.createElement("input")
        input.type = "file"
        input.onchange = () => {
            const file = input.files && input.files[0]
            if (!file) return
            const reader = new view.FileReader()
            reader.onload = () => {
                fileText = String(reader.result || "")
                const button = shadow.querySelector("[data-action=import]")
                if (button) {
                    button.classList.toggle("on", Boolean(fileText))
                    button.title = file.name || "Importar"
                }
            }
            reader.readAsText(file)
        }
        input.click()
    })
    shadow.querySelector('[aria-label="Configurações Avançadas"]').addEventListener("click", () => show("advanced"))
    shadow.querySelector("[data-action=back-main]").addEventListener("click", (event) => {
        event.preventDefault()
        show("main")
    })
    shadow.querySelector("[data-action=back-advanced]").addEventListener("click", (event) => {
        event.preventDefault()
        show("advanced")
    })
    for (const button of shadow.querySelectorAll("[data-slot]")) {
        button.addEventListener("click", () => {
            fillManual(openSlot(button.dataset.slot, handlers.slots(), pending))
            show("manual")
        })
    }
    shadow.querySelector("[data-action=analyze]").addEventListener("click", () => {
        const button = shadow.querySelector("[data-action=analyze]")
        const area = shadow.querySelector("textarea.curl")
        showAnalyze(button, area, (text) => {
            const result = analyze(text, {
                panel,
                saveSlot: handlers.saveSlot,
                openManual(parsed) {
                    pending = parsed
                    if (!parsed.slotKey) return
                    fillManual(openSlot(parsed.slotKey, handlers.slots(), parsed))
                    show("manual")
                },
            })
            if (!result || !result.ok) return
            if (!result.slotKey) {
                pending = result
                return
            }
            if (result.ambiguous) return
            pending = null
            paintReady()
        }, view)
    })
    shadow.querySelector("[data-action=save]").addEventListener("click", () => {
        const key = shadow.querySelector("[data-screen=manual]").dataset.slot
        const result = slotFromForm(key, formFields(), handlers.slots()[key])
        if (!result.ok) {
            panel.log(result.error)
            return
        }
        handlers.saveSlot(key, result.slot)
        pending = null
        paintReady()
        show("advanced")
    })
    shadow.querySelector("[data-action=restore]").addEventListener("click", () => {
        const key = shadow.querySelector("[data-screen=manual]").dataset.slot
        handlers.restoreSlot(key)
        pending = null
        const slot = handlers.slots()[key]
        fillManual(presentManual(key, slot, []))
        paintReady()
    })
    shadow.querySelector("[data-action=restore-all]").addEventListener("click", () => {
        handlers.restoreAll()
        pending = null
        paintReady()
    })
    shadow.querySelector(".screen.main .primary").addEventListener("click", () => {
        const fields = {}
        for (const input of shadow.querySelector(".screen.main").querySelectorAll("[data-field]")) {
            fields[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value
        }
        fields.fromArchive = Boolean(fileText)
        handlers.onStart(fields, fileText, panel)
    })

    const panel = {
        log(line) {
            const row = document.createElement("div")
            row.textContent = line
            logs.append(row)
        },
        progress({ done, total }) {
            bar.style.width = total ? `${(done / total) * 100}%` : "0"
        },
        setStatus(status) {
            pill.textContent = status
        },
    }
    watchPlacement(host, document, view)
    return panel
}



const configKey = "x-deleter.config.v1"

function read(storage) {
    const raw = storage.getItem(configKey)
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
        return {}
    }
}

function loadSlots(storage) {
    const defaults = defaultSlots()
    const saved = read(storage)
    return {
        replies: saved.replies || defaults.replies,
        old: saved.old || defaults.old,
        reposts: saved.reposts || defaults.reposts,
        delete: saved.delete || defaults.delete,
    }
}

const sharedHeaderFields = ["authorization", "transactionId", "clientUuid", "secChUa", "platform"]

function withSharedHeaders(source, target) {
    const next = { ...target }
    let copied = false
    for (const field of sharedHeaderFields) {
        const value = source?.[field]
        if (typeof value !== "string" || !value.trim()) continue
        next[field] = value
        copied = true
    }
    return copied ? next : null
}

function saveSlot(storage, key, slot) {
    const saved = read(storage)
    const defaults = defaultSlots()
    saved[key] = slot
    for (const other of ["replies", "old", "reposts", "delete"]) {
        if (other === key) continue
        const shared = withSharedHeaders(slot, saved[other] || defaults[other])
        if (shared) saved[other] = shared
    }
    storage.setItem(configKey, JSON.stringify(saved))
    return loadSlots(storage)
}

function restoreSlot(storage, key) {
    const saved = read(storage)
    saved[key] = null
    storage.setItem(configKey, JSON.stringify(saved))
    return loadSlots(storage)
}

function restoreAll(storage) {
    storage.removeItem(configKey)
    return loadSlots(storage)
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

function platform() {
    const data = navigator.userAgentData
    if (!data || !data.platform) return ""
    return `"${data.platform}"`
}

function readEnv() {
    const language = (navigator.language || "en").split("-")[0]
    return {
        userId: cookie("twid").substring(4),
        username: username(),
        csrf: cookie("ct0"),
        secChUa: secChUa(),
        platform: platform(),
        acceptLanguage: acceptLanguage(),
        language,
    }
}

mountPanel(document, window, {
    slots: () => loadSlots(localStorage),
    saveSlot: (key, slot) => saveSlot(localStorage, key, slot),
    restoreSlot: (key) => restoreSlot(localStorage, key),
    restoreAll: () => restoreAll(localStorage),
    onStart(fields, fileText, panel) {
        let modal = null
        return begin(fields, fileText, {
            statusWord: "buscando",
            panel,
            run(options) {
                return runSearch({
                    options,
                    slots: loadSlots(localStorage),
                    env: readEnv(),
                    fetch: globalThis.fetch.bind(globalThis),
                    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                    log: (line) => panel.log(line),
                    onProgress: (value) => panel.progress(value),
                    readArchive: async () => fileText,
                    onReady() {
                        modal = openSearchModal(document, sampleTheme(document, window), (tweets, choices) => {
                            panel.setStatus("executando")
                            return runExecution({
                                options,
                                slots: loadSlots(localStorage),
                                env: readEnv(),
                                fetch: globalThis.fetch.bind(globalThis),
                                sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                                log: (line) => panel.log(line),
                                onProgress: (value) => panel.progress(value),
                                readArchive: async () => fileText,
                            }, tweets, choices).then((result) => {
                                panel.setStatus(result.status)
                                return result
                            })
                        })
                    },
                    onTweet(tweet) {
                        modal?.addTweet(tweet)
                    },
                    isStopped() {
                        return Boolean(modal && modal.stopped)
                    },
                }).then((result) => {
                    modal?.enable()
                    return result
                })
            },
        })
    },
})

}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bootDeleter() }, { once: true })
else bootDeleter()
})()
