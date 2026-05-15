/**
 * Vercel Blob pathname prefix for cached JSON arrays from GET /api/videos.
 * Bump WRITE when list semantics change or you need to invalidate bad rows globally.
 */
export const VIDEO_LIST_BLOB_WRITE_PREFIX = "api_video_cache_v4_";

/** Read legacy caches too so embeddings / ad merge still see rows until each index is refreshed. */
export const VIDEO_LIST_BLOB_READ_PREFIXES = ["api_video_cache_v4_", "api_video_cache_v3_"];

/**
 * When the same video id appears in multiple list blobs (e.g. stale v3 + fresh v4),
 * keep the snapshot that looks most ready for playback.
 */
export function pickFresherCachedVideo(a, b) {
    if (!a) return b;
    if (!b) return a;
    const score = (v) => {
        let s = 0;
        if (!v.processing) s += 100;
        const url = v.hls?.videoUrl || v.hls?.video_url;
        if (url && String(url).trim()) s += 50;
        const d = v.systemMetadata?.duration || 0;
        if (d > 0) s += 1;
        return s;
    };
    return score(b) > score(a) ? b : a;
}
