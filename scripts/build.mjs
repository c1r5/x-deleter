import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const files = [
    "src/core/options.js",
    "src/core/select.js",
    "src/core/request.js",
    "src/core/parse.js",
    "src/core/run.js",
    "src/ui/theme.js",
    "src/ui/settings.js",
    "src/ui/session.js",
    "src/ui/capture.js",
    "src/ui/manual.js",
    "src/ui/place.js",
    "src/ui/modal.js",
    "src/ui/panel.js",
    "src/host/storage.js",
    "src/host/console.js",
]

const body = files.map((file) => {
    return readFileSync(join(root, file), "utf8")
        .replace(/^import .*$/gm, "")
        .replace(/^export /gm, "")
}).join("\n")

const header = `// ==UserScript==
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
`
const script = `${header}(async () => {
const bootDeleter = async () => {
if (document.documentElement.dataset.xDeleter === "on") return
document.documentElement.dataset.xDeleter = "on"
${body}
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bootDeleter() }, { once: true })
else bootDeleter()
})()
`
const out = join(root, "x-deleter.js")
writeFileSync(out, script)
const check = spawnSync(process.execPath, ["--check", out], { encoding: "utf8" })
if (check.status !== 0) {
    console.error(check.stderr)
    process.exit(check.status || 1)
}
console.log("x-deleter.js")
