"use client";

import { useState, useEffect, useCallback } from "react";

/** Browser-local only — renames and hides are not sent to TwelveLabs or any API. */
const STORAGE_KEY = "tl_video_inventory_prefs_v1";

export interface VideoInventoryPrefs {
    /** Custom display names keyed by TwelveLabs video id */
    renames: Record<string, string>;
    /** Video ids hidden from this browser's inventory view */
    hiddenIds: string[];
}

const EMPTY_PREFS: VideoInventoryPrefs = { renames: {}, hiddenIds: [] };

export function filenameToDisplayName(filename: string): string {
    return filename.replace(/\.[^.]+$/, "") || "Untitled";
}

export function readVideoInventoryPrefs(): VideoInventoryPrefs {
    if (typeof window === "undefined") return EMPTY_PREFS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY_PREFS;
        const parsed = JSON.parse(raw) as Partial<VideoInventoryPrefs>;
        return {
            renames: parsed.renames && typeof parsed.renames === "object" ? parsed.renames : {},
            hiddenIds: Array.isArray(parsed.hiddenIds) ? parsed.hiddenIds : [],
        };
    } catch {
        return EMPTY_PREFS;
    }
}

function writeVideoInventoryPrefs(prefs: VideoInventoryPrefs): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (err) {
        console.warn("[videoInventoryStore] Could not persist prefs:", err);
    }
}

export function getVideoDisplayName(videoId: string, fallbackFilename?: string | null): string {
    const prefs = readVideoInventoryPrefs();
    const custom = prefs.renames[videoId]?.trim();
    if (custom) return custom;
    if (fallbackFilename) return filenameToDisplayName(fallbackFilename);
    return "Untitled";
}

export function isVideoHiddenLocally(videoId: string): boolean {
    return readVideoInventoryPrefs().hiddenIds.includes(videoId);
}

export function useVideoInventoryPrefs() {
    const [prefs, setPrefs] = useState<VideoInventoryPrefs>(EMPTY_PREFS);

    // Rehydrate from localStorage on mount (survives full page refresh).
    useEffect(() => {
        setPrefs(readVideoInventoryPrefs());
    }, []);

    const persist = useCallback((next: VideoInventoryPrefs) => {
        writeVideoInventoryPrefs(next);
        setPrefs(next);
    }, []);

    const renameVideo = useCallback(
        (videoId: string, name: string) => {
            const trimmed = name.trim();
            const renames = { ...prefs.renames };
            if (trimmed) {
                renames[videoId] = trimmed;
            } else {
                delete renames[videoId];
            }
            persist({ ...prefs, renames });
        },
        [prefs, persist],
    );

    const hideVideo = useCallback(
        (videoId: string) => {
            if (prefs.hiddenIds.includes(videoId)) return;
            persist({ ...prefs, hiddenIds: [...prefs.hiddenIds, videoId] });
        },
        [prefs, persist],
    );

    const getDisplayName = useCallback(
        (videoId: string, fallbackFilename?: string | null) => {
            const custom = prefs.renames[videoId]?.trim();
            if (custom) return custom;
            if (fallbackFilename) return filenameToDisplayName(fallbackFilename);
            return "Untitled";
        },
        [prefs],
    );

    const isHidden = useCallback(
        (videoId: string) => prefs.hiddenIds.includes(videoId),
        [prefs],
    );

    return { prefs, renameVideo, hideVideo, getDisplayName, isHidden };
}
