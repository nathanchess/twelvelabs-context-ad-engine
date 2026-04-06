"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Hls from "hls.js";
import AddCategoryModal from "../../components/AddCategoryModal";
import EmbeddingsView from "../../components/EmbeddingsView";
import {
    getCategoryBySlug,
    updateCategoryContexts,
    updateCategoryExclusions,
    type AdCategory,
} from "../../lib/adInventoryStore";
import { useVideos, invalidateVideoCache, type CachedVideo } from "../../lib/videoCache";
import VideoCard from "../../components/VideoCard";

/* ── Types ──────────────────────────────────────────────── */
type TLVideo = CachedVideo;

/* ── Helpers ────────────────────────────────────────────── */
function formatDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function parseUserMeta(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

/* ── Suggestions ────────────────────────────────────────── */
const contextSuggestions = [
    "Bar scenes", "Social gatherings", "Celebration", "Outdoor", "Construction",
    "Adventure", "Sports viewing", "Party", "Casual hangout", "Business",
    "Planning", "Future-focused", "Family", "Urban", "Travel",
];

const exclusionSuggestions = [
    "Violence", "Addiction", "Underage", "Gambling", "Crime",
    "Health/diet content", "Urban luxury", "Sedentary", "Political", "Religious",
];



/* ── Main Page ──────────────────────────────────────────── */
export default function AdCategoryDetailPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [data, setData] = useState<AdCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [showVideoModal, setShowVideoModal] = useState(false);

    // Video data from cache (instant load, background refresh if stale)
    const { videos: allVideos, loading: videosLoading, refresh: refreshVideos } = useVideos();

    // Filter to this category
    const videos = useMemo(() => {
        return allVideos.filter((v) => {
            const meta = parseUserMeta(v.userMetadata);
            return meta.slug === slug;
        });
    }, [allVideos, slug]);

    // Inline add state
    const [addingContext, setAddingContext] = useState(false);
    const [contextInput, setContextInput] = useState("");
    const [addingExclusion, setAddingExclusion] = useState(false);
    const [exclusionInput, setExclusionInput] = useState("");

    const [activeTab, setActiveTab] = useState<"videos" | "embeddings">("videos");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{ videoId: string, start: number, end: number, confidence: string, score: number }[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchFocused, setSearchFocused] = useState(false);
    const [showPrompts, setShowPrompts] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!searchQuery) {
            setSearchResults(null);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch("/api/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: searchQuery })
                });
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data.results || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowPrompts(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const cat = getCategoryBySlug(slug);
        setData(cat || null);
        setLoading(false);
    }, [slug]);

    // Computed stats from real data
    const videoCount = videos.length;
    const totalSeconds = videos.reduce(
        (sum, v) => sum + (v.systemMetadata?.duration || 0),
        0
    );
    const totalDurationStr = totalSeconds > 0 ? formatTotalDuration(totalSeconds) : "0m";

    /* ── Context / Exclusion mutations ──────────────────── */
    function addContext(val: string) {
        const trimmed = val.trim();
        if (!trimmed || !data || data.targetContexts.includes(trimmed)) return;
        const next = [...data.targetContexts, trimmed];
        updateCategoryContexts(slug, next);
        setData({ ...data, targetContexts: next });
        setContextInput("");
        setAddingContext(false);
    }

    function removeContext(ctx: string) {
        if (!data) return;
        const next = data.targetContexts.filter((c) => c !== ctx);
        updateCategoryContexts(slug, next);
        setData({ ...data, targetContexts: next });
    }

    function addExclusion(val: string) {
        const trimmed = val.trim();
        if (!trimmed || !data || data.exclusions.includes(trimmed)) return;
        const next = [...data.exclusions, trimmed];
        updateCategoryExclusions(slug, next);
        setData({ ...data, exclusions: next });
        setExclusionInput("");
        setAddingExclusion(false);
    }

    function removeExclusion(exc: string) {
        if (!data) return;
        const next = data.exclusions.filter((e) => e !== exc);
        updateCategoryExclusions(slug, next);
        setData({ ...data, exclusions: next });
    }

    const unusedContextSuggestions = contextSuggestions.filter(
        (s) => !data?.targetContexts.includes(s) && s.toLowerCase().includes(contextInput.toLowerCase())
    ).slice(0, 5);

    const unusedExclusionSuggestions = exclusionSuggestions.filter(
        (s) => !data?.exclusions.includes(s) && s.toLowerCase().includes(exclusionInput.toLowerCase())
    ).slice(0, 5);

    const displayVideos = useMemo(() => {
        if (!searchQuery) return videos;
        if (!searchResults) return videos;
        const matchedVideoIds = new Set(searchResults.map(r => r.videoId));
        return videos.filter(v => matchedVideoIds.has(v.id));
    }, [videos, searchQuery, searchResults]);

    if (loading) return <div className="min-h-screen bg-white" />;

    if (!data) {
        return (
            <div className="min-h-screen bg-white">
                <header className="border-b border-border-light px-8 py-6">
                    <Link href="/ad-inventory" className="text-sm text-text-tertiary hover:text-text-primary transition-colors mb-2 inline-flex items-center gap-1">
                        <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Back to Ad Inventory
                    </Link>
                    <h1 className="text-[32px] font-bold tracking-[-1.5px] text-text-primary mt-2">Category Not Found</h1>
                </header>
                <div className="px-8 py-12 text-center">
                    <p className="text-sm text-text-tertiary">This ad category doesn&apos;t exist.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* ── Header ─────────────────────────────────────────── */}
            <header className="border-b border-border-light px-8 pt-6">
                <div className="flex items-start justify-between pb-6">
                    <div>
                        <Link href="/ad-inventory" className="text-sm text-text-tertiary hover:text-text-primary transition-colors mb-2 inline-flex items-center gap-1">
                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            Back to Ad Inventory
                        </Link>
                        <h1 className="text-[32px] font-bold tracking-[-1.5px] text-text-primary mt-2">{data.category}</h1>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {data.brands.map((brand) => (
                                <span key={brand} className="px-2.5 py-0.5 rounded-full bg-gray-50 text-[11px] font-medium text-text-secondary">
                                    {brand}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right side: Stats + Add Video */}
                    <div className="flex items-center gap-4 shrink-0 mt-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-text-secondary">
                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" clipRule="evenodd" d="M5.55217 4.79058V7.20942L7.26522 6L5.55217 4.79058ZM4.5 4.315C4.5 3.65679 5.23462 3.27103 5.76926 3.64849L8.15593 5.33348C8.61469 5.65737 8.61469 6.34263 8.15593 6.66652L5.76926 8.35151C5.23462 8.72897 4.5 8.34321 4.5 7.685V4.315Z" fill="currentColor" />
                            </svg>
                            <span className="text-xs font-medium">
                                {videosLoading ? "…" : `${videoCount} video${videoCount !== 1 ? "s" : ""}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-text-secondary">
                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
                                <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-xs font-medium">
                                {videosLoading ? "…" : totalDurationStr}
                            </span>
                        </div>
                        <button
                            onClick={() => setShowVideoModal(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border-light text-sm font-medium text-text-primary hover:border-border-default hover:bg-gray-50 transition-all duration-200"
                        >
                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Add Video
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => setActiveTab("videos")}
                        className={`text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer ${activeTab === "videos" ? "text-mb-green-dark border-b-2 border-mb-green-dark pb-3 -mb-[1px]" : "text-text-tertiary hover:text-text-primary pb-3 -mb-[1px]"}`}
                    >
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Videos
                    </button>
                    <button
                        onClick={() => setActiveTab("embeddings")}
                        className={`text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer ${activeTab === "embeddings" ? "text-mb-green-dark border-b-2 border-mb-green-dark pb-3 -mb-[1px]" : "text-text-tertiary hover:text-text-primary pb-3 -mb-[1px]"}`}
                    >
                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Metadata View
                    </button>
                </div>
            </header>

            {/* ── Content (full width) ───────────────────────────── */}
            <div className="px-8 py-6 space-y-8">
                {activeTab === "embeddings" && (
                    <EmbeddingsView videos={videos} categoryName={data.category} />
                )}

                {activeTab === "videos" && (
                    <>
                        {/* Targeting & Brand Safety Rules Box */}
                        <div className="bg-white border border-border-light rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-border-light bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-text-primary">Targeting &amp; Brand Safety Rules</h2>
                                    <p className="text-xs text-text-tertiary mt-0.5">Edit the base rules for this category. These configure the AI recommendations.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-light">
                                {/* Target Contexts */}
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-mb-green-dark flex items-center gap-1.5">
                                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 6l1.5 1.5L8 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            Target Contexts
                                        </h3>
                                        {!addingContext && (
                                            <button
                                                onClick={() => setAddingContext(true)}
                                                className="text-[10px] font-semibold text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                                ADD
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                                        TwelveLabs will prioritize ad placement during scenes matching these contexts.
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {data.targetContexts.map((ctx) => (
                                            <span key={ctx} className="inline-flex items-center px-3 py-1.5 rounded-full bg-mb-green-light/40 text-[11px] font-medium text-mb-green-dark group/tag transition-all duration-200">
                                                {ctx}
                                                <button onClick={() => removeContext(ctx)} className="w-0 overflow-hidden opacity-0 group-hover/tag:w-3.5 group-hover/tag:ml-1 group-hover/tag:opacity-100 transition-all duration-200 hover:text-text-primary shrink-0 cursor-pointer">
                                                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    {addingContext && (
                                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-border-light">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={contextInput}
                                                    onChange={(e) => setContextInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addContext(contextInput); } if (e.key === "Escape") { setAddingContext(false); setContextInput(""); } }}
                                                    placeholder="Type scene tags to target..."
                                                    className="flex-1 px-3 py-2 rounded border border-border-default bg-white text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-mb-green-dark transition-colors"
                                                />
                                                <button onClick={() => { setAddingContext(false); setContextInput(""); }} className="text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer">Cancel</button>
                                            </div>
                                            {unusedContextSuggestions.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                                    {unusedContextSuggestions.map((s) => (
                                                        <button key={s} onClick={() => addContext(s)} className="px-2 py-1 rounded border border-border-light bg-white text-[10px] font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors cursor-pointer shadow-sm">
                                                            + {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Exclusions */}
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-mb-pink-dark flex items-center gap-1.5">
                                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                            Negative Contexts & Exclusions
                                        </h3>
                                        {!addingExclusion && (
                                            <button
                                                onClick={() => setAddingExclusion(true)}
                                                className="text-[10px] font-semibold text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                                ADD
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                                        Videos containing these themes will be excluded from ad placement.
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {data.exclusions.map((exc) => (
                                            <span key={exc} className="inline-flex items-center px-3 py-1.5 rounded-full bg-mb-pink-light/40 text-[11px] font-medium text-mb-pink-dark group/tag transition-all duration-200">
                                                {exc}
                                                <button onClick={() => removeExclusion(exc)} className="w-0 overflow-hidden opacity-0 group-hover/tag:w-3.5 group-hover/tag:ml-1 group-hover/tag:opacity-100 transition-all duration-200 hover:text-text-primary shrink-0 cursor-pointer">
                                                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    {addingExclusion && (
                                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-border-light">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={exclusionInput}
                                                    onChange={(e) => setExclusionInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExclusion(exclusionInput); } if (e.key === "Escape") { setAddingExclusion(false); setExclusionInput(""); } }}
                                                    placeholder="Type themes or tags to exclude..."
                                                    className="flex-1 px-3 py-2 rounded border border-border-default bg-white text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-mb-pink-dark transition-colors"
                                                />
                                                <button onClick={() => { setAddingExclusion(false); setExclusionInput(""); }} className="text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer">Cancel</button>
                                            </div>
                                            {unusedExclusionSuggestions.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                                    {unusedExclusionSuggestions.map((s) => (
                                                        <button key={s} onClick={() => addExclusion(s)} className="px-2 py-1 rounded border border-border-light bg-white text-[10px] font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors cursor-pointer shadow-sm">
                                                            + {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Videos — full width grid */}
                        <div className="pt-4">
                            <div className="flex items-center justify-start mb-5">
                                {/* Search Bar */}
                                <div ref={searchRef} className="relative w-full max-w-[400px]">
                                    <div className={`gradient-search-wrapper ${searchFocused ? "active" : ""}`}>
                                        <div className="gradient-search-inner flex items-center">
                                            <span className={`pl-4 transition-colors duration-200 ${searchFocused ? "text-text-primary" : "text-text-tertiary"}`}>
                                                <svg viewBox="0 0 12 11.707" fill="none" className="w-4 h-4">
                                                    <path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" fill="currentColor" />
                                                </svg>
                                            </span>
                                            <input
                                                type="text"
                                                placeholder="Semantic search within these videos..."
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setShowPrompts(e.target.value === "");
                                                }}
                                                onFocus={() => {
                                                    setSearchFocused(true);
                                                    if (!searchQuery) setShowPrompts(true);
                                                }}
                                                onBlur={() => setSearchFocused(false)}
                                                className="w-full px-3 py-2 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                                            />
                                            {isSearching && (
                                                <div className="pr-4 text-text-tertiary">
                                                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                                                        <path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                    </svg>
                                                </div>
                                            )}
                                            {searchQuery && !isSearching && (
                                                <button
                                                    onClick={() => setSearchQuery("")}
                                                    className="pr-4 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                                                >
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                                        <path d="M9.5 2.5L2.5 9.5M2.5 2.5L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Prompts Dropdown */}
                                    {showPrompts && searchFocused && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-border-light shadow-lg z-20 animate-fade-in overflow-hidden">
                                            <div className="px-4 py-2.5 border-b border-border-light">
                                                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">
                                                    Try a sample prompt
                                                </p>
                                            </div>
                                            {["Close-up product shots", "People talking", "Brand logo appearing"].map((prompt, i) => (
                                                <button
                                                    key={i}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setSearchQuery(prompt);
                                                        setShowPrompts(false);
                                                    }}
                                                    className="w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors flex items-center gap-2.5 cursor-pointer"
                                                >
                                                    <span className="text-text-tertiary shrink-0">
                                                        <svg viewBox="0 0 12 11.707" fill="none" className="w-3.5 h-3.5"><path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" fill="currentColor" /></svg>
                                                    </span>
                                                    {prompt}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {videosLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-border-light">
                                    <svg className="animate-spin w-6 h-6 text-text-tertiary mb-3" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                                        <path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                    <p className="text-sm text-text-tertiary">Loading videos…</p>
                                </div>
                            ) : displayVideos.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {displayVideos.map((video) => {
                                        const match = searchResults?.find(r => r.videoId === video.id || r.videoId === video.hls?.videoUrl);
                                        return <VideoCard key={video.id} video={video} slug={slug} searchMatch={match} />;
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-border-light">
                                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                                        <svg viewBox="0 0 12 12" fill="none" className="w-5 h-5 text-text-tertiary">
                                            <path fillRule="evenodd" clipRule="evenodd" d="M5.55217 4.79058V7.20942L7.26522 6L5.55217 4.79058ZM4.5 4.315C4.5 3.65679 5.23462 3.27103 5.76926 3.64849L8.15593 5.33348C8.61469 5.65737 8.61469 6.34263 8.15593 6.66652L5.76926 8.35151C5.23462 8.72897 4.5 8.34321 4.5 7.685V4.315Z" fill="currentColor" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium text-text-primary mb-1">
                                        {searchQuery ? "No search results" : "No videos yet"}
                                    </p>
                                    <p className="text-sm text-text-tertiary">
                                        {searchQuery ? "Try asking a different way." : "Upload videos to get started."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Add Video Modal (video-only mode) */}
            <AddCategoryModal
                open={showVideoModal}
                onClose={() => {
                    setShowVideoModal(false);
                    refreshVideos(); // Refresh cache after upload
                }}
                videoOnly
                categoryName={data.category}
                categoryContexts={data.targetContexts}
                categoryExclusions={data.exclusions}
            />
        </div>
    );
}
