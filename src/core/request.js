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

function variablesFor(kind, userId, cursor) {
    const variables = { userId, count: 20 }
    if (cursor) variables.cursor = cursor
    variables.includePromotedContent = true
    if (kind === "old") variables.withQuickPromoteEligibilityTweetFields = true
    else variables.withCommunity = true
    variables.withVoice = true
    variables.withV2Timeline = true
    return variables
}

export function timelineUrl(kind, userId, cursor) {
    const variables = encodeURIComponent(JSON.stringify(variablesFor(kind, userId, cursor)))
    const features = encodeURIComponent(JSON.stringify(featuresFor(kind)))
    return `https://x.com${repliesPath}?variables=${variables}&features=${features}`
}

export function deleteUrl() {
    return `https://x.com${deletePath}`
}

export function deleteBody(tweetId) {
    return JSON.stringify({
        variables: { tweet_id: tweetId, dark_request: false },
        queryId: deleteQueryId,
    })
}

export function requestHeaders({ authorization, transactionId, clientUuid, csrf, secChUa, acceptLanguage, language }) {
    return {
        accept: "*/*",
        "accept-language": acceptLanguage,
        authorization,
        "content-type": "application/json",
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
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
