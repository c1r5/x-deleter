const hideStyle = `[data-testid="sidebarColumn"] > :not([data-x-deleter-host]) { display: none !important; }`

function shown(node, view) {
    if (!node || node.isConnected === false) return false
    const style = view.getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden") return false
    const rect = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null
    if (rect && rect.width === 0) return false
    return true
}

function ensureHideStyle(document) {
    if (document.getElementById("x-deleter-sidebar")) return
    const style = document.createElement("style")
    style.id = "x-deleter-sidebar"
    style.textContent = hideStyle
    ;(document.head || document.documentElement).append(style)
}

export function attachPanel(host, document, view) {
    ensureHideStyle(document)
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]')
    const primary = document.querySelector('[data-testid="primaryColumn"]')
    const target = shown(sidebar, view) ? sidebar : (primary || document.body)
    const mode = target === sidebar ? "sidebar" : "primary"
    host.setAttribute("data-x-deleter-host", "")
    host.dataset.place = mode
    host.style.cssText = "box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100dvh;max-height:100dvh;position:sticky;top:0;min-width:0;z-index:1;"
    if (host.parentElement !== target) target.prepend(host)
    return mode
}

export function watchPlacement(host, document, view) {
    let scheduled = false
    const schedule = () => {
        if (scheduled) return
        scheduled = true
        const frame = view.requestAnimationFrame || ((callback) => callback())
        frame(() => {
            scheduled = false
            attachPanel(host, document, view)
        })
    }
    attachPanel(host, document, view)
    view.addEventListener?.("resize", schedule)
    const observer = new view.MutationObserver(schedule)
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true })
    return schedule
}
