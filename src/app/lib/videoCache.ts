"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ── Types ──────────────────────────────────────────────── */
/** TwelveLabs Marengo clip-level segments from /api/videos (embeddingOption). */
export type CachedVideoEmbeddingSegment = {
    startOffsetSec?: number;
    endOffsetSec?: number;
    vector?: number[];
};

export interface CachedVideo {
    id: string;
    hls?: { videoUrl?: string; thumbnailUrls?: string[] };
    systemMetadata?: {
        filename?: string; duration?: number; width?: number; height?: number; fps?: number; size?: number;
    };
    userMetadata?: string | null;
    /** Averaged in UI/export for one vector per creative */
    embedding_segments?: CachedVideoEmbeddingSegment[];
    /** Legacy single vector */
    embedding?: number[];
}

interface CacheEntry {
    videos: CachedVideo[];
    timestamp: number;
    /** True when Marengo vectors were dropped to fit localStorage; triggers a background refetch. */
    embeddingsOmitted?: boolean;
}

/* ── Config ─────────────────────────────────────────────── */
const CACHE_KEY_PREFIX = "tl_video_cache_v2_";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days — refetch in background after this

/* ── Low-level localStorage helpers ─────────────────────── */
function getCacheKey(index: string): string {
    return `${CACHE_KEY_PREFIX}${index}`;
}

function readCache(index: string): CacheEntry | null {
    try {
        const raw = localStorage.getItem(getCacheKey(index));
        if (!raw) return null;
        return JSON.parse(raw) as CacheEntry;
    } catch { return null; }
}

/** Marengo clip vectors are huge; omit from persistence when quota is tight. */
function stripEmbeddingsForStorage(videos: CachedVideo[]): CachedVideo[] {
    return videos.map((v) => {
        const copy: CachedVideo = { ...v };
        delete copy.embedding_segments;
        delete copy.embedding;
        return copy;
    });
}

function isQuotaError(err: unknown): boolean {
    return (
        err instanceof DOMException && err.name === "QuotaExceededError"
    ) || (err instanceof Error && err.name === "QuotaExceededError");
}

function writeCache(index: string, videos: CachedVideo[]): void {
    const key = getCacheKey(index);
    const ts = Date.now();

    const trySet = (entry: CacheEntry): boolean => {
        try {
            localStorage.setItem(key, JSON.stringify(entry));
            return true;
        } catch (err) {
            if (!isQuotaError(err)) {
                console.warn("[videoCache] Could not write to localStorage:", err);
            }
            return false;
        }
    };

    const full: CacheEntry = { videos, timestamp: ts, embeddingsOmitted: false };
    if (trySet(full)) return;

    const slim: CacheEntry = {
        videos: stripEmbeddingsForStorage(videos),
        timestamp: ts,
        embeddingsOmitted: true,
    };
    if (trySet(slim)) {
        console.warn(
            "[videoCache] Saved metadata only (Marengo embeddings omitted) to fit localStorage. A background fetch will reload vectors."
        );
        return;
    }

    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }

    if (trySet(slim)) {
        console.warn("[videoCache] Saved metadata-only after clearing prior cache key.");
        return;
    }

    console.warn("[videoCache] localStorage full or unavailable; cache not persisted (in-memory data still works).");
}

/**
 * Invalidate (clear) the cache for a specific index.
 * Call this after a successful video upload so the next
 * page load fetches fresh data.
 */
export function invalidateVideoCache(index: string = "tl-context-engine-ads"): void {
    try {
        localStorage.removeItem(getCacheKey(index));
    } catch { /* noop */ }
}

/* ── React Hook ─────────────────────────────────────────── */
/**
 * useVideos — returns cached video data instantly + refreshes in background.
 *
 * Flow:
 * 1. On mount, check localStorage for cached data.
 *    - If found → set videos immediately, set loading=false.
 *    - If stale or missing → also kick off a background fetch.
 * 2. Background fetch updates both state and cache.
 * 3. `refresh()` can be called manually (e.g. after upload).
 */
export function useVideos(index: string = "tl-context-engine-ads") {
    const [videos, setVideos] = useState<CachedVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchingRef = useRef(false);

    // Fetch from API and update cache + state
    const fetchFresh = useCallback(async (showLoading: boolean) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        if (showLoading) setLoading(true);

        try {
            const res = await fetch(`/api/videos?index=${encodeURIComponent(index)}`);
            if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
            const data: CachedVideo[] = await res.json();
            writeCache(index, data);
            setVideos(data);
        } catch (err) {
            console.error("[useVideos] Fetch error:", err);
        }

        setLoading(false);
        fetchingRef.current = false;
    }, [index]);

    // On mount: read cache, decide whether to fetch
    useEffect(() => {
        const cached = readCache(index);

        if (cached && cached.videos.length > 0) {
            // Serve cached data immediately
            setVideos(cached.videos);
            setLoading(false);

            const age = Date.now() - cached.timestamp;
            const stale = age > STALE_MS;
            // Reload full payloads (including Marengo segments) when cache was slimmed or old
            if (stale || cached.embeddingsOmitted) {
                fetchFresh(false);
            }
        } else {
            // No cache — must fetch with loading spinner
            fetchFresh(true);
        }
    }, [index, fetchFresh]);

    /** Force a fresh fetch (e.g. after upload). Shows loading state. */
    const refresh = useCallback(() => {
        invalidateVideoCache(index);
        return fetchFresh(true);
    }, [index, fetchFresh]);

    return { videos, loading, refresh };
}
