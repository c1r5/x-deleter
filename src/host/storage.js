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
        delete: saved.delete || defaults.delete,
    }
}

export function saveSlot(storage, key, slot) {
    const saved = read(storage)
    saved[key] = slot
    storage.setItem(configKey, JSON.stringify(saved))
    return loadSlots(storage)
}
