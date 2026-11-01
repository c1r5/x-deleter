import { optionsFromFields } from "./settings.js"

export async function begin(fields, fileText, deps) {
    const options = optionsFromFields(fields)
    if (options.fromArchive && !fileText) {
        deps.panel.log("falta o tweets.js")
        deps.panel.setStatus("fail")
        return { status: "fail" }
    }
    deps.panel.setStatus(deps.statusWord || "deleting")
    try {
        const result = await deps.run(options)
        deps.panel.setStatus(result.status)
        return result
    } catch (error) {
        deps.panel.log(error instanceof Error ? error.message : String(error))
        deps.panel.setStatus("fail")
        return { status: "fail" }
    }
}
