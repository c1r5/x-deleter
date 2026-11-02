import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { daysAgoStamp, defaultOptions, todayStamp } from "../src/core/options.js"
import { optionsFromFields } from "../src/ui/settings.js"
import { begin } from "../src/ui/session.js"
import { modalMarkup, showDate } from "../src/ui/modal.js"
import { panelMarkup, showAnalyze } from "../src/ui/panel.js"
import { attachPanel } from "../src/ui/place.js"
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

function slot() {
    return {
        isConnected: true,
        children: [],
        prepend(node) {
            this.children = this.children.filter((child) => child !== node)
            this.children.unshift(node)
            node.parentElement = this
        },
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

    const post = { backgroundColor: "rgb(29, 155, 240)", borderTopColor: "rgba(0, 0, 0, 0)" }
    const column = { backgroundColor: "rgba(0, 0, 0, 0)", borderTopColor: "rgb(47, 51, 54)" }
    const xPage = {
        body: {
            backgroundColor: "rgb(0, 0, 0)",
            color: "rgb(231, 233, 234)",
            borderTopColor: "rgb(47, 51, 54)",
        },
        documentElement: { style: { colorScheme: "dark" } },
        querySelector(selector) {
            if (selector === "a[href]") return { href: "/" }
            if (selector === '[data-testid="sidebarColumn"]') return column
            return null
        },
        querySelectorAll: () => [post],
    }
    const xTheme = sampleTheme(xPage, {
        getComputedStyle(node) {
            if (node && node.href) return { color: "rgb(29, 155, 240)" }
            if (node === column || node === post) return node
            return xPage.body
        },
    })
    assert.equal(xTheme.bg, "rgb(0, 0, 0)")
    assert.equal(xTheme.surface, "rgb(0, 0, 0)")
    assert.equal(xTheme.accent, "rgb(29, 155, 240)")
    assert.equal(xTheme.line, "rgb(47, 51, 54)")

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
    assert.equal(optionsFromFields({ keepPinned: true }).unretweet, true)
    assert.equal(optionsFromFields({ keepPinned: true }).beforeDate, todayStamp())
    assert.equal(optionsFromFields({ keepPinned: true }).afterDate, daysAgoStamp(2))
    assert.equal(defaultOptions().beforeDate, todayStamp())
    assert.equal(defaultOptions().afterDate, daysAgoStamp(2))

    const html = panelMarkup()
    assert.match(html, /Tweet deleter/)
    assert.match(html, /Configurações rápidas/)
    assert.match(html, />Buscar</)
    assert.match(html, /class="quick-head"/)
    assert.match(html, /data-action="import" aria-label="Importar"/)
    assert.equal(html.includes("import-label"), false)
    assert.equal(html.includes(">Importar<"), false)
    assert.match(html, /\.screen \{[^}]*flex: 0 1 auto/)
    assert.match(html, /\.screen\.main\.on \{[^}]*flex: 0 1 auto/)
    assert.equal(html.includes("Do arquivo"), false)
    assert.equal(html.includes("Desfazer retweets"), false)
    assert.equal(html.includes("Tweets antigos"), false)
    assert.equal(html.includes('data-field="unretweet"'), false)
    assert.equal(html.includes('data-field="oldTweets"'), false)
    assert.equal(html.includes('data-field="reposts"'), false)
    assert.equal(html.includes(">Escolher<"), false)
    assert.match(html, /Manter o fixado/)
    assert.match(html, /Só com link/)
    assert.equal(html.includes(">Apagar<"), false)
    const modal = modalMarkup()
    assert.match(modal, /Tweets encontrados/)
    assert.match(modal, />Fechar</)
    assert.match(modal, />Executar</)
    assert.match(modal, /> Nuke</)
    assert.match(modal, /data-choice="unretweet" checked/)
    assert.match(modal, /data-choice="deletePosts" checked/)
    assert.match(modal, /data-choice="deleteReplies" checked/)
    assert.equal(modal.includes('data-choice="nuke" checked'), false)
    assert.match(modal, /aria-label="Carregando"/)
    assert.match(modal, /Nenhum tweet encontrado/)
    assert.match(modal, /\.empty \{[^}]*color: var\(--muted\)/)
    assert.match(modal, /data-action="all" checked aria-label="Marcar tudo"/)
    assert.match(modal, /height: calc\(11 \* 42px\)/)
    assert.match(modal, /position:\s*fixed/)
    assert.equal(showDate("Mon Jun 15 12:00:00 +0000 2020"), "15/06/2020")
    assert.equal(showDate(""), "")
    assert.match(html, /width: 100%/)
    assert.match(html, /--edge: color-mix/)
    assert.match(html, /\.wrap:hover/)
    assert.match(html, /\.quick:hover, \.setup:hover/)
    assert.match(html, />Analisar</)
    assert.match(html, /grid-template-columns: 1fr 1fr/)
    assert.match(html, /max-height: calc\(3 \* 24px \+ 16px\)/)
    assert.match(html, /\.logs \{[^}]*height: 112px/)
    assert.match(html, /\.logs \{[^}]*overflow: auto/)
    const quickAt = html.indexOf('class="quick"')
    const manualAt = html.indexOf('data-screen="manual"')
    const progressAt = html.indexOf('class="progress"')
    const logsAt = html.indexOf('class="logs"')
    assert.equal(quickAt < manualAt && manualAt < progressAt && progressAt < logsAt, true)

    const analyzeButton = { textContent: "Analisar", disabled: false }
    const area = { value: "curl exemplo" }
    let during = ""
    showAnalyze(analyzeButton, area, (text) => {
        during = `${analyzeButton.textContent}:${text}`
    }, { setTimeout(callback) { callback() } })
    assert.equal(during, "Analisando...:curl exemplo")
    assert.equal(analyzeButton.textContent, "Analisar")
    assert.equal(analyzeButton.disabled, false)
    assert.equal(area.value, "")
    assert.equal(html.includes("width: 380px"), false)
    assert.equal(html.includes("Drop Your File Here"), false)

    const sidebar = slot()
    const primary = slot()
    const page = {
        sidebar,
        primary,
        head: { append() {} },
        getElementById() { return { id: "x-deleter-sidebar" } },
        createElement() { return {} },
        querySelector(selector) {
            if (selector === '[data-testid="sidebarColumn"]') return sidebar
            if (selector === '[data-testid="primaryColumn"]') return primary
            return null
        },
    }
    const host = { style: {}, dataset: {}, setAttribute() {}, parentElement: null }
    const wide = {
        getComputedStyle(node) {
            return { display: node === sidebar ? "flex" : "block" }
        },
    }
    assert.equal(attachPanel(host, page, wide), "sidebar")
    assert.equal(host.parentElement, sidebar)
    assert.equal(sidebar.children.length, 1)
    attachPanel(host, page, wide)
    assert.equal(sidebar.children.length, 1)

    const narrow = {
        getComputedStyle(node) {
            return { display: node === sidebar ? "none" : "block" }
        },
    }
    assert.equal(attachPanel(host, page, narrow), "primary")
    assert.equal(host.parentElement, primary)
    assert.equal(host.dataset.place, "primary")

    const built = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" })
    assert.equal(built.status, 0, built.stderr)
    const bundle = readFileSync(join(root, "x-deleter.js"), "utf8")
    assert.equal(bundle.includes("Drop Your File Here"), false)
    assert.match(bundle, /==UserScript==/)
    assert.match(bundle, /@name\s+Tweet deleter/)
    assert.match(bundle, /@grant\s+none/)
    assert.match(bundle, /@match\s+https:\/\/x\.com\/\*/)
    assert.match(bundle, /@match\s+https:\/\/twitter\.com\/\*/)
    assert.match(bundle, /@run-at\s+document-idle/)
    assert.match(bundle, /dataset\.xDeleter === "on"/)
    assert.equal(bundle.includes("GM_"), false)
})
