import { runExecution, runSearch } from "../core/run.js"
import { loadSlots, restoreAll, restoreSlot, saveSlot } from "./storage.js"
import { openSearchModal } from "../ui/modal.js"
import { mountPanel } from "../ui/panel.js"
import { begin } from "../ui/session.js"
import { sampleTheme } from "../ui/theme.js"

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
