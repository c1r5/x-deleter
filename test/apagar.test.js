import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultOptions, defaultSlots } from "../src/core/options.js"
import { deleteBody, deleteUrl, timelineUrl } from "../src/core/request.js"
import { actionGroups, defaultActions, runDeletion, runExecution, runSearch, toggleAction } from "../src/core/run.js"
import { collectTimeline, parseArchiveText } from "../src/core/select.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const when = "Mon Jun 15 12:00:00 +0000 2020"
const userId = "42"

function legacy(id, text, extra = {}) {
    return {
        id_str: id,
        full_text: text,
        created_at: extra.created_at || when,
        user_id_str: extra.user_id_str || userId,
        entities: { urls: extra.urls || [] },
        retweeted: Boolean(extra.retweeted),
        in_reply_to_status_id_str: extra.in_reply_to_status_id_str || "",
    }
}

function tweetEntry(id, text, extra) {
    return {
        entryId: `tweet-${id}`,
        content: {
            itemContent: {
                tweet_results: {
                    result: { __typename: "Tweet", legacy: legacy(id, text, extra) },
                },
            },
        },
    }
}

function page(entries) {
    return {
        data: {
            user: {
                result: {
                    timeline: {
                        timeline: {
                            instructions: [{ type: "TimelineAddEntries", entries }],
                        },
                    },
                },
            },
        },
    }
}

const entries = [
    tweetEntry("111", "sol na praia"),
    tweetEntry("222", "sol ignorado"),
    tweetEntry("333", "sol de outro", { user_id_str: "99" }),
    {
        entryId: "tweet-555",
        __type: "TimelinePinEntry",
        content: { __typename: "Tweet", legacy: legacy("555", "sol fixado") },
    },
    tweetEntry("666", "sol rt", { retweeted: true }),
    tweetEntry("777", "lua"),
    tweetEntry("444", "sol antigo", { created_at: "Wed Jan 01 12:00:00 +0000 1890" }),
    {
        entryId: "tweet-888",
        content: {
            itemContent: {
                tweet_results: {
                    result: {
                        __typename: "TweetWithVisibilityResults",
                        tweet: { legacy: legacy("888", "sol visivel") },
                    },
                },
            },
        },
    },
    { entryId: "cursor-bottom", content: { value: "next-page" } },
]

function env() {
    return {
        userId,
        username: "conta",
        csrf: "csrf-vivo",
        secChUa: "\"Chromium\";v=\"120\"",
        acceptLanguage: "pt-BR,pt;q=0.9",
        language: "pt",
    }
}

function slotsWithTid() {
    const slots = defaultSlots()
    slots.replies.transactionId = "tid-respostas"
    slots.old.transactionId = "tid-antigos"
    slots.delete.transactionId = "tid-apagar"
    return slots
}

test("percorre a timeline, o arquivo e apaga", async () => {
    const options = defaultOptions()
    options.keywords = ["sol"]
    options.ignoreIds = ["222"]
    const logs = []
    let calls = []
    const ctx = {
        options,
        slots: defaultSlots(),
        env: env(),
        fetch: async (url, init) => {
            calls.push({ url, init })
            return { ok: true, status: 200, json: async () => page(entries) }
        },
        sleep: async () => {},
        log: (line) => logs.push(line),
        readArchive: async () => "",
    }

    const missing = await runDeletion(ctx)
    assert.equal(missing.status, "fail")
    assert.equal(missing.missing, "Buscar respostas")
    assert.equal(calls.length, 0)
    assert.match(logs.at(-1), /Buscar respostas/)
    const missingSearch = await runSearch(ctx)
    assert.equal(missingSearch.status, "fail")
    assert.deepEqual(missingSearch.tweets, [])
    assert.equal(calls.length, 0)

    calls = []
    logs.length = 0
    ctx.slots = slotsWithTid()
    const done = await runDeletion(ctx)
    assert.equal(done.status, "done")
    assert.equal(calls.filter((call) => call.init.method === "GET").length, 1)
    assert.equal(calls[0].url, timelineUrl("replies", userId, null))
    assert.match(calls[0].url, /rweb_lists_timeline_redesign_enabled/)
    assert.equal(calls[0].init.headers["x-csrf-token"], "csrf-vivo")
    assert.equal(calls[0].init.headers["x-client-transaction-id"], "tid-respostas")

    const deleted = calls.filter((call) => call.init.method === "POST").map((call) => call.init.body)
    assert.deepEqual(deleted, ["111", "666", "888"].map((id) => deleteBody(id)))
    assert.equal(calls.find((call) => call.init.method === "POST").url, deleteUrl())
    assert.match(deleted[0], /VaenaVgh5q5ih7kvyVjgtg/)
    assert.equal(deleted[0].includes("nxpZCY2K"), false)
    assert.match(calls.find((call) => call.init.method === "POST").url, /nxpZCY2K-I6QoFHAHeojFQ/)

    calls = []
    const found = []
    const searched = await runSearch({
        ...ctx,
        options,
        fetch: async (url, init) => {
            calls.push({ url, init })
            return { ok: true, status: 200, json: async () => page(entries) }
        },
        onTweet(tweet) { found.push(tweet) },
    })
    assert.equal(searched.status, "done")
    assert.deepEqual(found.map((tweet) => tweet.id), ["111", "666", "888"])
    assert.equal(found[0].type, "post")
    assert.equal(found[0].text, "sol na praia")
    assert.equal(found[1].type, "repost")
    assert.equal(found[2].type, "post")
    assert.equal(calls.some((call) => call.init.method === "POST"), false)
    assert.deepEqual(calls.filter((call) => call.init.method === "GET").map((call) => call.url), [
        timelineUrl("replies", userId, null),
        timelineUrl("old", userId, null),
    ])
    assert.equal(new Set(found.map((tweet) => tweet.id)).size, found.length)
    assert.match(logs.join("\n"), /🔎 Buscar respostas/)
    assert.match(logs.join("\n"), /🔎 Buscar tweets antigos/)
    assert.match(logs.join("\n"), /➕ 666 repost/)

    const sleeps = []
    const execLogs = []
    const execCalls = []
    const executed = await runExecution({
        ...ctx,
        slots: slotsWithTid(),
        sleep: async (ms) => { sleeps.push(ms) },
        log: (line) => execLogs.push(line),
        fetch: async (url, init) => {
            execCalls.push({ url, init })
            return { ok: true, status: 200, json: async () => ({}) }
        },
    }, found.map((tweet) => ({ ...tweet, selected: true })), defaultActions())
    assert.equal(executed.status, "done")
    assert.deepEqual(execCalls.map((call) => JSON.parse(call.init.body).variables.tweet_id), ["666", "111", "888"])
    assert.equal(sleeps.filter((ms) => ms === 30000).length, 1)
    assert.equal(sleeps.includes(1000), true)
    assert.match(execLogs.join("\n"), /▶️ unretweet, 1 itens/)
    assert.match(execLogs.join("\n"), /▶️ delete posts, 2 itens/)
    assert.match(execLogs.join("\n"), /🏁 execução terminou/)
    assert.equal(execLogs.some((line) => line.includes("delete replies")), false)

    const nuked = toggleAction(defaultActions(), "nuke", true)
    assert.equal(nuked.nuke, true)
    assert.equal(nuked.unretweet, false)
    assert.equal(nuked.deletePosts, false)
    assert.equal(nuked.deleteReplies, false)
    const restored = toggleAction(nuked, "deletePosts", true)
    assert.equal(restored.nuke, false)
    assert.equal(restored.deletePosts, true)
    assert.deepEqual(actionGroups(nuked, found.map((tweet) => ({ ...tweet, selected: true }))).map((group) => group.type), ["repost", "post"])
    assert.deepEqual(actionGroups(defaultActions(), [{ id: "1", type: "post", selected: false }]), [])

    const rateWaits = []
    const rateLogs = []
    let tries = 0
    const rated = await runExecution({
        ...ctx,
        slots: slotsWithTid(),
        sleep: async (ms) => { rateWaits.push(ms) },
        log: (line) => rateLogs.push(line),
        fetch: async () => {
            tries += 1
            if (tries === 1) return { ok: false, status: 429 }
            if (tries === 2) return { ok: false, status: 429 }
            return { ok: true, status: 200, json: async () => ({}) }
        },
    }, [{ id: "111", type: "post", text: "", date: "", selected: true }], { nuke: false, unretweet: false, deletePosts: true, deleteReplies: false })
    assert.equal(rated.status, "done")
    assert.deepEqual(rateWaits.slice(0, 2), [60000, 120000])
    assert.match(rateLogs.join("\n"), /⏳ limite de taxa, esperando 60 s/)
    assert.match(rateLogs.join("\n"), /⏳ limite de taxa, esperando 120 s/)

    const blockedDelete = await runExecution({
        ...ctx,
        slots: defaultSlots(),
        log: (line) => logs.push(line),
    }, found, defaultActions())
    assert.equal(blockedDelete.status, "fail")
    assert.equal(blockedDelete.missing, "Apagar tweet")

    calls = []
    const listed = await runSearch({
        ...ctx,
        options: { ...options, onlyIds: ["111", ""] },
        fetch: async () => { throw new Error("nao buscar") },
    })
    assert.deepEqual(listed.tweets, [{ id: "111", type: "post", text: "", date: "" }])

    calls = []
    const replies = []
    const replySearch = await runSearch({
        ...ctx,
        options,
        fetch: async (url, init) => {
            calls.push({ url, init })
            return { ok: true, status: 200, json: async () => page([tweetEntry("901", "sol resposta", { in_reply_to_status_id_str: "50" })]) }
        },
        onTweet(tweet) { replies.push(tweet) },
    })
    assert.equal(replySearch.status, "done")
    assert.equal(replies.length, 1)
    assert.equal(replies[0].type, "reply")
    assert.equal(calls.filter((call) => call.init.method === "GET").length, 2)
    assert.equal(calls.some((call) => call.init.method === "POST"), false)

    let ready = 0
    const halted = await runSearch({
        ...ctx,
        options,
        isStopped: () => true,
        onReady() { ready += 1 },
        fetch: async () => { throw new Error("nao buscar") },
    })
    assert.equal(ready, 1)
    assert.deepEqual(halted.tweets, [])

    const hidden = collectTimeline(tweetEntry("666", "sol rt", { retweeted: true }), {
        ...options,
        unretweet: false,
    }, userId)
    assert.deepEqual(hidden.ids, [])

    calls = []
    ctx.options = { ...options, oldTweets: true }
    ctx.fetch = async (url, init) => {
        calls.push({ url, init })
        return { ok: true, status: 200, json: async () => page([tweetEntry("111", "sol na praia")]) }
    }
    const old = await runDeletion(ctx)
    assert.equal(old.status, "done")
    assert.match(calls[0].url, /withQuickPromoteEligibilityTweetFields/)
    assert.equal(calls[0].url.includes("rweb_lists_timeline_redesign_enabled"), false)
    assert.equal(calls[0].init.headers["x-client-transaction-id"], "tid-antigos")

    const archive = `window.YTD.tweets.part0 = ${JSON.stringify([
        { tweet: { id_str: "a1", full_text: "RT @z: sol", created_at: when, in_reply_to_user_id_str: "7" } },
        { tweet: { id_str: "a2", full_text: "sol sem rt", created_at: when, in_reply_to_user_id_str: "7" } },
        { tweet: { id_str: "a3", full_text: "RT @z: sol", created_at: when, in_reply_to_user_id_str: userId } },
    ])}`
    calls = []
    ctx.options = { ...options, fromArchive: true, oldTweets: false }
    ctx.readArchive = async () => archive
    ctx.fetch = async (url, init) => {
        calls.push({ url, init })
        return { ok: true, status: 200, json: async () => ({}) }
    }
    const fromFile = await runDeletion(ctx)
    assert.equal(fromFile.status, "done")
    assert.deepEqual(parseArchiveText(archive).map((item) => item.tweet.id_str), ["a1", "a2", "a3"])
    assert.deepEqual(calls.map((call) => call.init.body), [deleteBody("a1")])
    const archived = await runSearch({
        ...ctx,
        options: { ...options, fromArchive: true },
        fetch: async () => { throw new Error("nao buscar") },
        readArchive: async () => archive,
    })
    assert.deepEqual(archived.tweets.map((tweet) => tweet.id), ["a1", "a2"])

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    assert.equal(bundle.includes("import "), false)
    assert.match(bundle, /VaenaVgh5q5ih7kvyVjgtg/)
    assert.match(bundle, /transactionId: ""/)
    assert.equal(bundle.includes("nxxhxz"), false)
})
