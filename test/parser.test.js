import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultOptions } from "../src/core/options.js"
import { parseCapturedRequest } from "../src/core/parse.js"
import { requestFromSlot } from "../src/core/request.js"
import { runDeletion } from "../src/core/run.js"
import { configKey, loadSlots, saveSlot } from "../src/host/storage.js"
import { analyze } from "../src/ui/capture.js"
import { panelMarkup } from "../src/ui/panel.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function memory() {
    const data = new Map()
    return {
        getItem(key) { return data.has(key) ? data.get(key) : null },
        setItem(key, value) { data.set(key, String(value)) },
        removeItem(key) { data.delete(key) },
    }
}

function query(variables, features) {
    return `variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`
}

function fetchText(url, options) {
    return `fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});`
}

test("o parser grava fetch e cURL nos quatro slots", async () => {
    const repliesUrl = `https://x.com/i/api/graphql/xz348nziCm96wndJ1S0MUQ/UserRepliesTimeline?${query({
        userId: "42",
        count: 20,
        includePromotedContent: true,
        withCommunity: true,
        withVoice: true,
        withV2Timeline: true,
    }, { rweb_lists_timeline_redesign_enabled: true })}`
    const fetchReplies = fetchText(repliesUrl, {
        headers: {
            authorization: "Bearer colado",
            cookie: "ct0=nao-usar; twid=u%3D1",
            "content-length": "0",
            host: "x.com",
            "user-agent": "Mozilla",
            "x-client-transaction-id": "tid-respostas",
            "x-client-uuid": "uuid-respostas",
            "x-csrf-token": "csrf-colado",
        },
        body: null,
        method: "GET",
    })
    const replies = parseCapturedRequest(fetchReplies)
    assert.equal(replies.ok, true)
    assert.equal(replies.slotKey, "replies")
    assert.equal(replies.slot.label, "Buscar respostas")
    assert.equal(replies.slot.variables.userId, "{{user_id}}")
    assert.equal(replies.slot.transactionId, "tid-respostas")
    assert.equal(JSON.stringify(replies.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(replies.slot).includes("csrf-colado"), false)
    assert.equal(JSON.stringify(replies.slot).includes("user-agent"), false)
    assert.equal(replies.slot.fieldToggles, null)

    const replyVariables = {
        userId: "111111111111111111",
        count: 20,
        includePromotedContent: true,
        withCommunity: true,
        withVoice: true,
    }
    const replyFeatures = { rweb_video_screen_enabled: false, verified_phone_label_enabled: false }
    const replyToggles = { withPayments: false, withArticlePlainText: false }
    const replyUrl = `https://x.com/i/api/graphql/e2U1WlALwVhjkDBJnkcLnA/UserRepliesTimeline?${query(replyVariables, replyFeatures)}&fieldToggles=${encodeURIComponent(JSON.stringify(replyToggles))}`
    const curlReplies = [
        `curl --url '${replyUrl}' \\`,
        "  -H 'accept: */*' \\",
        "  -H 'authorization: Bearer teste' \\",
        "  -H 'content-type: application/json' \\",
        "  -b 'ct0=nao-usar; auth_token=segredo' \\",
        "  -H 'user-agent: Mozilla/5.0' \\",
        "  -H 'x-client-transaction-id: tid-url' \\",
        "  -H 'x-csrf-token: csrf-colado' \\",
        "  -H 'x-twitter-active-user: yes'",
    ].join("\n")
    const fromUrl = parseCapturedRequest(curlReplies)
    assert.equal(fromUrl.ok, true)
    assert.equal(fromUrl.ambiguous, false)
    assert.equal(fromUrl.slotKey, "replies")
    assert.equal(fromUrl.slot.label, "Buscar respostas")
    assert.equal(fromUrl.slot.variables.userId, "{{user_id}}")
    assert.equal(fromUrl.slot.transactionId, "tid-url")
    assert.deepEqual(fromUrl.slot.fieldToggles, replyToggles)
    assert.equal(fromUrl.slot.features.rweb_video_screen_enabled, false)
    assert.equal(JSON.stringify(fromUrl.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(fromUrl.slot).includes("auth_token"), false)
    assert.equal(JSON.stringify(fromUrl.slot).includes("csrf-colado"), false)
    const sent = requestFromSlot(fromUrl.slot, { userId: "42" })
    assert.match(sent.url, /UserRepliesTimeline/)
    assert.match(sent.url, /fieldToggles=/)
    assert.match(sent.url, /%22userId%22%3A%2242%22/)
    assert.equal(sent.url.includes("111111111111111111"), false)
    assert.equal(sent.url.includes("nao-usar"), false)

    const oldUrl = `https://x.com/i/api/graphql/QUERYID/UserTweets?${query({
        userId: "99",
        count: 20,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
    }, { withVoice: true })}`
    const curlOld = [
        `curl '${oldUrl}' \\`,
        "  -H 'authorization: Bearer antigo' \\",
        "  -H 'cookie: ct0=outro-cookie' \\",
        "  -H 'content-length: 1' \\",
        "  -H 'host: x.com' \\",
        "  -H 'user-agent: Mozilla' \\",
        "  -H 'x-client-transaction-id: tid-antigos' \\",
        "  -H 'x-client-uuid: uuid-antigos' \\",
        "  -H 'x-csrf-token: csrf-curl'",
    ].join("\n")
    const old = parseCapturedRequest(curlOld)
    assert.equal(old.ok, true)
    assert.equal(old.slotKey, "old")
    assert.equal(old.slot.label, "Buscar tweets antigos")
    assert.match(old.slot.path, /UserTweets$/)
    assert.equal(old.slot.variables.userId, "{{user_id}}")
    assert.equal(old.slot.transactionId, "tid-antigos")
    assert.equal(JSON.stringify(old.slot).includes("outro-cookie"), false)
    assert.equal(JSON.stringify(old.slot).includes("csrf-curl"), false)

    const postsUrl = `https://x.com/i/api/graphql/0L_XictlTdXhxJyxhMDxQA/UserOriginalsTimeline?${query({
        userId: "111111111111111111",
        count: 40,
        cursor: "CURSOR-DE-TESTE",
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
    }, { rweb_video_screen_enabled: false })}&fieldToggles=${encodeURIComponent(JSON.stringify({ withPayments: false, withArticlePlainText: false }))}`
    const curlPosts = [
        `curl --url '${postsUrl}' \\`,
        "  -H 'authorization: Bearer posts' \\",
        "  -b 'ct0=nao-usar; auth_token=segredo' \\",
        "  -H 'x-client-transaction-id: tid-posts' \\",
        "  -H 'x-csrf-token: csrf-colado'",
    ].join("\n")
    const posts = parseCapturedRequest(curlPosts)
    assert.equal(posts.ok, true)
    assert.equal(posts.ambiguous, false)
    assert.equal(posts.slotKey, "old")
    assert.equal(posts.slot.label, "Buscar tweets antigos")
    assert.match(posts.slot.path, /UserOriginalsTimeline$/)
    assert.equal(posts.slot.variables.userId, "{{user_id}}")
    assert.equal(posts.slot.variables.cursor, "{{cursor}}")
    assert.equal(posts.slot.variables.count, 40)
    assert.equal(posts.slot.transactionId, "tid-posts")
    assert.deepEqual(posts.slot.fieldToggles, { withPayments: false, withArticlePlainText: false })
    assert.equal(JSON.stringify(posts.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(posts.slot).includes("csrf-colado"), false)
    const postsPage = requestFromSlot(posts.slot, { userId: "42", cursor: "proxima" })
    assert.match(postsPage.url, /UserOriginalsTimeline/)
    assert.match(postsPage.url, /fieldToggles=/)
    assert.match(postsPage.url, /%22cursor%22%3A%22proxima%22/)
    assert.equal(postsPage.url.includes("CURSOR-DE-TESTE"), false)
    assert.equal(postsPage.url.includes("111111111111111111"), false)

    const repostsUrl = `https://x.com/i/api/graphql/q5tCz6UCo5FOK8DSqsjS2A/UserRepostsTimeline?${query({
        userId: "111111111111111111",
        count: 20,
        includePromotedContent: true,
        withVoice: true,
    }, { rweb_video_screen_enabled: false })}&fieldToggles=${encodeURIComponent(JSON.stringify({ withPayments: false, withArticlePlainText: false }))}`
    const curlReposts = [
        `curl --url '${repostsUrl}' \\`,
        "  -H 'authorization: Bearer reposts' \\",
        "  -b 'ct0=nao-usar; auth_token=segredo' \\",
        "  -H 'x-client-transaction-id: tid-reposts' \\",
        "  -H 'x-csrf-token: csrf-colado'",
    ].join("\n")
    const reposts = parseCapturedRequest(curlReposts)
    assert.equal(reposts.ok, true)
    assert.equal(reposts.ambiguous, false)
    assert.equal(reposts.slotKey, "reposts")
    assert.equal(reposts.slot.label, "Buscar reposts")
    assert.equal(reposts.slot.method, "GET")
    assert.match(reposts.slot.path, /UserRepostsTimeline$/)
    assert.equal(reposts.slot.variables.userId, "{{user_id}}")
    assert.equal(reposts.slot.variables.count, 20)
    assert.equal(reposts.slot.variables.cursor, "{{cursor}}")
    assert.equal(reposts.slot.variables.withVoice, true)
    assert.equal(reposts.slot.variables.withCommunity, undefined)
    assert.equal(reposts.slot.transactionId, "tid-reposts")
    assert.deepEqual(reposts.slot.fieldToggles, { withPayments: false, withArticlePlainText: false })
    assert.equal(JSON.stringify(reposts.slot).includes("111111111111111111"), false)
    assert.equal(JSON.stringify(reposts.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(reposts.slot).includes("segredo"), false)
    assert.equal(JSON.stringify(reposts.slot).includes("csrf-colado"), false)
    const repostsFirst = requestFromSlot(reposts.slot, { userId: "42" })
    assert.equal(repostsFirst.method, "GET")
    assert.match(repostsFirst.url, /UserRepostsTimeline/)
    assert.match(repostsFirst.url, /fieldToggles=/)
    assert.match(repostsFirst.url, /%22userId%22%3A%2242%22/)
    assert.equal(repostsFirst.url.includes("cursor"), false)
    assert.equal(repostsFirst.url.includes("111111111111111111"), false)
    const repostsNext = requestFromSlot(reposts.slot, { userId: "42", cursor: "proxima" })
    assert.match(repostsNext.url, /%22cursor%22%3A%22proxima%22/)

    const curlDelete = [
        "curl --url 'https://x.com/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet' \\",
        "  -H 'authorization: Bearer apagar' \\",
        "  -H 'content-type: application/json' \\",
        "  -b 'ct0=nao-usar; auth_token=segredo; g_state={\"i_l\":0}; personalization_id=\"v1_x==\"' \\",
        "  -H 'referer: https://x.com/conta/with_replies' \\",
        "  -H 'sec-ch-ua-platform: \"Linux\"' \\",
        "  -H 'x-client-transaction-id: tid-apagar-curl' \\",
        "  -H 'x-csrf-token: csrf-colado' \\",
        "  --data-raw '{\"variables\":{\"tweet_id\":\"222222222222222222\"},\"queryId\":\"nxpZCY2K-I6QoFHAHeojFQ\"}'",
    ].join("\n")
    const fromCurlDelete = parseCapturedRequest(curlDelete)
    assert.equal(fromCurlDelete.ok, true)
    assert.equal(fromCurlDelete.ambiguous, false)
    assert.equal(fromCurlDelete.slotKey, "delete")
    assert.equal(fromCurlDelete.slot.label, "Apagar tweet")
    assert.equal(fromCurlDelete.slot.method, "POST")
    assert.match(fromCurlDelete.slot.path, /\/nxpZCY2K-I6QoFHAHeojFQ\/DeleteTweet$/)
    assert.equal(fromCurlDelete.slot.body.variables.tweet_id, "{{tweet_id}}")
    assert.equal(fromCurlDelete.slot.body.variables.dark_request, undefined)
    assert.equal(fromCurlDelete.slot.body.queryId, "nxpZCY2K-I6QoFHAHeojFQ")
    assert.equal(fromCurlDelete.slot.transactionId, "tid-apagar-curl")
    assert.equal(fromCurlDelete.slot.platform, "\"Linux\"")
    assert.equal(JSON.stringify(fromCurlDelete.slot).includes("222222222222222222"), false)
    assert.equal(JSON.stringify(fromCurlDelete.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(fromCurlDelete.slot).includes("segredo"), false)
    assert.equal(JSON.stringify(fromCurlDelete.slot).includes("csrf-colado"), false)
    assert.equal(JSON.stringify(fromCurlDelete.slot).includes("VaenaVgh5q5ih7kvyVjgtg"), false)
    const sentDelete = requestFromSlot(fromCurlDelete.slot, { tweetId: "333" })
    assert.equal(sentDelete.method, "POST")
    assert.match(sentDelete.url, /\/nxpZCY2K-I6QoFHAHeojFQ\/DeleteTweet$/)
    assert.match(sentDelete.body, /"tweet_id":"333"/)
    assert.match(sentDelete.body, /"queryId":"nxpZCY2K-I6QoFHAHeojFQ"/)
    assert.equal(sentDelete.body.includes("dark_request"), false)
    assert.equal(sentDelete.body.includes("222222222222222222"), false)

    const fetchDelete = fetchText("https://x.com/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet", {
        headers: {
            authorization: "Bearer apagar",
            cookie: "ct0=nao-usar",
            "content-length": "20",
            host: "x.com",
            "user-agent": "Mozilla",
            "x-client-transaction-id": "tid-apagar",
            "x-client-uuid": "uuid-apagar",
            "x-csrf-token": "csrf-colado",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            variables: { tweet_id: "111", dark_request: false },
            queryId: "VaenaVgh5q5ih7kvyVjgtg",
        }),
        method: "POST",
    })
    const deleted = parseCapturedRequest(fetchDelete)
    assert.equal(deleted.ok, true)
    assert.equal(deleted.slotKey, "delete")
    assert.equal(deleted.slot.label, "Apagar tweet")
    assert.equal(deleted.slot.body.variables.tweet_id, "{{tweet_id}}")
    assert.equal(deleted.slot.transactionId, "tid-apagar")
    assert.equal(JSON.stringify(deleted.slot).includes("nao-usar"), false)
    assert.equal(JSON.stringify(deleted.slot).includes("csrf-colado"), false)

    const ambiguous = fetchText("https://x.com/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet", {
        headers: {
            authorization: "Bearer apagar",
            "x-client-transaction-id": "tid-apagar",
            "x-client-uuid": "uuid-apagar",
        },
        body: JSON.stringify({
            variables: {
                tweet_id: "111",
                dark_request: false,
                left: "123456789012345",
                right: "987654321098765",
            },
            queryId: "VaenaVgh5q5ih7kvyVjgtg",
        }),
        method: "POST",
    })
    const logs = []
    const refused = analyze(ambiguous, {
        panel: { log(line) { logs.push(line) } },
        saveSlot() { throw new Error("gravou ambíguo") },
    })
    assert.equal(refused.ambiguous, true)
    assert.deepEqual(refused.candidates, ["body.variables.left", "body.variables.right"])
    assert.equal(refused.slot.body.variables.left, "123456789012345")
    assert.equal(refused.slot.body.variables.tweet_id, "111")
    assert.match(logs[0], /placeholder ambíguo: body\.variables\.left, body\.variables\.right/)

    const storage = memory()
    const panel = { log(line) { logs.push(line) } }
    const savedReplies = analyze(fetchReplies, { panel, saveSlot: (key, slot) => saveSlot(storage, key, slot) })
    const savedOld = analyze(curlOld, { panel, saveSlot: (key, slot) => saveSlot(storage, key, slot) })
    const savedReposts = analyze(curlReposts, { panel, saveSlot: (key, slot) => saveSlot(storage, key, slot) })
    const savedDelete = analyze(curlDelete, { panel, saveSlot: (key, slot) => saveSlot(storage, key, slot) })
    assert.equal(savedReplies.slot.label, "Buscar respostas")
    assert.equal(savedOld.slot.label, "Buscar tweets antigos")
    assert.equal(savedReposts.slot.label, "Buscar reposts")
    assert.equal(savedDelete.slot.label, "Apagar tweet")
    assert.match(logs.join("\n"), /Buscar respostas/)
    const stored = JSON.parse(storage.getItem(configKey))
    assert.equal(stored.replies.transactionId, "tid-respostas")
    assert.equal(stored.old.transactionId, "tid-antigos")
    assert.equal(stored.reposts.transactionId, "tid-reposts")
    assert.equal(stored.reposts.variables.userId, "{{user_id}}")
    assert.equal(stored.delete.transactionId, "tid-apagar-curl")
    assert.equal(stored.delete.body.queryId, "nxpZCY2K-I6QoFHAHeojFQ")
    assert.equal(stored.delete.body.variables.dark_request, undefined)

    const calls = []
    const ran = await runDeletion({
        options: { ...defaultOptions(), onlyIds: ["111"] },
        slots: loadSlots(storage),
        env: {
            userId: "42",
            username: "conta",
            csrf: "csrf-do-cookie",
            secChUa: "\"Chromium\";v=\"120\"",
            acceptLanguage: "pt-BR",
            language: "pt",
        },
        fetch: async (url, init) => {
            calls.push({ url, init })
            return { ok: true, status: 200, json: async () => ({}) }
        },
        sleep: async () => {},
        log() {},
        readArchive: async () => "",
    })
    assert.equal(ran.status, "done")
    assert.equal(calls[0].init.headers["x-csrf-token"], "csrf-do-cookie")
    assert.equal(calls[0].init.headers.cookie, undefined)
    assert.match(calls[0].init.body, /"tweet_id":"111"/)
    assert.match(calls[0].init.body, /"queryId":"nxpZCY2K-I6QoFHAHeojFQ"/)
    assert.equal(calls[0].init.body.includes("dark_request"), false)
    assert.equal(calls[0].init.body.includes("csrf-colado"), false)
    assert.equal(calls[0].init.body.includes("VaenaVgh5q5ih7kvyVjgtg"), false)
    assert.match(calls[0].url, /\/nxpZCY2K-I6QoFHAHeojFQ\/DeleteTweet/)

    const repostCalls = []
    const reposted = await runDeletion({
        options: { ...defaultOptions(), reposts: true },
        slots: loadSlots(storage),
        env: {
            userId: "42",
            username: "conta",
            csrf: "csrf-do-cookie",
            secChUa: "\"Chromium\";v=\"120\"",
            acceptLanguage: "pt-BR",
            language: "pt",
        },
        fetch: async (url, init) => {
            repostCalls.push({ url, init })
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    data: { user: { result: { timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [] }] } } } } },
                }),
            }
        },
        sleep: async () => {},
        log() {},
        readArchive: async () => "",
    })
    assert.equal(reposted.status, "done")
    assert.match(repostCalls[0].url, /UserRepostsTimeline/)
    assert.match(repostCalls[0].url, /%22userId%22%3A%2242%22/)
    assert.equal(repostCalls[0].url.includes("cursor"), false)
    assert.equal(repostCalls[0].url.includes("111111111111111111"), false)
    assert.equal(repostCalls[0].init.headers["x-client-transaction-id"], "tid-reposts")
    assert.equal(repostCalls[0].init.headers["x-csrf-token"], "csrf-do-cookie")
    assert.equal(repostCalls[0].init.referrer, "https://x.com/conta/reposts")

    const html = panelMarkup()
    assert.match(html, /Configurações Avançadas/)
    assert.match(html, />Analisar</)
    assert.match(html, /Buscar respostas/)
    assert.match(html, /Buscar tweets antigos/)
    assert.match(html, /Buscar reposts/)
    assert.match(html, /data-field="reposts"/)
    assert.match(html, /Apagar tweet/)
    assert.match(html, /M15 19 L8 12 L15 5/)
    assert.match(html, /Tweet deleter/)

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    const source = readFileSync(join(root, "src/core/parse.js"), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "")
    assert.equal(bundle.includes(source), true)
    assert.equal(bundle.includes("import "), false)
})
