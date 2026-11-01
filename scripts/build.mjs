import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const files = [
    "src/core/options.js",
    "src/core/select.js",
    "src/core/request.js",
    "src/core/run.js",
    "src/host/console.js",
]

const body = files.map((file) => {
    return readFileSync(join(root, file), "utf8")
        .replace(/^import .*$/gm, "")
        .replace(/^export /gm, "")
}).join("\n")

const script = `// Cole este arquivo no console de x.com, com a conta aberta.\n(async () => {\n${body}\n})()\n`
writeFileSync(join(root, "x-deleter.js"), script)
console.log("x-deleter.js")
