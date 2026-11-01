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
        ctx.onProgress?.({ done: i + 1, total: ids.length })
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

function sampleTheme(document, view) {
    const body = view.getComputedStyle(document.body)
    const link = document.querySelector("a[href]")
    const accent = link ? view.getComputedStyle(link).color : ""
    let surface = body.backgroundColor
    let border = body.borderTopColor
    const nodes = document.querySelectorAll("div, article, section")
    const limit = Math.min(nodes.length, 200)
    for (let i = 0; i < limit; i++) {
        const style = view.getComputedStyle(nodes[i])
        if (surface === body.backgroundColor && style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== body.backgroundColor) {
            surface = style.backgroundColor
        }
        if (style.borderTopColor && style.borderTopColor !== "rgba(0, 0, 0, 0)") border = style.borderTopColor
    }
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
        unretweet: Boolean(fields.unretweet),
        keepPinned: Boolean(fields.keepPinned),
        urlsOnly: Boolean(fields.urlsOnly),
        oldTweets: Boolean(fields.oldTweets),
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
    deps.panel.setStatus("deleting")
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



const markup = `
<style>
  :host { all: initial; }
  .wrap {
    box-sizing: border-box;
    width: 380px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 16px 16px;
    overflow: auto;
    background: var(--bg);
    color: var(--text);
    color-scheme: var(--scheme);
    border-left: 1px solid var(--line);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  header { display: flex; align-items: center; justify-content: space-between; min-height: 53px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; }
  button.icon { width: 34px; height: 34px; border: 0; border-radius: 999px; background: transparent; color: var(--text); }
  button.icon svg { width: 20px; height: 20px; }
  .logs { min-height: 96px; border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
  .progress { height: 4px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .progress > span { display: block; height: 100%; width: 0; background: var(--accent); }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 15px; }
  .status-row .k { color: var(--muted); }
  .pill { border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; background: var(--surface); color: var(--accent); }
  .quick { display: flex; flex-direction: column; gap: 8px; border-radius: 16px; padding: 12px 14px; background: var(--surface); }
  .quick h3 { margin: 0; font-size: 15px; font-weight: 800; }
  label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  label.field, label.date { flex-direction: column; align-items: stretch; gap: 4px; font-size: 13px; color: var(--muted); }
  .dates { display: flex; gap: 8px; }
  input, button.primary { font: inherit; color: var(--text); }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  input[type="date"], input[type="text"] { border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; background: var(--bg); }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; }
  .file { display: none; }
  .file.on { display: flex; justify-content: space-between; }
  button.file-btn { border: 1px solid var(--line); border-radius: 999px; background: var(--bg); color: var(--text); padding: 6px 12px; }
</style>
<div class="wrap">
  <header>
    <h2>Tweet deleter</h2>
    <button class="icon" type="button" aria-label="Configurações Avançadas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/></svg>
    </button>
  </header>
  <div class="logs"></div>
  <div>
    <div class="progress"><span></span></div>
    <div class="status-row"><span class="k">status</span> <span class="pill">idle</span></div>
  </div>
  <section class="quick">
    <h3>Configurações rápidas</h3>
    <label><input type="checkbox" data-field="fromArchive"> Do arquivo</label>
    <label><input type="checkbox" data-field="unretweet" checked> Desfazer retweets</label>
    <label><input type="checkbox" data-field="keepPinned" checked> Manter o fixado</label>
    <label><input type="checkbox" data-field="urlsOnly"> Só com link</label>
    <label><input type="checkbox" data-field="oldTweets"> Tweets antigos</label>
    <div class="dates">
      <label class="date">De <input type="date" data-field="afterDate" value="1900-01-01"></label>
      <label class="date">Até <input type="date" data-field="beforeDate" value="2026-10-30"></label>
    </div>
    <label class="field">Palavras <input type="text" data-field="keywords"></label>
    <label class="field">Ignorar estes IDs <input type="text" data-field="ignoreIds"></label>
    <label class="field">Apagar só estes IDs <input type="text" data-field="onlyIds"></label>
    <div class="file"><span>Arquivo do export</span><button class="file-btn" type="button">Escolher</button></div>
    <button class="primary" type="button">Apagar</button>
  </section>
</div>`

function panelMarkup() {
    return markup
}

function mountPanel(document, view, onStart) {
    const host = document.createElement("div")
    host.style.cssText = "position:fixed;top:0;right:0;width:380px;height:100vh;z-index:2147483647;"
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = markup
    const root = shadow.querySelector(".wrap")
    const logs = shadow.querySelector(".logs")
    const bar = shadow.querySelector(".progress > span")
    const pill = shadow.querySelector(".pill")
    const fileRow = shadow.querySelector(".file")
    let fileText = ""

    function paint() {
        applyTheme(root, sampleTheme(document, view))
    }
    paint()
    const observer = new view.MutationObserver(paint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] })
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] })

    shadow.querySelector("[data-field=fromArchive]").addEventListener("change", (event) => {
        fileRow.classList.toggle("on", event.target.checked)
    })
    shadow.querySelector(".file-btn").addEventListener("click", () => {
        const input = document.createElement("input")
        input.type = "file"
        input.onchange = () => {
            const file = input.files && input.files[0]
            if (!file) return
            const reader = new view.FileReader()
            reader.onload = () => {
                fileText = String(reader.result || "")
            }
            reader.readAsText(file)
        }
        input.click()
    })
    shadow.querySelector(".primary").addEventListener("click", () => {
        const fields = {}
        for (const input of shadow.querySelectorAll("[data-field]")) {
            fields[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value
        }
        onStart(fields, fileText, panel)
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
    document.body.append(host)
    return panel
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

mountPanel(document, window, (fields, fileText, panel) => {
    return begin(fields, fileText, {
        panel,
        run(options) {
            return runDeletion({
                options,
                slots: defaultSlots(),
                env: readEnv(),
                fetch: globalThis.fetch.bind(globalThis),
                sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                log: (line) => panel.log(line),
                onProgress: (value) => panel.progress(value),
                readArchive: async () => fileText,
            })
        },
    })
})

})()
