export const publicBearer = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

export function defaultOptions() {
    return {
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        keywords: [],
        ignoreIds: [],
        onlyIds: [],
        afterDate: "1900-01-01",
        beforeDate: "2026-10-30",
    }
}

export function defaultSlots() {
    return {
        replies: {
            label: "Buscar respostas",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
        old: {
            label: "Buscar tweets antigos",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
        delete: {
            label: "Apagar tweet",
            transactionId: "",
            clientUuid: "",
            authorization: publicBearer,
        },
    }
}

export function activeIds(ids) {
    return (ids || []).filter((id) => id !== "")
}
