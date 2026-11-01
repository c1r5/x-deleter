import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { optionsFromFields } from "../src/ui/settings.js"
import { begin } from "../src/ui/session.js"
import { panelMarkup } from "../src/ui/panel.js"
import { isDark, sampleTheme } from "../src/ui/theme.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function fakeDocument(colors, scheme) {
    return {
        body: {},
        documentElement: { style: { colorScheme: scheme } },
        querySelector: () => ({ href: "/" }),
        querySelectorAll: () => [],
        viewColors: colors,
    }
}

function fakeView(document) {
    return {
        getComputedStyle(node) {
            if (node && node.href) return { color: document.viewColors.accent }
            return document.viewColors
        },
    }
}

test("o painel usa as configurações rápidas e o tema da página", async () => {
    const light = sampleTheme(fakeDocument({
        backgroundColor: "rgb(255, 255, 255)",
        color: "rgb(15, 20, 25)",
        borderTopColor: "rgb(239, 243, 244)",
        accent: "rgb(29, 155, 240)",
    }, "light"), fakeView(fakeDocument({
        backgroundColor: "rgb(255, 255, 255)",
        color: "rgb(15, 20, 25)",
        borderTopColor: "rgb(239, 243, 244)",
        accent: "rgb(29, 155, 240)",
    }, "light")))
    assert.equal(light.scheme, "light")
    assert.equal(isDark(light.bg), false)
    assert.equal(light.accent, "rgb(29, 155, 240)")

    const darkDoc = fakeDocument({
        backgroundColor: "rgb(0, 0, 0)",
        color: "rgb(231, 233, 234)",
        borderTopColor: "rgb(47, 51, 54)",
        accent: "rgb(29, 155, 240)",
    }, "")
    const dark = sampleTheme(darkDoc, fakeView(darkDoc))
    assert.equal(dark.scheme, "dark")
    assert.equal(dark.bg, "rgb(0, 0, 0)")

    const seen = []
    const panel = {
        log(line) { seen.push(line) },
        setStatus(status) { seen.push(status) },
    }
    const emptyFile = await begin({ fromArchive: true }, "", {
        panel,
        run: async () => ({ status: "done" }),
    })
    assert.equal(emptyFile.status, "fail")
    assert.equal(seen.at(-1), "fail")
    assert.match(seen[0], /tweets\.js/)

    const optionsSeen = []
    const started = await begin({
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        keywords: "sol, mar",
        ignoreIds: "222",
        onlyIds: "",
        afterDate: "1900-01-01",
        beforeDate: "2026-10-30",
    }, "", {
        panel,
        run: async (options) => {
            optionsSeen.push(options)
            panel.log("0/1")
            return { status: "done" }
        },
    })
    assert.equal(started.status, "done")
    assert.deepEqual(optionsSeen[0], optionsFromFields({
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        keywords: "sol, mar",
        ignoreIds: "222",
        onlyIds: "",
        afterDate: "1900-01-01",
        beforeDate: "2026-10-30",
    }))
    assert.deepEqual(optionsSeen[0].keywords, ["sol", "mar"])
    assert.deepEqual(optionsSeen[0].onlyIds, [])
    assert.equal(seen.at(-1), "done")

    const html = panelMarkup()
    assert.match(html, /Tweet deleter/)
    assert.match(html, /Configurações rápidas/)
    assert.match(html, />Apagar</)
    assert.equal(html.includes("Drop Your File Here"), false)

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    assert.equal(bundle.includes("Drop Your File Here"), false)
    assert.match(bundle, /Tweet deleter/)
})
