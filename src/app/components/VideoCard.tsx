"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Hls from "hls.js";
import { type CachedVideo } from "../lib/videoCache";
import { resolveVideoDisplayName } from "../lib/videoDisplayNames";
import { hlsClientConfig } from "../lib/hlsClientConfig";

interface VideoCardProps {
    video: CachedVideo;
    /** If provided, clicking the card links to this ad category detail page */
    slug?: string;
    /** Whether this is an Ad Inventory view or Video Inventory view. Determines link target. */
    viewType?: "ad-inventory" | "video-inventory";
    searchMatch?: { start: number; end: number; confidence: string; score?: number };
    /** Hide the title row (e.g. when VideoInventoryCard renders its own title + menu). */
    hideTitle?: boolean;
}

function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Default preview start for inventory cards — at least 45s, up to 3m, or ~10% of runtime. */
const INVENTORY_PREVIEW_MIN_START_SEC = 45;
const INVENTORY_PREVIEW_MAX_START_SEC = 180;
const INVENTORY_PREVIEW_DURATION_RATIO = 0.1;

function getVideoInventoryPreviewStartSec(duration: number, searchMatchStart?: number): number {
    if (!duration || duration <= 0) return 0;
    const safeEnd = Math.max(0, duration - 2);
    const previewStart = Math.min(
        safeEnd,
        INVENTORY_PREVIEW_MAX_START_SEC,
        Math.max(INVENTORY_PREVIEW_MIN_START_SEC, duration * INVENTORY_PREVIEW_DURATION_RATIO),
    );
    if (searchMatchStart != null && Number.isFinite(searchMatchStart)) {
        return Math.min(safeEnd, Math.max(searchMatchStart, previewStart));
    }
    return previewStart;
}

function whenMediaCanPlay(el: HTMLVideoElement, cb: () => void) {
    const run = () => {
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("canplay", run);
        cb();
    };
    const onSeeked = () => {
        if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            run();
        } else {
            el.addEventListener("canplay", run, { once: true });
        }
    };
    if (el.seeking) {
        el.addEventListener("seeked", onSeeked, { once: true });
    } else if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        cb();
    } else {
        el.addEventListener("canplay", run, { once: true });
    }
}

export default function VideoCard({ video, slug, searchMatch, viewType = "ad-inventory", hideTitle = false }: VideoCardProps) {
    const displayName = resolveVideoDisplayName(video.id);
    const duration = video.systemMetadata?.duration || 0;
    const hlsUrl = video.hls?.videoUrl;
    const fallbackThumb = video.hls?.thumbnailUrls?.[0];
    const thumbnailUrl = fallbackThumb || undefined;
    const isVideoInventory = viewType === "video-inventory";
    const previewStartSec = isVideoInventory
        ? getVideoInventoryPreviewStartSec(duration, searchMatch?.start)
        : (searchMatch?.start ?? 0);

    const [hovering, setHovering] = useState(false);
    const [previewReady, setPreviewReady] = useState(false);
    const [progress, setProgress] = useState(0);
    const [muted, setMuted] = useState(true);

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef<number>(0);
    const hoveringRef = useRef(false);
    const hlsRef = useRef<Hls | null>(null);

    const seekToPreviewStart = useCallback((el: HTMLVideoElement) => {
        if (previewStartSec <= 0) return;
        const target = Math.min(previewStartSec, Math.max(0, (el.duration || duration || previewStartSec) - 0.25));
        if (target > 0) {
            el.currentTime = target;
        }
    }, [duration, previewStartSec]);

    const playInventoryPreview = useCallback((el: HTMLVideoElement) => {
        if (!hoveringRef.current) return;
        el.muted = true;
        seekToPreviewStart(el);
        hlsRef.current?.startLoad(-1);

        whenMediaCanPlay(el, () => {
            if (!hoveringRef.current) return;
            void el.play()
                .then(() => {
                    if (!hoveringRef.current) {
                        el.pause();
                        seekToPreviewStart(el);
                        return;
                    }
                    el.muted = false;
                    setMuted(false);
                })
                .catch(() => {
                    void el.play().catch(() => {});
                });
        });
    }, [seekToPreviewStart]);

    const tick = useCallback(() => {
        if (videoRef.current && hoveringRef.current) {
            const el = videoRef.current;
            const pct = (el.currentTime / (el.duration || 1)) * 100;
            setProgress(pct);
            rafRef.current = requestAnimationFrame(tick);
        }
    }, []);

    const handleMouseEnter = () => {
        hoveringRef.current = true;
        setHovering(true);
        const el = videoRef.current;
        if (!el) return;
        if (isVideoInventory) {
            playInventoryPreview(el);
        } else {
            el.muted = false;
            setMuted(false);
        }
    };

    const handleMouseLeave = () => {
        hoveringRef.current = false;
        setHovering(false);
        cancelAnimationFrame(rafRef.current);
        if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.pause();
            if (isVideoInventory) {
                seekToPreviewStart(videoRef.current);
                setPreviewReady(true);
            } else {
                videoRef.current.currentTime = searchMatch?.start ?? 0;
            }
        }
        setMuted(true);
        setProgress(0);
    };

    // Video inventory: hls.js + buffer at preview start for thumbnail and hover playback.
    useEffect(() => {
        if (!isVideoInventory || !hlsUrl) return;
        const el = videoRef.current;
        if (!el) return;

        setPreviewReady(false);

        const destroyHls = () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };

        destroyHls();
        el.removeAttribute("src");
        el.load();

        const markParked = () => {
            if (hoveringRef.current) return;
            el.pause();
            setPreviewReady(true);
        };

        const parkAtPreviewStart = () => {
            if (hoveringRef.current) return;
            seekToPreviewStart(el);
            whenMediaCanPlay(el, markParked);
        };

        const useHlsJs = Hls.isSupported() && hlsUrl.includes(".m3u8");
        if (useHlsJs) {
            const hls = new Hls({
                ...hlsClientConfig(),
                startPosition: previewStartSec > 0 ? previewStartSec : -1,
            });
            hlsRef.current = hls;
            hls.loadSource(hlsUrl);
            hls.attachMedia(el);
            hls.on(Hls.Events.MANIFEST_PARSED, parkAtPreviewStart);
            return () => {
                hls.off(Hls.Events.MANIFEST_PARSED, parkAtPreviewStart);
                destroyHls();
            };
        }

        el.src = hlsUrl;
        el.load();
        el.addEventListener("loadedmetadata", parkAtPreviewStart);
        return () => {
            el.removeEventListener("loadedmetadata", parkAtPreviewStart);
            destroyHls();
        };
    }, [isVideoInventory, hlsUrl, previewStartSec, seekToPreviewStart]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !hlsUrl || !hovering) return;

        if (isVideoInventory) {
            if (el.paused) {
                playInventoryPreview(el);
            }

            const onWaiting = () => {
                if (!hoveringRef.current) return;
                el.addEventListener(
                    "canplay",
                    () => {
                        if (hoveringRef.current && el.paused) {
                            void el.play().catch(() => {});
                        }
                    },
                    { once: true },
                );
            };

            const onEnded = () => {
                if (!hoveringRef.current) return;
                seekToPreviewStart(el);
                whenMediaCanPlay(el, () => {
                    if (hoveringRef.current) {
                        void el.play().catch(() => {});
                    }
                });
            };
            el.addEventListener("waiting", onWaiting);
            el.addEventListener("ended", onEnded);
            rafRef.current = requestAnimationFrame(tick);

            return () => {
                el.removeEventListener("waiting", onWaiting);
                el.removeEventListener("ended", onEnded);
                cancelAnimationFrame(rafRef.current);
            };
        }

        el.muted = true;

        if (el.src !== hlsUrl) {
            el.src = hlsUrl;
            el.load();
        }
        const tryPlay = () => {
            if (!hovering) return;
            if (previewStartSec > 0) el.currentTime = previewStartSec;
            el.play()
                .then(() => {
                    el.muted = false;
                    setMuted(false);
                })
                .catch(() => {});
        };
        el.addEventListener("loadedmetadata", tryPlay);
        el.addEventListener("canplay", tryPlay);
        tryPlay();

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            el.removeEventListener("loadedmetadata", tryPlay);
            el.removeEventListener("canplay", tryPlay);
            cancelAnimationFrame(rafRef.current);
        };
    }, [hovering, hlsUrl, tick, isVideoInventory, previewStartSec, playInventoryPreview, seekToPreviewStart]);

    const targetUrl = viewType === "ad-inventory" && slug
        ? `/ad-inventory/${slug}/${video.id}`
        : `/video-inventory/${video.id}`;

    return (
        <div
            ref={containerRef}
            className={isVideoInventory
                ? "group relative flex flex-col"
                : "group relative flex flex-col bg-white rounded-xl shadow-sm border border-border-light overflow-hidden hover:shadow-md transition-all duration-200"}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <Link
                href={targetUrl}
                className={
                    isVideoInventory
                        ? "relative w-full aspect-video bg-black overflow-hidden isolate rounded-xl border border-border-light"
                        : "relative w-full aspect-video bg-black overflow-hidden isolate"
                }
            >
                <div className="absolute inset-0 z-0">
                    {/* Video Player muted attribute intentionally omitted;
                         mute state is controlled via videoRef.current.muted (JS property)
                         so audio can be enabled after user interaction */}
                    {hlsUrl && (
                        <video
                            ref={videoRef}
                            loop={!isVideoInventory}
                            playsInline
                            preload={isVideoInventory ? "auto" : "none"}
                            controlsList="nodownload noplaybackrate noremoteplayback"
                            disablePictureInPicture
                            disableRemotePlayback
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                            style={{
                                opacity: isVideoInventory ? (previewReady ? 1 : 0) : (hovering ? 1 : 0),
                                zIndex: isVideoInventory ? 2 : (hovering ? 2 : 0),
                            }}
                        />
                    )}

                    {/* Ad inventory: TL thumbnail. Video inventory uses paused frame at previewStartSec. */}
                    {!isVideoInventory && thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={displayName} className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 1 }} />
                    ) : !isVideoInventory ? (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-900" style={{ zIndex: 1 }}>
                            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-white/20">
                                <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor" />
                            </svg>
                        </div>
                    ) : !previewReady ? (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-900" style={{ zIndex: 1 }}>
                            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-white/20">
                                <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor" />
                            </svg>
                        </div>
                    ) : null}
                </div>

                {/* Duration badge & Match Badge */}
                {searchMatch && (
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-mb-green-dark/90 text-white text-[10px] font-bold shadow-sm backdrop-blur-sm z-10 flex items-center gap-1.5 border border-white/20">
                        <span className="flex items-center gap-1">
                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                            {formatDuration(searchMatch.start)}
                        </span>
                    </div>
                )}
                
                {/* Centered Timestamp */}
                {duration > 0 && (
                    <span className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded border border-white text-[11px] font-bold text-white shadow-sm backdrop-blur-sm pointer-events-none transition-opacity duration-200 z-3 ${hovering ? "opacity-0" : "opacity-100"}`}>
                        {formatDuration(duration)}
                    </span>
                )}

                {/* Mute/unmute indicator */}
                {hovering && (
                    <button
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newMuted = !muted;
                            setMuted(newMuted);
                            if (videoRef.current) videoRef.current.muted = newMuted;
                        }}
                        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors cursor-pointer"
                        title={muted ? "Unmute" : "Mute"}
                    >
                        {muted ? (
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M6.717 3.55A.5.5 0 017 4v8a.5.5 0 01-.812.39L3.825 10.5H1.5A.5.5 0 011 10V6a.5.5 0 01.5-.5h2.325l2.363-1.89a.5.5 0 01.529-.06zm7.137 1.596a.5.5 0 010 .708L12.207 7.5l1.647 1.646a.5.5 0 01-.708.708L11.5 8.207l-1.646 1.647a.5.5 0 01-.708-.708L10.793 7.5 9.146 5.854a.5.5 0 01.708-.708L11.5 6.793l1.646-1.647a.5.5 0 01.708 0z"/>
                            </svg>
                        ) : (
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M11.536 14.01A8.473 8.473 0 0014.026 8a8.473 8.473 0 00-2.49-6.01l-.708.707A7.476 7.476 0 0113.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
                                <path d="M10.121 12.596A6.48 6.48 0 0012.025 8a6.48 6.48 0 00-1.904-4.596l-.707.707A5.483 5.483 0 0111.025 8a5.483 5.483 0 01-1.61 3.89l.706.706z"/>
                                <path d="M8.707 11.182A4.486 4.486 0 0010.025 8a4.486 4.486 0 00-1.318-3.182L8 5.525A3.489 3.489 0 019.025 8 3.49 3.49 0 018 10.475l.707.707z"/>
                                <path d="M6.717 3.55A.5.5 0 017 4v8a.5.5 0 01-.812.39L3.825 10.5H1.5A.5.5 0 011 10V6a.5.5 0 01.5-.5h2.325l2.363-1.89a.5.5 0 01.529-.06z"/>
                            </svg>
                        )}
                    </button>
                )}

                {/* Hover progress bar */}
                {hovering && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-4">
                        {searchMatch && duration > 0 && (
                            <div
                                className="absolute top-0 bottom-0 bg-mb-pink-dark/80 z-10"
                                style={{
                                    left: `${(searchMatch.start / duration) * 100}%`,
                                    width: `${(Math.max(searchMatch.end - searchMatch.start, 1) / duration) * 100}%`
                                }}
                            />
                        )}
                        <div className="absolute top-0 bottom-0 left-0 bg-white/80 transition-[width] duration-75 z-20" style={{ width: `${progress}%` }} />
                    </div>
                )}
            </Link>

            {!hideTitle && (
                <p
                    className={
                        isVideoInventory
                            ? "mt-2 text-[11px] text-text-primary font-medium truncate"
                            : "mt-2 px-3 pb-3 text-[11px] text-text-primary font-medium truncate"
                    }
                >
                    {displayName}
                </p>
            )}
        </div>
    );
}
