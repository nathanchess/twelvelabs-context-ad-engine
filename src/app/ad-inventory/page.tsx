"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import AddCategoryModal from "../components/AddCategoryModal";
import { getCategories, type AdCategory } from "../lib/adInventoryStore";
import { useVideos } from "../lib/videoCache";

/* ── Types ──────────────────────────────────────────────── */
interface CategoryData {
    count: number;
    totalDuration: string;
    thumbnails: string[];
}

/* ── Helpers ────────────────────────────────────────────── */
function getBannerForSlug(slug: string): string {
    if (slug.includes("snacks") || slug.includes("doritos")) return "/doritos_banner.png";
    if (slug.includes("financial") || slug.includes("fidelity")) return "/fidelity.png";
    if (slug.includes("automotive") || slug.includes("truck") || slug.includes("ford")) return "/ford_banner.png";
    if (slug.includes("spirits") || slug.includes("goose")) return "/goose_banner.png";
    return "/doritos_banner.png"; // Fallback
}

function formatTotalDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const searchIcon = (
    <svg viewBox="0 0 12 11.707" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" fill="currentColor" />
    </svg>
);

export default function AdInventoryPage() {
    const [categories, setCategories] = useState<AdCategory[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);

    // Video data from cache (instant on navigation, background refresh if stale)
    const { videos: allVideos, loading: dataLoading, refresh: refreshVideos } = useVideos();

    useEffect(() => {
        setCategories(getCategories());
    }, []);

    function refreshCategories() {
        setCategories(getCategories());
    }

    // Compute per-category data from cached videos
    const dataMap = useMemo(() => {
        const map: Record<string, { count: number; secs: number; thumbnails: string[] }> = {};
        for (const video of allVideos) {
            try {
                const meta = JSON.parse(video.userMetadata || "{}");
                const slug = meta.slug as string;
                if (!slug) continue;
                if (!map[slug]) map[slug] = { count: 0, secs: 0, thumbnails: [] };
                map[slug].count += 1;
                map[slug].secs += video.systemMetadata?.duration || 0;
                const thumb = video.hls?.thumbnailUrls?.[0];
                if (thumb && map[slug].thumbnails.length < 4) {
                    map[slug].thumbnails.push(thumb);
                }
            } catch { /* ignore */ }
        }
        const result: Record<string, CategoryData> = {};
        for (const slug of Object.keys(map)) {
            result[slug] = {
                count: map[slug].count,
                totalDuration: map[slug].secs > 0 ? formatTotalDuration(map[slug].secs) : "0m",
                thumbnails: map[slug].thumbnails,
            };
        }
        return result;
    }, [allVideos]);



    const filteredAds = categories.filter((ad) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            ad.category.toLowerCase().includes(q) ||
            ad.brands.some((b) => b.toLowerCase().includes(q)) ||
            ad.targetContexts.some((c) => c.toLowerCase().includes(q))
        );
    });

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b border-border-light px-8 py-6">
                <h1 className="text-[32px] font-bold tracking-[-1.5px] text-text-primary">Ad Inventory</h1>
                <p className="text-sm text-text-secondary mt-1">Manage and match ads to your video content.</p>
            </header>

            {/* ── Search Bar + Add Category ─────────────────────── */}
            <div className="px-8 pt-6 pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex-1 max-w-[560px]">
                        <div className={`gradient-search-wrapper ${searchFocused ? "active" : ""}`}>
                            <div className="gradient-search-inner flex items-center">
                                <span className={`pl-4 transition-colors duration-200 ${searchFocused ? "text-text-primary" : "text-text-tertiary"}`}>
                                    {searchIcon}
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search ads by category, brand, or context..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                    className="w-full px-3 py-3 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery("")} className="pr-4 text-text-tertiary hover:text-text-primary transition-colors">
                                        <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M9.5 2.5L2.5 9.5M2.5 2.5L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-light text-sm font-medium text-text-primary hover:border-border-default hover:bg-gray-50 transition-all duration-200"
                    >
                        <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        Add Category
                    </button>
                </div>
            </div>

            {/* ── Ad Cards Grid ─────────────────────────────────── */}
            <div className="px-8 py-6">
                {filteredAds.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredAds.map((ad) => {
                            const catData = dataMap[ad.slug];
                            const videoCount = catData?.count ?? 0;
                            const totalDuration = catData?.totalDuration ?? "0m";
                            const thumbs = catData?.thumbnails ?? [];

                            return (
                                <div key={ad.id} className="relative group">
                                    <Link
                                        href={`/ad-inventory/${ad.slug}`}
                                        className="block relative rounded-2xl border border-border-light overflow-hidden hover-lift cursor-pointer transition-all duration-200"
                                    >
                                        {/* Top: Banner Image */}
                                        <div className="h-36 bg-gray-50 relative overflow-hidden">
                                            <img src={getBannerForSlug(ad.slug)} alt={`${ad.category} banner`} className="w-full h-full object-cover" />
                                            {/* Overlay gradient at bottom for text readability */}
                                            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                                        </div>

                                        {/* Content */}
                                        <div className="p-5 pt-3">
                                            <h3 className="text-base font-semibold text-text-primary mb-3">{ad.category}</h3>

                                            <div className="mb-2.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-1.5">Target contexts</p>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {ad.targetContexts.map((ctx) => (
                                                        <span key={ctx} className="px-2.5 py-1 rounded-full bg-mb-green-light/40 text-[11px] font-medium text-mb-green-dark">{ctx}</span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-1.5">Exclusions</p>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {ad.exclusions.map((exc) => (
                                                        <span key={exc} className="px-2.5 py-1 rounded-full bg-mb-pink-light/40 text-[11px] font-medium text-mb-pink-dark">{exc}</span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 text-text-tertiary mt-3 pt-3 border-t border-border-light">
                                                <span className="flex items-center gap-1 text-[11px]">
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path fillRule="evenodd" clipRule="evenodd" d="M5.55217 4.79V7.21L7.265 6L5.55217 4.79ZM4.5 4.315C4.5 3.657 5.235 3.271 5.77 3.649L8.156 5.334C8.615 5.657 8.615 6.343 8.156 6.667L5.77 8.352C5.235 8.729 4.5 8.343 4.5 7.685V4.315Z" fill="currentColor" /></svg>
                                                    {dataLoading ? "…" : videoCount}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px]">
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" /><path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                    {dataLoading ? "…" : totalDuration}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* View Videos link */}
                                    <div className="absolute top-[160px] right-4 z-10">
                                        <a
                                            href={`/ad-inventory/${ad.slug}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary bg-gray-50/80 hover:bg-gray-100 transition-all duration-200"
                                            title="View Videos"
                                        >
                                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                                                <path d="M4.5 4.315C4.5 3.657 5.235 3.271 5.77 3.649L8.156 5.334C8.615 5.657 8.615 6.343 8.156 6.667L5.77 8.352C5.235 8.729 4.5 8.343 4.5 7.685V4.315Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-border-light">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                            <span className="text-text-tertiary">{searchIcon}</span>
                        </div>
                        <p className="text-sm font-medium text-text-primary mb-1">No matching ads</p>
                        <p className="text-sm text-text-tertiary">Try adjusting your search query.</p>
                    </div>
                )}
            </div>

            <AddCategoryModal
                open={showAddModal}
                onClose={() => { setShowAddModal(false); refreshCategories(); refreshVideos(); }}
            />
        </div>
    );
}
