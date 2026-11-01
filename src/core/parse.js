const slotByOperation = {
    UserRepliesTimeline: "replies",
    UserTweetsAndReplies: "replies",
    UserTweets: "old",
    UserOriginalsTimeline: "old",
    UserRepostsTimeline: "reposts",
    DeleteTweet: "delete",
}

const labels = {
    replies: "Buscar respostas",
    old: "Buscar tweets antigos",
    reposts: "Buscar reposts",
    delete: "Apagar tweet",
}

const knownPlaceholders = {
    tweet_id: "{{tweet_id}}",
    tweetId: "{{tweet_id}}",
    user_id: "{{user_id}}",
    userId: "{{user_id}}",
    user_id_str: "{{user_id}}",
    cursor: "{{cursor}}",
}

function isSnowflake(value) {
    return typeof value === "string" && /^\d{15,}$/.test(value)
}

function collect(value, path, candidates) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => collect(item, `${path}[${index}]`, candidates))
        return
    }
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key
        if (!knownPlaceholders[key] && isSnowflake(child)) candidates.push(childPath)
        collect(child, childPath, candidates)
    }
}

function substitute(value) {
    if (Array.isArray(value)) return value.map((item) => substitute(item))
    if (!value || typeof value !== "object") return value
    const out = {}
    for (const [key, child] of Object.entries(value)) {
        if (knownPlaceholders[key] && (typeof child === "string" || typeof child === "number")) out[key] = knownPlaceholders[key]
        else out[key] = substitute(child)
    }
    return out
}

function extractJsonObject(text, start) {
    const begin = text.indexOf("{", start)
    if (begin < 0) return ""
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = begin; i < text.length; i++) {
        const char = text[i]
        if (inString) {
            if (escaped) escaped = false
            else if (char === "\\") escaped = true
            else if (char === "\"") inString = false
            continue
        }
        if (char === "\"") inString = true
        else if (char === "{") depth += 1
        else if (char === "}") {
            depth -= 1
            if (depth === 0) return text.slice(begin, i + 1)
        }
    }
    return ""
}

function headerMap(headers) {
    const out = {}
    if (!headers) return out
    for (const [key, value] of Object.entries(headers)) out[String(key).toLowerCase()] = value
    return out
}

function finish(urlString, options) {
    let url
    try {
        url = new URL(urlString)
    } catch {
        return { ok: false, error: "url_ausente" }
    }
    const headers = headerMap(options.headers)
    let variables = null
    let features = null
    let fieldToggles = null
    if (url.searchParams.has("variables")) {
        try {
            variables = JSON.parse(url.searchParams.get("variables"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    if (url.searchParams.has("features")) {
        try {
            features = JSON.parse(url.searchParams.get("features"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    if (url.searchParams.has("fieldToggles")) {
        try {
            fieldToggles = JSON.parse(url.searchParams.get("fieldToggles"))
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    let body = null
    if (options.body) {
        try {
            body = JSON.parse(options.body)
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    const path = url.pathname
    const operation = path.split("/").filter(Boolean).pop() || ""
    const slotKey = slotByOperation[operation] || ""
    const candidates = []
    collect(variables, "variables", candidates)
    collect(features, "features", candidates)
    collect(fieldToggles, "fieldToggles", candidates)
    collect(body, "body", candidates)
    path.split("/").forEach((segment, index) => {
        if (isSnowflake(segment)) candidates.push(`caminho[${index}]`)
    })
    const ambiguous = candidates.length > 0
    const method = String(options.method || (body ? "POST" : "GET")).toUpperCase()
    let nextVariables = ambiguous || !variables ? variables : substitute(variables)
    if (!ambiguous && nextVariables && slotKey && slotKey !== "delete" && !Object.hasOwn(nextVariables, "cursor")) {
        nextVariables = { ...nextVariables, cursor: "{{cursor}}" }
    }
    return {
        ok: true,
        error: "",
        slotKey,
        ambiguous,
        candidates,
        operation,
        slot: {
            label: labels[slotKey] || "",
            method,
            path,
            variables: nextVariables,
            features: ambiguous || !features ? features : substitute(features),
            fieldToggles: ambiguous || !fieldToggles ? fieldToggles : substitute(fieldToggles),
            body: ambiguous || !body ? body : substitute(body),
            contentType: headers["content-type"] || "application/json",
            successStatus: 200,
            authorization: headers.authorization || "",
            transactionId: headers["x-client-transaction-id"] || "",
            clientUuid: headers["x-client-uuid"] || "",
            secChUa: headers["sec-ch-ua"] || "",
            platform: headers["sec-ch-ua-platform"] || "",
        },
    }
}

function parseFetch(text) {
    if (!/fetch\s*\(/.test(text)) return { ok: false, error: "formato_nao_reconhecido" }
    const urlMatch = text.match(/fetch\s*\(\s*"([^"]*)"/)
    if (!urlMatch || !urlMatch[1]) return { ok: false, error: "url_ausente" }
    const objectText = extractJsonObject(text, urlMatch.index + urlMatch[0].length)
    let options = {}
    if (objectText) {
        try {
            options = JSON.parse(objectText)
        } catch {
            return { ok: false, error: "json_invalido" }
        }
    }
    return finish(urlMatch[1], options)
}

function parseCurl(text) {
    const unfolded = text.replace(/\\\r?\n/g, " ")
    if (!/^\s*curl\b/.test(unfolded)) return { ok: false, error: "formato_nao_reconhecido" }
    const urlMatch = unfolded.match(/--url\s+'([^']*)'|--url\s+"([^"]*)"|\bcurl\s+'([^']*)'|\bcurl\s+"([^"]*)"/)
    const url = urlMatch ? (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? urlMatch[4]) : ""
    if (!url) return { ok: false, error: "url_ausente" }
    const headers = {}
    const headerPattern = /-H\s+'([^']*)'|-H\s+"([^"]*)"/g
    for (const match of unfolded.matchAll(headerPattern)) {
        const raw = match[1] ?? match[2]
        const colon = raw.indexOf(":")
        if (colon < 0) continue
        headers[raw.slice(0, colon).trim().toLowerCase()] = raw.slice(colon + 1).trim()
    }
    let body = null
    const dataMatch = unfolded.match(/--data-raw\s+\$?'([^']*)'|--data-raw\s+\$?"([^"]*)"|--data\s+'([^']*)'|--data\s+"([^"]*)"/)
    if (dataMatch) body = dataMatch[1] ?? dataMatch[2] ?? dataMatch[3] ?? dataMatch[4]
    const methodMatch = unfolded.match(/-X\s+'([^']+)'|-X\s+"([^"]+)"|-X\s+([A-Z]+)/)
    const method = methodMatch ? (methodMatch[1] || methodMatch[2] || methodMatch[3]) : (body ? "POST" : "GET")
    return finish(url, { headers, body, method })
}

export function parseCapturedRequest(text) {
    const raw = String(text || "").trim()
    if (/^\s*fetch\s*\(/.test(raw)) return parseFetch(raw)
    if (/^\s*curl\b/.test(raw)) return parseCurl(raw)
    return { ok: false, error: "formato_nao_reconhecido" }
}
