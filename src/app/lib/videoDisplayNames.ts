import displayNameMap from "./videoDisplayNames.json";

/** TwelveLabs video id → human-readable inventory label (not TL asset filenames). */
export type VideoDisplayNameMap = Record<string, string>;

export const VIDEO_DISPLAY_NAMES: VideoDisplayNameMap = displayNameMap;

export function getMappedVideoDisplayName(videoId: string): string | undefined {
    const name = VIDEO_DISPLAY_NAMES[videoId]?.trim();
    return name || undefined;
}

/** Local browser rename wins, then JSON mapping, then a neutral fallback. */
export function resolveVideoDisplayName(
    videoId: string,
    options?: { localRename?: string | null },
): string {
    const local = options?.localRename?.trim();
    if (local) return local;
    return getMappedVideoDisplayName(videoId) ?? "Untitled";
}
