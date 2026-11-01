import { parseCapturedRequest } from "../core/parse.js"

export function analyze(text, deps) {
    const parsed = parseCapturedRequest(text)
    if (!parsed.ok) {
        deps.panel.log(parsed.error)
        return parsed
    }
    if (parsed.ambiguous) {
        deps.panel.log(`placeholder ambíguo: ${parsed.candidates.join(", ")}`)
        deps.openManual?.(parsed)
        return parsed
    }
    if (!parsed.slotKey) {
        deps.panel.log("escolha o slot")
        return parsed
    }
    deps.saveSlot(parsed.slotKey, parsed.slot)
    deps.panel.log(parsed.slot.label)
    return parsed
}
