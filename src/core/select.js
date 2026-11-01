function midnight(value) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
}

function ignored(id, list) {
    return list.includes(id) || list.includes(parseInt(id, 10))
}

export function keywordsMatch(text, words) {
    if (!words || words.length === 0) return true
    return words.some((word) => String(text).includes(word))
}

export function dateMatches(createdAt, options, signal) {
    const tweetDate = midnight(createdAt)
    const after = midnight(options.afterDate)
    const before = midnight(options.beforeDate)
    if (tweetDate < after) signal.stop = true
    return tweetDate > after && tweetDate < before
}

function timelineDate(tweet, options, signal) {
    if (tweet.legacy && Object.prototype.hasOwnProperty.call(tweet.legacy, "created_at")) {
        return dateMatches(tweet.legacy.created_at, options, signal)
    }
    return true
}

export function ownsTweet(tweet, userId, unretweet) {
    if (tweet.legacy && tweet.legacy.retweeted === true && unretweet === false) return false
    if (tweet.user_id_str === userId) return true
    if (tweet.legacy && tweet.legacy.user_id_str === userId) return true
    return false
}

export function passesTimeline(tweet, options, signal) {
    const id = tweet.legacy && tweet.legacy.id_str
    if (id && ignored(id, options.ignoreIds)) return false
    const text = (tweet.legacy && tweet.legacy.full_text) || ""
    const urls = (tweet.legacy && tweet.legacy.entities && tweet.legacy.entities.urls) || []
    const words = keywordsMatch(text, options.keywords)
    const dated = timelineDate(tweet, options, signal)
    if (options.urlsOnly) return urls.length > 0 && words && dated
    return words && dated
}

function passesArchive(tweet, options, signal) {
    if (ignored(tweet.id, options.ignoreIds)) return false
    return keywordsMatch(tweet.text, options.keywords) && dateMatches(tweet.date, options, signal)
}

export function collectTimeline(root, options, userId) {
    const ids = []
    const signal = { stop: false }

    function recurse(current) {
        if (typeof current !== "object" || current === null) return
        if (options.keepPinned && current.__type === "TimelinePinEntry") return

        if (current.__typename === "TweetWithVisibilityResults" && current.tweet
            && ownsTweet(current.tweet, userId, options.unretweet)
            && passesTimeline(current.tweet, options, signal)) {
            ids.push(current.tweet.id_str || current.tweet.legacy.id_str)
        } else if (current.__typename === "Tweet"
            && ownsTweet(current, userId, options.unretweet)
            && passesTimeline(current, options, signal)) {
            ids.push(current.id_str || current.legacy.id_str)
        }

        for (const key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) recurse(current[key])
        }
    }

    recurse(root)
    return { ids, stop: signal.stop }
}

export function collectArchive(data, options, userId) {
    const ids = []
    const signal = { stop: false }
    for (const item of data) {
        if (!item.tweet || !item.tweet.id_str) continue
        const replyToSelf = item.tweet.in_reply_to_user_id_str === userId
        const startsWithRt = item.tweet.full_text.startsWith("RT ")
        const rtOk = (options.unretweet === true && startsWithRt) || (options.unretweet === false && !startsWithRt)
        const tweet = {
            id: item.tweet.id_str,
            text: item.tweet.full_text,
            date: item.tweet.created_at,
        }
        if (!replyToSelf && rtOk && passesArchive(tweet, options, signal)) ids.push(item.tweet.id_str)
    }
    return { ids, stop: signal.stop }
}

export function parseArchiveText(content) {
    const parts = content.split("=")
    parts.shift()
    return JSON.parse(parts.join("=").trim())
}

export function entriesFromPayload(data) {
    let entries = data.data.user.result.timeline.timeline.instructions
    for (const item of entries) {
        if (item.type === "TimelineAddEntries") entries = item.entries
    }
    return entries
}

export function scanEntries(entries, options, userId) {
    const ids = []
    let stop = false
    for (const item of entries) {
        if (item.entryId.startsWith("profile-conversation") || item.entryId.startsWith("tweet-")) {
            const found = collectTimeline(item, options, userId)
            ids.push(...found.ids)
            if (found.stop) stop = true
        } else if (item.entryId.startsWith("cursor-bottom") && entries.length > 2) {
            return { ids, stop, cursor: item.content.value }
        }
    }
    return { ids, stop, cursor: "finished" }
}
