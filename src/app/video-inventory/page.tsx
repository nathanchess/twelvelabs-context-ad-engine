"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useVideos } from "../lib/videoCache";
import { Button, PlusIcon } from "@twelvelabs-io/react";
import VideoInventoryUploadModal from "../components/VideoInventoryUploadModal";
import VideoInventoryCard from "../components/VideoInventoryCard";
import { useVideoInventoryPrefs } from "../lib/videoInventoryStore";
import ScrollFadeUp from "../components/ScrollFadeUp";
import ScrollProgressBar from "../components/ScrollProgressBar";
const genres = [
    "All Genres",
    "Technology",
    "Education",
    "Entertainment",
    "Sports",
    "News",
    "Music",
    "Gaming",
    "Lifestyle",
];

const samplePrompts = [
    "People celebrating at a party",
    "Outdoor sports or athletic activity",
    "Dramatic indoor conversation",
    "Luxury lifestyle or upscale setting",
    "Comedic or lighthearted scene",
    "Nature or outdoor adventure",
];

const searchIcon = (
    <svg viewBox="0 0 12 11.707" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" fill="currentColor" />
    </svg>
);

const plusIcon = <PlusIcon className="size-4" />;

type SearchResult = { videoId: string; start: number; end: number; confidence: string; score: number };

export default function VideoInventoryPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [selectedGenre, setSelectedGenre] = useState("All Genres");
    const [showPrompts, setShowPrompts] = useState(false);
    const [genreOpen, setGenreOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const genreRef = useRef<HTMLDivElement>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Semantic search state
    const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Fetch Videos for the generic inventory index
    const { videos: allVideos, loading: videosLoading, refresh: refreshVideos } = useVideos("tl-context-engine-videos", {
        includeEmbeddings: false,
        refetchOnMount: true,
    });
    const { renameVideo, hideVideo, registerUploadedVideo, getDisplayName, isVisible } = useVideoInventoryPrefs();

    // Split ready vs. still-indexing videos (allowlisted + this browser's uploads only)
    const readyVideos = allVideos.filter((v) => !v.processing && isVisible(v.id));
    const processingVideos = allVideos.filter((v) => v.processing && isVisible(v.id));

    // Debounced semantic search via TwelveLabs /api/search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch("/api/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: searchQuery, indexName: "tl-context-engine-videos" }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data.results || []);
                }
            } catch (err) {
                console.error("[video-inventory] Search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (genreRef.current && !genreRef.current.contains(e.target as Node)) {
                setGenreOpen(false);
            }
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowPrompts(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // When a search is active, show only matched videos; otherwise show all.
    // Match on both video.id (TwelveLabs videoId) and video.hls?.videoUrl as fallback.
    const filteredVideos = useMemo(() => {
        if (searchQuery.trim() && searchResults) {
            const matchedIds = new Set(searchResults.map((r) => r.videoId));
            return readyVideos.filter((v) => matchedIds.has(v.id) || matchedIds.has(v.hls?.videoUrl ?? ""));
        }
        return readyVideos;
    }, [readyVideos, searchQuery, searchResults]);

    return (
        <div className="min-h-screen bg-white">
            <ScrollProgressBar />

            <ScrollFadeUp order={0}>
            <header className="border-b border-border-secondary px-8 py-6 flex justify-between items-start">
                <div>
                    <h1 className="text-[32px] font-bold tracking-[-1.5px] text-foreground-body">
                        Video Inventory
                    </h1>
                    <p className="text-sm text-foreground-subtle mt-1">
                        Semantic search, browse, and upload your content library. Powered by TwelveLabs Marengo.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="primary"
                    size="regular"
                    onClick={() => setShowUploadModal(true)}
                    className="gap-1.5"
                >
                    {plusIcon}
                    Upload Videos
                </Button>
            </header>
            </ScrollFadeUp>

            <ScrollFadeUp order={1} className="relative z-40">
            {/* ── Search + Genre Filter ─────────────────────────── */}
            <div className="px-8 pt-6 pb-2">
                <div className="flex items-center justify-between gap-4">
                    {/* ── Gradient search bar ────────────────────────── */}
                    <div ref={searchRef} className="relative z-40 flex-1 max-w-[600px]">
                        <div className={`gradient-search-wrapper ${searchFocused ? "active" : ""}`}>
                            <div className="gradient-search-inner flex items-center">
                                <span className={`pl-4 transition-colors duration-200 ${searchFocused ? "text-foreground-body" : "text-foreground-muted"}`}>
                                    {isSearching
                                        ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" /></svg>
                                        : searchIcon}
                                </span>
                                <input
                                    type="text"
                                    placeholder="Semantic search — describe a scene, emotion, or moment..."
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
                                    className="w-full px-3 py-3 bg-transparent text-sm text-foreground-body placeholder:text-foreground-muted focus:outline-none"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                                        className="pr-4 text-foreground-muted hover:text-foreground-body transition-colors"
                                    >
                                        <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                            <path d="M9.5 2.5L2.5 9.5M2.5 2.5L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Sample Prompts Dropdown */}
                        {showPrompts && searchFocused && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-surface-white rounded-xl border border-border-secondary shadow-lg z-50 animate-fade-in overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-border-secondary">
                                    <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">
                                        Try a sample prompt
                                    </p>
                                </div>
                                {samplePrompts.map((prompt, i) => (
                                    <button
                                        key={i}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setSearchQuery(prompt);
                                            setShowPrompts(false);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-foreground-subtle hover:bg-gray-50 hover:text-foreground-body transition-colors flex items-center gap-2.5"
                                    >
                                        <span className="text-foreground-muted shrink-0">{searchIcon}</span>
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Genre Dropdown (far right) ────────────────── */}
                    <div ref={genreRef} className="relative z-40 ml-auto">
                        <button
                            onClick={() => setGenreOpen(!genreOpen)}
                            className={`
                flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
                transition-all duration-200 whitespace-nowrap
                ${genreOpen
                                    ? "border-gray-700 text-foreground-body"
                                    : "border-border-secondary text-foreground-subtle hover:border-border-primary hover:text-foreground-body"
                                }
              `}
                        >
                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5 text-foreground-muted">
                                <path d="M4 4V5H1V4H4ZM4 1H1V5L0.897461 4.99512C0.393331 4.94379 0 4.51768 0 4V1C0 0.447715 0.447715 0 1 0H4C4.55228 0 5 0.447715 5 1V4C5 4.55228 4.55228 5 4 5V1Z" fill="currentColor" />
                                <path d="M4 11V12H1V11H4ZM4 8H1V12L0.897461 11.9951C0.393331 11.9438 0 11.5177 0 11V8C0 7.44772 0.447715 7 1 7H4C4.55228 7 5 7.44772 5 8V11C5 11.5523 4.55228 12 4 12V8Z" fill="currentColor" />
                                <path d="M11 4V5H8V4H11ZM11 1H8V5L7.89746 4.99512C7.39333 4.94379 7 4.51768 7 4V1C7 0.447715 7.44772 0 8 0H11C11.5523 0 12 0.447715 12 1V4C12 4.55228 11.5523 5 11 5V1Z" fill="currentColor" />
                                <path d="M11 11V12H8V11H11ZM11 8H8V12L7.89746 11.9951C7.39333 11.9438 7 11.5177 7 11V8C7 7.44772 7.44772 7 8 7H11C11.5523 7 12 7.44772 12 8V11C12 11.5523 11.5523 12 11 12V8Z" fill="currentColor" />
                            </svg>
                            {selectedGenre}
                            <svg viewBox="0 0 12 12" fill="none" className={`w-3 h-3 text-foreground-muted transition-transform duration-200 ${genreOpen ? "rotate-180" : ""}`}>
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {genreOpen && (
                            <div className="absolute top-full right-0 mt-2 w-[200px] bg-surface-white rounded-xl border border-border-secondary shadow-lg z-50 animate-fade-in overflow-hidden py-1">
                                {genres.map((genre) => (
                                    <button
                                        key={genre}
                                        onClick={() => {
                                            setSelectedGenre(genre);
                                            setGenreOpen(false);
                                        }}
                                        className={`
                      w-full text-left px-4 py-2 text-sm flex items-center gap-3
                      transition-colors duration-150
                      ${selectedGenre === genre
                                                ? "text-foreground-body bg-gray-50"
                                                : "text-foreground-subtle hover:bg-gray-50 hover:text-foreground-body"
                                            }
                    `}
                                    >
                                        {/* Radio indicator */}
                                        <span className={`
                      w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                      transition-colors duration-150
                      ${selectedGenre === genre ? "border-gray-700" : "border-gray-300"}
                    `}>
                                            {selectedGenre === genre && (
                                                <span className="w-2 h-2 rounded-full bg-gray-700" />
                                            )}
                                        </span>
                                        {genre}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            </ScrollFadeUp>

            <ScrollFadeUp order={2}>
            {/* ── Content Grid ─────────────────────────────────── */}
            <main className="px-8 pb-12">
                {/* ── Currently Indexing Banner ──────────────────────── */}
            {processingVideos.length > 0 && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <div className="flex items-center gap-2.5 mb-3">
                        {/* Pulsing dot */}
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        </span>
                        <p className="text-sm font-semibold text-amber-800">
                            {processingVideos.length} video{processingVideos.length !== 1 ? 's' : ''} currently indexing in TwelveLabs
                        </p>
                        <span className="ml-auto text-[11px] text-amber-600 font-medium">Will appear automatically once ready</span>
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        {processingVideos.map((video) => {
                            const displayName = getDisplayName(video.id);
                            const thumb = video.hls?.thumbnailUrls?.[0];
                            return (
                                <div key={video.id} className="relative w-32 rounded-xl overflow-hidden border border-amber-200 bg-amber-100 shrink-0 group">
                                    {/* Thumbnail or placeholder */}
                                    <div className="aspect-video relative">
                                        {thumb ? (
                                            <img src={thumb} alt={displayName} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-amber-200/60">
                                                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-amber-500">
                                                    <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                                    <path d="M10 9.5L15 12L10 14.5V9.5Z" fill="currentColor" />
                                                </svg>
                                            </div>
                                        )}
                                        {/* Spinner overlay */}
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="28 8" />
                                            </svg>
                                        </div>
                                    </div>
                                    {/* Filename */}
                                    <p className="px-2 py-1.5 text-[10px] font-medium text-amber-800 truncate">{displayName}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Search status bar */}
                {searchQuery && (
                    <div className="mb-4 flex items-center gap-3">
                        {isSearching ? (
                            <span className="flex items-center gap-2 text-xs text-foreground-muted">
                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" /></svg>
                                Searching across all videos semantically…
                            </span>
                        ) : searchResults !== null ? (
                            <span className="text-xs text-foreground-subtle">
                                <span className="font-semibold text-foreground-body">{filteredVideos.length}</span> video{filteredVideos.length !== 1 ? "s" : ""} matched &ldquo;{searchQuery}&rdquo;
                                {searchResults.length > 0 && (
                                    <span className="ml-1.5 text-foreground-muted">— cards show matched timestamps</span>
                                )}
                            </span>
                        ) : null}
                        <button
                            onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                            className="ml-auto text-xs text-foreground-muted hover:text-foreground-body transition-colors"
                        >
                            Clear search
                        </button>
                    </div>
                )}

                {videosLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="flex gap-2">
                            <div className="w-2 h-2 rounded-full bg-foreground-muted animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-foreground-muted animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-foreground-muted animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                ) : readyVideos.length === 0 && processingVideos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="relative w-24 h-24 mb-6 grayscale opacity-20 hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-pointer">
                            <svg viewBox="0 0 460 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
                                <path fillRule="evenodd" clipRule="evenodd" d="M129.6 1L193.3 154.2H129.6L129.6 1ZM65.8015 1L129.502 154.2H65.8015L65.8015 1Z" fill="#F45C45" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M129.6 307.3L193.2 154.2H129.6V307.3ZM65.8015 307.3L129.402 154.2H65.8015V307.3Z" fill="#2ED1A8" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M193.4 1H257.099L193.4 154.2V1ZM257.2 1L320.9 154.2H257.2L257.2 1Z" fill="#F8B122" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M193.4 307.3H257.099L193.4 154.2V307.3ZM257.2 307.3H320.9L257.2 154.2V307.3Z" fill="#7581FF" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M0 1H63.6997L0 154.2V1Z" fill="#F8B122" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-foreground-body mb-2 tracking-tight">Your Video Inventory is Empty</h3>
                        <p className="text-sm text-foreground-subtle max-w-md mx-auto mb-6">
                            Upload your video content to have TwelveLabs automatically analyze, index, and prepare it for highly-relevant contextual ad insertion.
                        </p>
                        <Button
                            type="button"
                            variant="primary"
                            size="md"
                            onClick={() => setShowUploadModal(true)}
                            className="gap-1.5"
                        >
                            {plusIcon}
                            Upload First Video
                        </Button>
                    </div>
                ) : filteredVideos.length === 0 && searchQuery ? (
                    <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-border-secondary">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                            {searchIcon}
                        </div>
                        <p className="text-sm font-medium text-foreground-body mb-1">No videos matched your search</p>
                        <p className="text-sm text-foreground-muted mb-4">Try rephrasing your query or describe different visual elements.</p>
                        <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="text-sm text-foreground-subtle hover:text-foreground-body font-medium transition-colors">
                            Clear search
                        </button>
                    </div>
                ) : filteredVideos.length === 0 ? (
                    <div className="py-16 text-center">
                        <p className="text-foreground-subtle mb-2 border border-border-secondary rounded-2xl max-w-md mx-auto py-3 bg-gray-50 text-sm">No videos match your criteria.</p>
                        <button onClick={() => { setSearchQuery(""); setSelectedGenre("All Genres"); }} className="text-tl-master-brand-dark-pink text-sm font-semibold hover:underline">
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredVideos.map((video) => {
                            const match = searchResults?.find((r) => r.videoId === video.id || r.videoId === video.hls?.videoUrl);
                            const displayName = getDisplayName(video.id);
                            return (
                                <div key={video.id} className="relative overflow-visible">
                                    <VideoInventoryCard
                                        video={video}
                                        displayName={displayName}
                                        searchMatch={match}
                                        onRename={(name) => renameVideo(video.id, name)}
                                        onDelete={() => hideVideo(video.id)}
                                    />
                                    {match && (
                                        <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 text-tl-master-brand-dark-green shrink-0">
                                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                            </svg>
                                            <span className="text-[10px] text-foreground-muted">
                                                Match at{" "}
                                                <span className="text-foreground-subtle font-medium">
                                                    {Math.floor(match.start / 60)}:{String(Math.floor(match.start % 60)).padStart(2, "0")}
                                                    {" "}–{" "}
                                                    {Math.floor(match.end / 60)}:{String(Math.floor(match.end % 60)).padStart(2, "0")}
                                                </span>
                                                <span className="ml-1 capitalize text-foreground-muted">· {match.confidence}</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
            </ScrollFadeUp>

            <VideoInventoryUploadModal
                open={showUploadModal}
                onVideoIndexed={registerUploadedVideo}
                onClose={(didUpload) => {
                    setShowUploadModal(false);
                    if (didUpload) refreshVideos();
                }}
            />
        </div>
    );
}
