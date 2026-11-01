const repliesPath = "/i/api/graphql/xz348nziCm96wndJ1S0MUQ/UserRepliesTimeline"
const deletePath = "/i/api/graphql/nxpZCY2K-I6QoFHAHeojFQ/DeleteTweet"
const deleteQueryId = "VaenaVgh5q5ih7kvyVjgtg"

const featureFlags = {
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: false,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_media_download_video_enabled: false,
    responsive_web_enhance_cards_enabled: false,
}

function featuresFor(kind) {
    if (kind === "old") return featureFlags
    return { rweb_lists_timeline_redesign_enabled: true, ...featureFlags }
}

function applyValue(value, ctx) {
    if (Array.isArray(value)) return value.map((item) => applyValue(item, ctx))
    if (value && typeof value === "object") {
        const out = {}
        for (const [key, child] of Object.entries(value)) {
            if (child === "{{cursor}}" && !ctx.cursor) continue
            out[key] = applyValue(child, ctx)
        }
        return out
    }
    if (typeof value === "string") {
        return value
            .replaceAll("{{tweet_id}}", ctx.tweetId || "")
            .replaceAll("{{user_id}}", ctx.userId || "")
            .replaceAll("{{cursor}}", ctx.cursor || "")
    }
    return value
}

function variablesTemplate(kind) {
    const variables = { userId: "{{user_id}}", count: 20, cursor: "{{cursor}}" }
    variables.includePromotedContent = true
    if (kind === "old") variables.withQuickPromoteEligibilityTweetFields = true
    else variables.withCommunity = true
    variables.withVoice = true
    variables.withV2Timeline = true
    return variables
}

export function defaultSlotRequest(kind) {
    if (kind === "delete") {
        return {
            method: "POST",
            path: deletePath,
            variables: null,
            features: null,
            body: {
                variables: { tweet_id: "{{tweet_id}}", dark_request: false },
                queryId: deleteQueryId,
            },
            contentType: "application/json",
            successStatus: 200,
        }
    }
    return {
        method: "GET",
        path: repliesPath,
        variables: variablesTemplate(kind),
        features: featuresFor(kind),
        body: null,
        contentType: "application/json",
        successStatus: 200,
    }
}

export function requestFromSlot(slot, ctx) {
    const filled = {
        tweetId: ctx.tweetId || "",
        userId: ctx.userId || "",
        cursor: ctx.cursor || "",
    }
    let url = `https://x.com${slot.path}`
    if ((slot.method || "GET").toUpperCase() !== "POST") {
        const parts = []
        if (slot.variables) parts.push(`variables=${encodeURIComponent(JSON.stringify(applyValue(slot.variables, filled)))}`)
        if (slot.features) parts.push(`features=${encodeURIComponent(JSON.stringify(applyValue(slot.features, filled)))}`)
        if (slot.fieldToggles) parts.push(`fieldToggles=${encodeURIComponent(JSON.stringify(applyValue(slot.fieldToggles, filled)))}`)
        if (parts.length) url += `?${parts.join("&")}`
        return { url, method: "GET", body: null }
    }
    return { url, method: "POST", body: JSON.stringify(applyValue(slot.body, filled)) }
}

export function timelineUrl(kind, userId, cursor) {
    return requestFromSlot(defaultSlotRequest(kind), { userId, cursor }).url
}

export function deleteUrl() {
    return requestFromSlot(defaultSlotRequest("delete"), {}).url
}

export function deleteBody(tweetId) {
    return requestFromSlot(defaultSlotRequest("delete"), { tweetId }).body
}

export function requestHeaders({ authorization, transactionId, clientUuid, csrf, secChUa, acceptLanguage, language, platform }) {
    return {
        accept: "*/*",
        "accept-language": acceptLanguage,
        authorization,
        "content-type": "application/json",
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": platform || "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client-transaction-id": transactionId,
        "x-client-uuid": clientUuid,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": language,
    }
}
