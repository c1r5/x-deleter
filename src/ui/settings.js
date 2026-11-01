function list(value) {
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean)
}

export function optionsFromFields(fields) {
    return {
        fromArchive: Boolean(fields.fromArchive),
        unretweet: fields.unretweet == null ? true : Boolean(fields.unretweet),
        keepPinned: Boolean(fields.keepPinned),
        urlsOnly: Boolean(fields.urlsOnly),
        oldTweets: Boolean(fields.oldTweets),
        reposts: Boolean(fields.reposts),
        keywords: list(fields.keywords),
        ignoreIds: list(fields.ignoreIds),
        onlyIds: list(fields.onlyIds),
        afterDate: fields.afterDate || "1900-01-01",
        beforeDate: fields.beforeDate || "2026-10-30",
    }
}
