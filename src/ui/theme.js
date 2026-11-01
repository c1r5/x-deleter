export function isDark(color) {
    const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!match) return false
    const red = Number(match[1])
    const green = Number(match[2])
    const blue = Number(match[3])
    return (red * 299 + green * 587 + blue * 114) / 1000 < 128
}

export function themeFrom(sample) {
    const dark = sample.scheme ? sample.scheme === "dark" : isDark(sample.background)
    return {
        bg: sample.background,
        text: sample.color,
        muted: sample.muted || sample.color,
        line: sample.border || sample.color,
        surface: sample.surface || sample.background,
        accent: sample.accent || "#1d9bf0",
        scheme: dark ? "dark" : "light",
        btnBg: dark ? "#eff3f4" : sample.color,
        btnText: dark ? "#0f1419" : sample.background,
    }
}

export function sampleTheme(document, view) {
    const body = view.getComputedStyle(document.body)
    const link = document.querySelector("a[href]")
    const accent = link ? view.getComputedStyle(link).color : ""
    let surface = body.backgroundColor
    let border = body.borderTopColor
    const nodes = document.querySelectorAll("div, article, section")
    const limit = Math.min(nodes.length, 200)
    for (let i = 0; i < limit; i++) {
        const style = view.getComputedStyle(nodes[i])
        if (surface === body.backgroundColor && style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== body.backgroundColor) {
            surface = style.backgroundColor
        }
        if (style.borderTopColor && style.borderTopColor !== "rgba(0, 0, 0, 0)") border = style.borderTopColor
    }
    const declared = document.documentElement.style.colorScheme
    const scheme = declared === "dark" || declared === "light" ? declared : (isDark(body.backgroundColor) ? "dark" : "light")
    return themeFrom({
        background: body.backgroundColor,
        color: body.color,
        muted: body.color,
        border,
        surface,
        accent,
        scheme,
    })
}

export function applyTheme(target, theme) {
    target.style.setProperty("--bg", theme.bg)
    target.style.setProperty("--text", theme.text)
    target.style.setProperty("--muted", theme.muted)
    target.style.setProperty("--line", theme.line)
    target.style.setProperty("--surface", theme.surface)
    target.style.setProperty("--accent", theme.accent)
    target.style.setProperty("--scheme", theme.scheme)
    target.style.setProperty("--btn-bg", theme.btnBg)
    target.style.setProperty("--btn-text", theme.btnText)
    target.style.colorScheme = theme.scheme
}
