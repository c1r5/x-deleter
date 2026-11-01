const slotLabels = {
    replies: "Buscar respostas",
    old: "Buscar tweets antigos",
    reposts: "Buscar reposts",
    delete: "Apagar tweet",
}

export function presentManual(slotKey, slot, candidates = []) {
    const search = slotKey !== "delete"
    return {
        slotKey,
        title: slotLabels[slotKey] || slot.label || "",
        search,
        method: slot.method || (search ? "GET" : "POST"),
        path: slot.path || "",
        successStatus: String(slot.successStatus || 200),
        contentType: slot.contentType || "application/json",
        variables: search && slot.variables ? JSON.stringify(slot.variables, null, 2) : "",
        features: search && slot.features ? JSON.stringify(slot.features, null, 2) : "",
        body: !search && slot.body ? JSON.stringify(slot.body, null, 2) : "",
        candidates,
    }
}

export function openSlot(slotKey, slots, pending) {
    const fromPending = pending && (pending.slotKey === slotKey || !pending.slotKey)
    const slot = fromPending ? { ...pending.slot, label: slotLabels[slotKey] } : slots[slotKey]
    const candidates = fromPending && pending.ambiguous ? pending.candidates : []
    return presentManual(slotKey, slot, candidates)
}

function parsedJson(text) {
    if (!String(text || "").trim()) return null
    return JSON.parse(text)
}

export function slotFromForm(slotKey, form, previous) {
    const search = slotKey !== "delete"
    let variables = null
    let features = null
    let body = null
    try {
        if (search) {
            variables = parsedJson(form.variables)
            features = parsedJson(form.features)
        } else {
            body = parsedJson(form.body)
        }
    } catch {
        return { ok: false, error: "json_invalido" }
    }
    const slot = {
        label: slotLabels[slotKey],
        method: form.method || previous.method,
        path: form.path,
        variables,
        features,
        fieldToggles: search ? (previous.fieldToggles ?? null) : null,
        body,
        contentType: form.contentType || previous.contentType || "application/json",
        successStatus: Number(form.successStatus || previous.successStatus || 200),
        authorization: previous.authorization || "",
        transactionId: previous.transactionId || "",
        clientUuid: previous.clientUuid || "",
        secChUa: previous.secChUa || "",
        platform: previous.platform || "",
    }
    const required = search ? "{{user_id}}" : "{{tweet_id}}"
    const haystack = JSON.stringify(search ? slot.variables : slot.body)
    if (!haystack.includes(required)) return { ok: false, error: `falta ${required}` }
    return { ok: true, slot }
}
