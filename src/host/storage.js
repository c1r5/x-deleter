import { defaultSlots } from "../core/options.js"

export const configKey = "x-deleter.config.v1"

function read(storage) {
    const raw = storage.getItem(configKey)
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
        return {}
    }
}

export function loadSlots(storage) {
    const defaults = defaultSlots()
    const saved = read(storage)
    return {
        replies: saved.replies || defaults.replies,
        old: saved.old || defaults.old,
        reposts: saved.reposts || defaults.reposts,
        delete: saved.delete || defaults.delete,
    }
}

const sharedHeaderFields = ["authorization", "transactionId", "clientUuid", "secChUa", "platform"]

function withSharedHeaders(source, target) {
    const next = { ...target }
    let copied = false
    for (const field of sharedHeaderFields) {
        const value = source?.[field]
        if (typeof value !== "string" || !value.trim()) continue
        next[field] = value
        copied = true
    }
    return copied ? next : null
}

export function saveSlot(storage, key, slot) {
    const saved = read(storage)
    const defaults = defaultSlots()
    saved[key] = slot
    for (const other of ["replies", "old", "reposts", "delete"]) {
        if (other === key) continue
        const shared = withSharedHeaders(slot, saved[other] || defaults[other])
        if (shared) saved[other] = shared
    }
    storage.setItem(configKey, JSON.stringify(saved))
    return loadSlots(storage)
}

export function restoreSlot(storage, key) {
    const saved = read(storage)
    saved[key] = null
    storage.setItem(configKey, JSON.stringify(saved))
    return loadSlots(storage)
}

export function restoreAll(storage) {
    storage.removeItem(configKey)
    return loadSlots(storage)
}
