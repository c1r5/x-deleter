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

function waitForArchive() {
    return new Promise((resolve) => {
        const modal = document.createElement("div")
        modal.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"
        const card = document.createElement("div")
        card.style.cssText = "background:#fff;padding:20px;border-radius:5px;width:400px;text-align:center;"
        const title = document.createElement("h2")
        title.textContent = "Drop Your File Here"
        const drop = document.createElement("div")
        drop.textContent = "Drop your tweets.js from your Twitter Archive here"
        drop.style.cssText = "border:2px dashed #007bff;border-radius:5px;padding:60px;cursor:pointer;"
        const confirm = document.createElement("button")
        confirm.textContent = "Confirm"
        confirm.style.marginTop = "5px"
        let text = ""
        function take(file) {
            const reader = new FileReader()
            reader.onload = () => {
                text = String(reader.result || "")
                console.log("JSON data loaded into global variable.")
            }
            reader.readAsText(file)
        }
        drop.addEventListener("dragover", (event) => {
            event.preventDefault()
            drop.style.borderColor = "#0056b3"
        })
        drop.addEventListener("dragleave", () => {
            drop.style.borderColor = "#007bff"
        })
        drop.addEventListener("drop", (event) => {
            event.preventDefault()
            drop.style.borderColor = "#007bff"
            if (event.dataTransfer.files[0]) take(event.dataTransfer.files[0])
        })
        drop.addEventListener("click", () => {
            const input = document.createElement("input")
            input.type = "file"
            input.onchange = () => {
                if (input.files[0]) take(input.files[0])
            }
            input.click()
        })
        confirm.addEventListener("click", () => {
            if (!text) {
                console.error("No file loaded. Please load a file before confirming.")
                return
            }
            console.log("Confirmation received. File processed.")
            modal.remove()
            resolve(text)
        })
        card.append(title, drop, confirm)
        modal.append(card)
        document.body.append(modal)
    })
}

const env = readEnv()
const options = defaultOptions()
const slots = defaultSlots()
await runDeletion({
    options,
    slots,
    env,
    fetch: globalThis.fetch.bind(globalThis),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
    readArchive: waitForArchive,
})
