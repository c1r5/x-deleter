import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defaultSlots } from "../src/core/options.js"
import { parseCapturedRequest } from "../src/core/parse.js"
import { loadSlots, restoreAll, restoreSlot, saveSlot } from "../src/host/storage.js"
import { analyze } from "../src/ui/capture.js"
import { openSlot, presentManual, slotFromForm } from "../src/ui/manual.js"
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

function fetchText(url, options) {
    return `fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});`
}

test("o preenchimento manual grava o mesmo slot que o parser", () => {
    const repliesUrl = `https://x.com/i/api/graphql/xz348nziCm96wndJ1S0MUQ/UserRepliesTimeline?variables=${encodeURIComponent(JSON.stringify({
        userId: "42",
        count: 20,
        withCommunity: true,
    }))}&features=${encodeURIComponent(JSON.stringify({ withVoice: true }))}`
    const fetchReplies = fetchText(repliesUrl, {
        headers: {
            authorization: "Bearer colado",
            "x-client-transaction-id": "tid-respostas",
            "x-client-uuid": "uuid-respostas",
        },
        body: null,
        method: "GET",
    })
    const replies = parseCapturedRequest(fetchReplies)
    const repliesForm = presentManual("replies", replies.slot)
    assert.equal(repliesForm.title, "Buscar respostas")
    assert.equal(repliesForm.search, true)
    assert.match(repliesForm.variables, /\{\{user_id\}\}/)
    assert.match(repliesForm.features, /withVoice/)
    assert.equal(repliesForm.body, "")
    const repliesSaved = slotFromForm("replies", repliesForm, replies.slot)
    assert.equal(repliesSaved.ok, true)
    assert.deepEqual(repliesSaved.slot, replies.slot)

    const repliesBlank = presentManual("replies", replies.slot)
    repliesBlank.variables = repliesBlank.variables.replace("{{user_id}}", "")
    const blockedUser = slotFromForm("replies", repliesBlank, replies.slot)
    assert.equal(blockedUser.ok, false)
    assert.match(blockedUser.error, /\{\{user_id\}\}/)

    const fetchDelete = fetchText("https://x.com/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet", {
        headers: {
            authorization: "Bearer apagar",
            cookie: "ct0=nao-usar",
            "x-client-transaction-id": "tid-apagar",
            "x-client-uuid": "uuid-apagar",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            variables: { tweet_id: "111", dark_request: false },
            queryId: "VaenaVgh5q5ih7kvyVjgtg",
        }),
        method: "POST",
    })
    const deleted = parseCapturedRequest(fetchDelete)
    const deleteForm = presentManual("delete", deleted.slot)
    assert.equal(deleteForm.title, "Apagar tweet")
    assert.equal(deleteForm.search, false)
    assert.match(deleteForm.body, /\{\{tweet_id\}\}/)
    assert.equal(deleteForm.variables, "")
    assert.equal(deleteForm.features, "")
    const deleteSaved = slotFromForm("delete", deleteForm, deleted.slot)
    assert.equal(deleteSaved.ok, true)
    assert.deepEqual(deleteSaved.slot, deleted.slot)

    const storage = memory()
    saveSlot(storage, "replies", repliesSaved.slot)
    saveSlot(storage, "delete", deleteSaved.slot)
    const blank = presentManual("delete", deleted.slot)
    blank.body = JSON.stringify({ variables: { tweet_id: "", dark_request: false }, queryId: "VaenaVgh5q5ih7kvyVjgtg" })
    const blocked = slotFromForm("delete", blank, deleted.slot)
    assert.equal(blocked.ok, false)
    assert.match(blocked.error, /\{\{tweet_id\}\}/)
    assert.equal(loadSlots(storage).delete.body.variables.tweet_id, "{{tweet_id}}")

    const ambiguous = fetchText("https://x.com/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet", {
        headers: { authorization: "Bearer apagar", "x-client-transaction-id": "tid-apagar" },
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
    let opened = null
    analyze(ambiguous, {
        panel: { log() {} },
        saveSlot() { throw new Error("gravou ambíguo") },
        openManual(parsed) { opened = parsed },
    })
    const marked = openSlot("delete", loadSlots(storage), opened)
    assert.equal(marked.search, false)
    assert.match(marked.body, /123456789012345/)
    assert.match(marked.body, /987654321098765/)
    assert.equal(marked.body.includes("{{tweet_id}}"), false)
    assert.deepEqual(marked.candidates, ["body.variables.left", "body.variables.right"])
    assert.equal(loadSlots(storage).delete.transactionId, "tid-apagar")

    const named = openSlot("replies", loadSlots(storage), null)
    assert.equal(named.title, "Buscar respostas")
    assert.match(named.variables, /\{\{user_id\}\}/)
    assert.match(named.features, /withVoice/)

    restoreSlot(storage, "delete")
    assert.deepEqual(loadSlots(storage).delete, defaultSlots().delete)
    assert.equal(loadSlots(storage).replies.transactionId, "tid-respostas")
    restoreAll(storage)
    assert.deepEqual(loadSlots(storage).replies, defaultSlots().replies)
    assert.deepEqual(loadSlots(storage).old, defaultSlots().old)
    assert.deepEqual(loadSlots(storage).delete, defaultSlots().delete)

    const html = panelMarkup()
    assert.match(html, /M15 19 L8 12 L15 5"\/><\/svg>Configurações Avançadas/)
    assert.match(html, />Guardar</)
    assert.match(html, />Restaurar</)
    assert.match(html, /Variáveis/)
    assert.match(html, /Features/)
    assert.match(html, /Corpo/)
    assert.deepEqual([...html.matchAll(/data-slot="([^"]+)"/g)].map((match) => match[1]), ["replies", "old", "delete"])

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    const source = readFileSync(join(root, "src/ui/manual.js"), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "")
    assert.equal(bundle.includes(source), true)
})
