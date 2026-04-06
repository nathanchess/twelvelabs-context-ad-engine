"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { type CachedVideo } from "../lib/videoCache";

interface VideoCardProps {
    video: CachedVideo;
    /** If provided, clicking the card links to this ad category detail page */
    slug?: string;
    /** Whether this is an Ad Inventory view or Video Inventory view. Determines link target. */
    viewType?: "ad-inventory" | "video-inventory";
    searchMatch?: { start: number; end: number; confidence: string; score?: number };
}

function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoCard({ video, slug, searchMatch, viewType = "ad-inventory" }: VideoCardProps) {
    const filename = video.systemMetadata?.filename || "Untitled";
    const displayName = filename.replace(/\.[^.]+$/, "");
    const duration = video.systemMetadata?.duration || 0;
    const hlsUrl = video.hls?.videoUrl;
    const fallbackThumb = video.hls?.thumbnailUrls?.[0];
    const thumbnailUrl = fallbackThumb || undefined;

    const [hovering, setHovering] = useState(false);
    const [progress, setProgress] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef<number>(0);

    const tick = useCallback(() => {
        if (videoRef.current && hovering) {
            const el = videoRef.current;
            const pct = (el.currentTime / (el.duration || 1)) * 100;
            setProgress(pct);
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [hovering]);

    const handleMouseEnter = () => {
        setHovering(true);
    };

    const handleMouseLeave = () => {
        setHovering(false);
        cancelAnimationFrame(rafRef.current);
        if (videoRef.current) {
            videoRef.current.pause();
            if (searchMatch) {
                videoRef.current.currentTime = searchMatch.start;
            } else {
                videoRef.current.currentTime = 0;
            }
        }
        setProgress(0);
    };

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !hlsUrl || !hovering) return;

        // Use native media loading for hover previews to avoid HLS.js XHR CORS preflight failures
        // against CloudFront URLs that don't return Access-Control-Allow-Origin on localhost.
        if (el.src !== hlsUrl) {
            el.src = hlsUrl;
            el.load();
        }
        const tryPlay = () => {
            if (!hovering) return;
            el.play().catch(() => { });
        };
        // First-hover reliability: attempt play once metadata/canplay is ready.
        el.addEventListener("loadedmetadata", tryPlay);
        el.addEventListener("canplay", tryPlay);
        tryPlay();

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            el.removeEventListener("loadedmetadata", tryPlay);
            el.removeEventListener("canplay", tryPlay);
            cancelAnimationFrame(rafRef.current);
        };
    }, [hovering, hlsUrl, tick]);

    // Initial setup for search matches - seek to correct start time
    useEffect(() => {
        const el = videoRef.current;
        if (el && searchMatch && !hovering) {
            el.currentTime = searchMatch.start;
            // Need to wait for metadata before jumping
            const onLoadedMetadata = () => { el.currentTime = searchMatch.start; };
            el.addEventListener('loadedmetadata', onLoadedMetadata);
            return () => el.removeEventListener('loadedmetadata', onLoadedMetadata);
        }
    }, [searchMatch, hovering]);

    const targetUrl = viewType === "ad-inventory" && slug
        ? `/ad-inventory/${slug}/${video.id}`
        : `/video-inventory/${video.id}`; // Optional: Create a detailed view for Video Inventory later

    const isVideoInventory = viewType === "video-inventory";

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
                    {/* Video Player */}
                    {hlsUrl && (
                        <video
                            ref={videoRef}
                            loop
                            muted
                            playsInline
                            preload="none"
                            controlsList="nodownload noplaybackrate noremoteplayback"
                            disablePictureInPicture
                            disableRemotePlayback
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                            style={{ opacity: hovering ? 1 : 0, zIndex: hovering ? 2 : 0 }}
                        />
                    )}

                    {/* Thumbnail / placeholder (behind video) */}
                    {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={filename} className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 1 }} />
                    ) : (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-900" style={{ zIndex: 1 }}>
                            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-white/20">
                                <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor" />
                            </svg>
                        </div>
                    )}
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

            <p
                className={
                    isVideoInventory
                        ? "mt-2 text-[11px] text-text-primary font-medium truncate"
                        : "mt-2 px-3 pb-3 text-[11px] text-text-primary font-medium truncate"
                }
            >
                {displayName}
            </p>
        </div>
    );
}
