import { defaultSlotRequest } from "./request.js"

export const publicBearer = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

export function todayStamp(now = new Date()) {
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${now.getFullYear()}-${month}-${day}`
}

export function defaultOptions() {
    return {
        fromArchive: false,
        unretweet: true,
        keepPinned: true,
        urlsOnly: false,
        oldTweets: false,
        reposts: false,
        keywords: [],
        ignoreIds: [],
        onlyIds: [],
        afterDate: "1900-01-01",
        beforeDate: todayStamp(),
    }
}

function slot(label, kind) {
    return {
        label,
        transactionId: "",
        clientUuid: "",
        authorization: publicBearer,
        secChUa: "",
        platform: "",
        ...defaultSlotRequest(kind),
    }
}

export function defaultSlots() {
    return {
        replies: slot("Buscar respostas", "replies"),
        old: slot("Buscar tweets antigos", "old"),
        reposts: slot("Buscar reposts", "reposts"),
        delete: slot("Apagar tweet", "delete"),
    }
}

export function activeIds(ids) {
    return (ids || []).filter((id) => id !== "")
}
