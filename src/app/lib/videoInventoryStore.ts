"use client";

import { useState, useEffect, useCallback } from "react";

/** Browser-local only — renames and hides are not sent to TwelveLabs or any API. */
const STORAGE_KEY = "tl_video_inventory_prefs_v1";

/** Shared demo videos visible to all users in video inventory. */
export const VIDEO_INVENTORY_ALLOWED_IDS = [
    "69d5ed895570f761f3911887",
    "69d5edbd0189608cb880f639",
    "69d5edf70189608cb880f64c",
    "69d5ee36973ca4e1ca50d0e1",
    "6a06865b6661edbede2db64c",
] as const;

export interface VideoInventoryPrefs {
    /** Custom display names keyed by TwelveLabs video id */
    renames: Record<string, string>;
    /** Video ids hidden from this browser's inventory view */
    hiddenIds: string[];
    /** Video ids uploaded from this browser — visible only to this user */
    uploadedIds: string[];
}

const EMPTY_PREFS: VideoInventoryPrefs = { renames: {}, hiddenIds: [], uploadedIds: [] };

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
            uploadedIds: Array.isArray(parsed.uploadedIds) ? parsed.uploadedIds : [],
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

export function isVideoVisibleInInventory(videoId: string, prefs: VideoInventoryPrefs = readVideoInventoryPrefs()): boolean {
    if (prefs.hiddenIds.includes(videoId)) return false;
    if ((VIDEO_INVENTORY_ALLOWED_IDS as readonly string[]).includes(videoId)) return true;
    return prefs.uploadedIds.includes(videoId);
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

    const registerUploadedVideo = useCallback((videoId: string) => {
        if (!videoId) return;
        const current = readVideoInventoryPrefs();
        if (current.uploadedIds.includes(videoId)) {
            setPrefs(current);
            return;
        }
        const next = { ...current, uploadedIds: [...current.uploadedIds, videoId] };
        writeVideoInventoryPrefs(next);
        setPrefs(next);
    }, []);

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

    const isUserUploaded = useCallback(
        (videoId: string) => prefs.uploadedIds.includes(videoId),
        [prefs.uploadedIds],
    );

    const isVisible = useCallback(
        (videoId: string) => isVideoVisibleInInventory(videoId, prefs),
        [prefs],
    );

    return { prefs, renameVideo, hideVideo, registerUploadedVideo, getDisplayName, isHidden, isUserUploaded, isVisible };
}
