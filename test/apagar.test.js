import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultOptions, defaultSlots } from "../src/core/options.js"
import { deleteBody, deleteUrl, timelineUrl } from "../src/core/request.js"
import { runDeletion } from "../src/core/run.js"
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

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    assert.equal(bundle.includes("import "), false)
    assert.match(bundle, /VaenaVgh5q5ih7kvyVjgtg/)
    assert.match(bundle, /transactionId: ""/)
    assert.equal(bundle.includes("nxxhxz"), false)
})
