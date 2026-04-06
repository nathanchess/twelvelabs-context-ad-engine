"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Hls from "hls.js";
import { hlsClientConfig } from "../../../lib/hlsClientConfig";
import { getCategoryBySlug, type AdCategory } from "../../../lib/adInventoryStore";
import { useVideos, type CachedVideo } from "../../../lib/videoCache";
import { X, Clock, FileText, Database, Download, Cpu, Users, UserX } from "lucide-react";

/* ── Types ──────────────────────────────────────────────── */
type TLVideo = CachedVideo;

interface TimelineMarker {
    timestampSec: number;
    label: string;
    reasoning: string;
}

interface TargetAudienceData {
    highPriority: string[];
    mediumPriority: string[];
    lowPriority: string[];
}

interface AnalysisData {
    summary: string;
    company: string;
    proposedTitle: string;
    recommendedContexts: string[];
    negativeCampaignContexts: string[];
    brandSafetyGARM: string[];
    targetDemographics: string[];
    negativeDemographics: string[];
    targetAudience: TargetAudienceData | string;
    timelineMarkers: TimelineMarker[];
}

interface MockUser {
    id: string;
    name: string;
    demographics: string[];
    interest_signals: string[];
    ad_category_affinities: Record<string, number>;
    content_preferences: string[];
    exclusion_categories: string[];
    viewing_context: {
      device_type: "ctv" | "mobile" | "tablet" | "desktop";
      typical_daypart: "morning" | "daytime" | "primetime" | "late_night";
    };
    engagement_tier: "high" | "medium" | "low";
    dma_region: string;
  }
  
  const mockUsers: MockUser[] = [
    {
      id: "ethan",
      name: "Ethan",
      demographics: ["Male", "30s", "Urban", "HHI $100K+"],
      interest_signals: [
        "Luxury goods", "High-end", "Premium spirits", "Liquor",
        "Alcohol", "Travel", "Vacation", "Resorts", "Fine Dining"
      ],
      ad_category_affinities: {
        alcohol_premium: 0.95,
        travel_luxury: 0.90,
        fashion_luxury: 0.80,
        automotive_luxury: 0.75,
        financial_services: 0.70,
        technology: 0.60,
        alcohol_beer: 0.40,
        cpg_food: 0.30,
        fitness_wellness: 0.25,
      },
      content_preferences: ["Drama", "Thriller", "Documentary", "Late Night"],
      exclusion_categories: [],
      viewing_context: {
        device_type: "ctv",
        typical_daypart: "primetime",
      },
      engagement_tier: "high",
      dma_region: "New York",
    },
    {
      id: "sarah",
      name: "Sarah",
      demographics: ["Female", "40s", "Suburban", "HHI $150K+"],
      interest_signals: [
        "Automotive", "Cars", "Vehicles", "Home improvement", "DIY",
        "Renovation", "Fitness", "Sports Enthusiasts",
        "Health & Wellness", "Active Lifestyle"
      ],
      ad_category_affinities: {
        automotive_truck: 0.55,
        automotive_luxury: 0.80,
        home_improvement: 0.95,
        fitness_wellness: 0.90,
        insurance: 0.65,
        financial_services: 0.70,
        retail_general: 0.60,
        cpg_food: 0.50,
        pharmaceutical: 0.45,
        travel_adventure: 0.55,
      },
      content_preferences: ["Reality TV", "Home & Garden", "Competition", "Sports"],
      exclusion_categories: [],
      viewing_context: {
        device_type: "ctv",
        typical_daypart: "primetime",
      },
      engagement_tier: "high",
      dma_region: "Chicago",
    },
    {
      id: "nathan",
      name: "Nathan",
      demographics: ["Male", "19", "College Student", "Low-Income", "HHI $0K+"],
      interest_signals: [
        "Gaming", "Video Games", "Esports", "Fast Food", "QSR",
        "Music", "Concerts", "Entertainment", "Movies",
        "Pop Culture", "Gen-Z"
      ],
      ad_category_affinities: {
        cpg_snacks: 0.95,
        qsr_fast_food: 0.95,
        technology: 0.85,
        telecom: 0.70,
        retail_general: 0.65,
        entertainment: 0.80,
        fitness_wellness: 0.30,
        automotive_truck: 0.15,
        financial_services: 0.10,
      },
      content_preferences: ["Action", "Comedy", "Anime", "Sports", "Gaming"],
      exclusion_categories: [
        "alcohol_premium",
        "alcohol_beer",
        "sports_betting",
        "pharmaceutical",
      ],
      viewing_context: {
        device_type: "mobile",
        typical_daypart: "late_night",
      },
      engagement_tier: "medium",
      dma_region: "Los Angeles",
    },
    {
      id: "generic",
      name: "Generic",
      demographics: [],
      interest_signals: [],
      ad_category_affinities: {},
      content_preferences: [],
      exclusion_categories: [],
      viewing_context: {
        device_type: "ctv",
        typical_daypart: "primetime",
      },
      engagement_tier: "medium",
      dma_region: "National",
    },
  ];

interface AffinityResult {
    isEligible: boolean;
    score: number;
    reasoning: string[];
    scores?: {
        categoryAffinity: number;
        demographicFit: number;
        viewingContextFit: number;
        engagementMultiplier: number;
    };
    bestSegment: { start: number; end: number; score: number } | null;
}

/* ── Helpers ────────────────────────────────────────────── */
function fmt(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtSize(bytes: number): string {
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
}

function parseUserMeta(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try { const p = JSON.parse(raw); return typeof p === "object" && p !== null ? p : {}; }
    catch { return {}; }
}

function toSnakeCaseTag(input: string): string {
    return input
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function deriveCategoryCohortTags(categoryKey: string): string[] {
    const CATEGORY_TAGS: Record<string, string[]> = {
        alcohol_premium: [
            "premium_spirits",
            "luxury_goods",
            "fine_dining",
            "celebration",
            "upscale_social",
            "travel_luxury",
        ],
        automotive_truck: [
            "outdoor_adventure",
            "diy",
            "home_improvement",
            "utility_vehicle",
            "construction",
            "sports_enthusiasts",
        ],
        automotive_luxury: [
            "sports_car",
            "performance_auto",
            "luxury_goods",
            "premium_lifestyle",
            "car_enthusiast",
        ],
        cpg_snacks: [
            "snacking",
            "value_shopper",
            "family_friendly",
            "sports_viewing",
            "gaming",
        ],
        financial_services: [
            "planning",
            "investing",
            "retirement",
            "future_focused",
            "high_hhi",
        ],
    };

    return CATEGORY_TAGS[categoryKey] ?? [];
}

function deriveVideoCohortTags(summary: string, contexts: string[]): string[] {
    const corpus = `${summary || ""}\n${(contexts || []).join("\n")}`.toLowerCase();

    const KEYWORD_TO_TAGS: Array<{ re: RegExp; tags: string[] }> = [
        // Healthy snack / clean label
        { re: /\b(healthy|healthier|health\s*&\s*wellness|health and wellness|wellness|clean label|no artificial|no preservatives|preservatives|allergen|gluten[-\s]?free|dairy[-\s]?free|paleo|keto|whole30|high[-\s]?protein|protein|grass[-\s]?fed)\b/i, tags: ["health_wellness", "fitness_wellness", "clean_label", "high_protein"] },
        // Snacks / convenience
        { re: /\b(snack|snacking|on[-\s]?the[-\s]?go|convenien(t|ce)|grab and go)\b/i, tags: ["snacking", "convenience"] },
        // Sports cars / performance
        { re: /\b(sports car|performance|horsepower|track|racing|0[-\s]?60|turbo|premium interior)\b/i, tags: ["sports_car", "performance_auto", "car_enthusiast"] },
        // Trucks / outdoors
        { re: /\b(truck|pickup|towing|payload|off[-\s]?road|construction|jobsite|worksite|outdoor|adventure)\b/i, tags: ["utility_vehicle", "outdoor_adventure"] },
        // Spirits / luxury moments
        { re: /\b(whiskey|bourbon|scotch|vodka|cocktail|bar|toasting|celebration|luxury|premium)\b/i, tags: ["premium_spirits", "celebration", "upscale_social", "premium_lifestyle"] },
        // Finance planning
        { re: /\b(investing|investment|retirement|portfolio|savings|save\b|planning|financial)\b/i, tags: ["planning", "investing", "retirement"] },
        // Subscription/value
        { re: /\b(subscribe|subscription|subscribe and save|save\s+\d+%|discount|deal)\b/i, tags: ["value_shopper"] },
        // Youth tilt signals (from ad copy)
        { re: /\b(gen[-\s]?z|college|campus|gaming|esports)\b/i, tags: ["gen_z", "gaming"] },
    ];

    const derived: string[] = [];
    for (const rule of KEYWORD_TO_TAGS) {
        if (rule.re.test(corpus)) derived.push(...rule.tags);
    }
    return Array.from(new Set(derived));
}

/* ── Skeleton ───────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} />;
}

/* ── Main Page ──────────────────────────────────────────── */
export default function AdVideoDetailPage() {
    const params = useParams();
    const slug = params.slug as string;
    const videoId = params.videoId as string;

    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const [videoTime, setVideoTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Player controls
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);

    const [category, setCategory] = useState<AdCategory | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(true);
    const [activeMarker, setActiveMarker] = useState<number | null>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);

    const [selectedUserId, setSelectedUserId] = useState<string>("ethan");
    const [affinityResult, setAffinityResult] = useState<AffinityResult | null>(null);
    const [affinityLoading, setAffinityLoading] = useState(false);

    // Use cached videos (instant load from localStorage)
    const { videos: allVideos, loading } = useVideos();
    const video = useMemo(() => allVideos.find((v) => v.id === videoId) || null, [allVideos, videoId]);

    useEffect(() => {
        setCategory(getCategoryBySlug(slug) || null);
    }, [slug]);

    // Call analyze API once video is loaded
    const runAnalysis = useCallback(async () => {
        if (!video) return;

        setAnalysisLoading(true);
        try {
            const meta = parseUserMeta(video.userMetadata);
            const prompt = `Analyze this ad video. Return a JSON object with these exact keys:
- "summary": 2-3 sentence description of what the ad shows and its message
- "company": the brand or company featured in this ad
- "proposedTitle": a compelling, concise ad title
- "recommendedContexts": array of 3-5 literal visual and audio scene tags that you can actually see or hear (e.g., "Beach", "Sunny Sky", "Cocktails", "Friends Laughing"). Do not use abstract concepts.
- "negativeCampaignContexts": array of 2-3 negative campaign contexts or settings to avoid for this specific ad (e.g. "Indoor Settings", "Negative Reviews", "Gloomy Weather").
- "brandSafetyGARM": array of 1-3 strictly defined GARM (Global Alliance for Responsible Media) brand safety exclusions present or bordering in this video. Only use terms like: "Violence", "Underage", "Hate Speech", "Tragedy", "Crime", "Drugs", "Adult Content". If absolutely clean, return [].
- "targetDemographics": array of 2-4 strings describing the target age, gender, and household income (e.g., "Male", "30s", "HHI $100K+").
- "negativeDemographics": array of 1-3 strings describing demographics who should NOT see this ad (e.g., "Teenagers", "Underage").
- "targetAudience": Object with 3 string arrays: "highPriority" (2-3 items), "mediumPriority" (1-2 items), and "lowPriority" (1-2 items). These are target audience affinities (e.g., Luxury, Spirits, Gen-Z).
- "timelineMarkers": array of 3-6 objects with { "timestampSec": number, "label": short label, "reasoning": why this moment is relevant for ad targeting }

Return ONLY valid JSON, no markdown fences.`;

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id, prompt }),
            });
            if (!res.ok) throw new Error("Analysis failed");
            const result = await res.json();
            const raw = typeof result === "string" ? result : (result.data || result.text || JSON.stringify(result));
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                setAnalysis(parsed);
            } else {
                throw new Error("Could not parse");
            }
        } catch (err) {
            console.error("Analysis error:", err);
            setAnalysis({
                summary: "Analysis could not be completed. Try refreshing.",
                company: "Unknown", proposedTitle: "Ad Video",
                recommendedContexts: [], negativeCampaignContexts: [], brandSafetyGARM: [],
                targetDemographics: [], negativeDemographics: [],
                targetAudience: { highPriority: [], mediumPriority: [], lowPriority: [] },
                timelineMarkers: [],
            });
        }
        setAnalysisLoading(false);
    }, [video]);

    useEffect(() => { if (video) runAnalysis(); }, [video, runAnalysis]);

    // Affinity Matching
    useEffect(() => {
        const fetchAffinity = async () => {
            if (!analysis || !video) return;
            setAffinityLoading(true);
            try {
                const userCohort = mockUsers.find(u => u.id === selectedUserId);

                const slugToCategoryKey: Record<string, string> = {
                    "premium-spirits": "alcohol_premium",
                    "automotive-truck": "automotive_truck",
                    "cpg-snacks": "cpg_snacks",
                    "financial-services": "financial_services",
                };
                const category_key = slugToCategoryKey[slug] ?? toSnakeCaseTag(slug);

                const targetAudience = analysis.targetAudience;
                const targetAudienceTags = Array.from(new Set(
                    typeof targetAudience === "string"
                        ? targetAudience.split(",").map(s => toSnakeCaseTag(s.trim())).filter(Boolean)
                        : [
                            ...(targetAudience?.highPriority ?? []).map(toSnakeCaseTag),
                            ...(targetAudience?.mediumPriority ?? []).map(toSnakeCaseTag),
                            ...(targetAudience?.lowPriority ?? []).map(toSnakeCaseTag),
                        ]
                ));

                const categoryTags = deriveCategoryCohortTags(category_key);
                const videoDerivedTags = deriveVideoCohortTags(
                    analysis.summary || "",
                    analysis.recommendedContexts || []
                );

                const cohort_affinities = Array.from(new Set([
                    ...categoryTags,
                    ...videoDerivedTags,
                    ...targetAudienceTags,
                ]));

                const ad = {
                    id: video.id,
                    brand: analysis.company || "Unknown",
                    category_key,
                    asset_url: video?.hls?.videoUrl || "",
                    targetContexts: analysis.recommendedContexts || [],
                    targetDemographics: analysis.targetDemographics || [],
                    negativeDemographics: analysis.negativeDemographics || [],
                    targetAudience: analysis.targetAudience,
                    cohort_affinities,
                    brandSafetyGARM: analysis.brandSafetyGARM || [],
                    priority: 0,
                };

                const res = await fetch("/api/affinityMatching", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userCohort,
                        ad,
                    })
                });
                const data = await res.json();
                setAffinityResult(data);
            } catch (err) {
                console.error("Affinity fetch failed", err);
            } finally {
                setAffinityLoading(false);
            }
        };
        fetchAffinity();
    }, [analysis, selectedUserId, video, slug]);

    // HLS setup
    useEffect(() => {
        const el = videoRef.current;
        const hlsUrl = video?.hls?.videoUrl;
        if (!el || !hlsUrl) return;
        if (Hls.isSupported() && hlsUrl.includes(".m3u8")) {
            const hls = new Hls(hlsClientConfig());
            hls.loadSource(hlsUrl);
            hls.attachMedia(el);
            hlsRef.current = hls;
            return () => { hls.destroy(); };
        } else { el.src = hlsUrl; }
    }, [video]);

    // Track time and volume sync
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        const onTime = () => setVideoTime(el.currentTime);
        const onDur = () => setVideoDuration(el.duration);
        const onPlay = () => {
            setIsPlaying(true);
            el.volume = isMuted ? 0 : volume;
        };
        const onPause = () => setIsPlaying(false);
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("loadedmetadata", onDur);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("loadedmetadata", onDur);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
        };
    }, [video]);

    function togglePlay() {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') console.error("Video play error:", error);
                });
            }
        }
    }

    function seekTo(sec: number) {
        if (!videoRef.current) return;
        videoRef.current.currentTime = sec;
        if (!isPlaying) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') console.error("Video play error:", error);
                });
            }
        }
    }

    function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (val > 0) setIsMuted(false);
        if (videoRef.current) {
            videoRef.current.volume = val;
            videoRef.current.muted = false;
        }
    }

    function toggleMute() {
        if (!videoRef.current) return;
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        videoRef.current.muted = newMuted;
        if (newMuted) {
            videoRef.current.volume = 0;
            setVolume(0);
        } else {
            videoRef.current.volume = 1;
            setVolume(1);
        }
    }

    function changePlaybackRate(rate: number) {
        setPlaybackRate(rate);
        setShowSpeedMenu(false);
        if (videoRef.current) videoRef.current.playbackRate = rate;
    }

    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            playerContainerRef.current?.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    }

    function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
        if (!timelineRef.current || !videoDuration) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekTo(pct * videoDuration);
    }

    function handleTimelineHover(e: React.MouseEvent<HTMLDivElement>) {
        if (!timelineRef.current || !videoDuration) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHoverTime(pct * videoDuration);
    }

    const meta = parseUserMeta(video?.userMetadata);
    const duration = video?.systemMetadata?.duration || 0;
    const filename = video?.systemMetadata?.filename || "Video";
    const thumbnailUrl = video?.hls?.thumbnailUrls?.[0];

    const freewheelPayload = analysis ? {
        ad_server: "Freewheel",
        endpoint: "https://ads.freewheel.tv/ad/p/1",
        generated_kvps: {
            vw_brand: (analysis.company || "unknown").toLowerCase().replace(/\s+/g, "_"),
            vw_ctx_inc: [
                ...(meta.targetContexts ? meta.targetContexts.split(", ") : []),
                ...analysis.recommendedContexts,
            ].map(c => c.toLowerCase().replace(/\s+/g, "_")).join(","),
            vw_ctx_exc: [
                ...(meta.exclusions ? meta.exclusions.split(", ") : []),
                ...analysis.negativeCampaignContexts,
                ...analysis.brandSafetyGARM,
            ].map(e => e.toLowerCase().replace(/\s+/g, "_")).join(","),
            vw_garm_floor: "strict",
            vw_duration: String(Math.round(duration)),
            vw_ad_title: analysis.proposedTitle || "untitled",
        },
    } : null;

    if (loading) return <div className="min-h-screen bg-white" />;

    if (!video) {
        return (
            <div className="min-h-screen bg-white">
                <header className="border-b border-border-light px-8 py-6">
                    <Link href={`/ad-inventory/${slug}`} className="text-sm text-text-tertiary hover:text-text-primary transition-colors mb-2 inline-flex items-center gap-1">
                        <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Back
                    </Link>
                    <h1 className="text-[32px] font-bold tracking-[-1.5px] text-text-primary mt-2">Video Not Found</h1>
                </header>
            </div>
        );
    }

    const progressPct = videoDuration ? (videoTime / videoDuration) * 100 : 0;

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b border-border-light px-8 py-6">
                <div className="flex items-center gap-1.5 text-sm text-text-tertiary mb-3">
                    <Link href="/ad-inventory" className="hover:text-text-primary transition-colors">Ad Inventory</Link>
                    <svg viewBox="0 0 6 10" className="w-2 h-2.5"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    <Link href={`/ad-inventory/${slug}`} className="hover:text-text-primary transition-colors">{category?.category || slug}</Link>
                    <svg viewBox="0 0 6 10" className="w-2 h-2.5"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                    <span className="text-text-primary font-medium">
                        {analysisLoading ? "Analyzing…" : (analysis?.proposedTitle || filename.replace(/\.[^.]+$/, ""))}
                    </span>
                </div>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-[28px] font-bold tracking-[-1px] text-text-primary">
                            {analysisLoading ? <Skeleton className="h-8 w-64" /> : (analysis?.proposedTitle || "Ad Video")}
                        </h1>
                        {analysis?.company && (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="px-3 py-1 rounded-full bg-gray-50 text-xs font-semibold text-text-secondary border border-border-light">{analysis.company}</span>
                                <span className="text-xs text-text-tertiary">•</span>
                                <span className="text-xs text-text-tertiary">{fmt(duration)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="px-8 py-6 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3">
                        <div ref={playerContainerRef} className="rounded-2xl overflow-hidden bg-white border border-border-light shadow-sm">
                            <div className="relative aspect-video cursor-pointer" onClick={togglePlay}>
                                <video
                                  ref={videoRef}
                                  playsInline
                                  controlsList="nodownload noplaybackrate noremoteplayback"
                                  disablePictureInPicture
                                  disableRemotePlayback
                                  className="w-full h-full object-cover"
                                  poster={thumbnailUrl}
                                />
                                {!isPlaying && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                                            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-gray-900 ml-1">
                                                <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28a1 1 0 00-1.5.86z" fill="currentColor" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Integrated Seekable Timeline */}
                            <div className="px-3 pb-3 pt-1.5 bg-white border-t border-border-light">
                                <div ref={timelineRef} className="relative h-6 cursor-pointer group/timeline" onClick={handleTimelineClick} onMouseMove={handleTimelineHover} onMouseLeave={() => setHoverTime(null)}>
                                    <div className="absolute top-2.5 left-0 right-0 h-1.5 rounded-full bg-gray-100 group-hover/timeline:h-2.5 group-hover/timeline:top-2 transition-all duration-150 ring-1 ring-inset ring-black/5">
                                        <div className="h-full bg-gray-800 rounded-full transition-[width] duration-75" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    {hoverTime !== null && (
                                        <div className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded shadow-sm border border-border-light bg-white text-[10px] font-medium text-text-primary tabular-nums pointer-events-none" style={{ left: `${(hoverTime / (videoDuration || 1)) * 100}%` }}>
                                            {fmt(hoverTime)}
                                        </div>
                                    )}
                                    {!analysisLoading && analysis?.timelineMarkers.map((marker, i) => {
                                        const pct = duration > 0 ? (marker.timestampSec / duration) * 100 : 0;
                                        return (
                                            <button key={i} onClick={(e) => { e.stopPropagation(); seekTo(marker.timestampSec); setActiveMarker(activeMarker === i ? null : i); }} className="absolute top-0 -translate-x-1/2 z-10" style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }}>
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm border border-amber-200/50 ${activeMarker === i ? "bg-amber-400 scale-125 shadow-[0_0_8px_rgba(251,191,36,0.3)]" : "bg-amber-100 hover:bg-amber-300 hover:scale-110"}`}>
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M6 2.5v4M6 8.5v.5" stroke={activeMarker === i ? "white" : "#b45309"} strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between mt-0.5 px-0.5">
                                    <span className="text-[11px] text-text-tertiary tabular-nums cursor-default">{fmt(videoTime)} / {fmt(duration)}</span>
                                    <div className="flex items-center gap-4 text-text-tertiary">
                                        <div className="flex items-center gap-2">
                                            <button onClick={toggleMute} className="w-5 h-5 flex items-center justify-center hover:text-text-primary transition-colors cursor-pointer">
                                                {isMuted || volume === 0 ? (
                                                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                ) : (
                                                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                )}
                                            </button>
                                            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange} className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-mb-green-dark" />
                                        </div>
                                        <div className="relative">
                                            <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="text-[11px] font-semibold px-2 py-0.5 rounded hover:bg-gray-100 transition-colors cursor-pointer">
                                                {playbackRate}x
                                            </button>
                                            {showSpeedMenu && (
                                                <div className="absolute bottom-full right-0 mb-2 w-20 bg-white rounded-lg shadow-lg border border-border-light py-1 z-50 overflow-hidden">
                                                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                                        <button key={rate} onClick={() => changePlaybackRate(rate)} className={`w-full text-left px-3 py-1 text-[11px] hover:bg-gray-50 transition-colors cursor-pointer ${playbackRate === rate ? "text-mb-green-dark font-medium bg-green-50/50" : "text-text-secondary"}`}>
                                                            {rate}x
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={toggleFullScreen} className="w-5 h-5 flex items-center justify-center hover:text-text-primary transition-colors cursor-pointer">
                                            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {activeMarker !== null && analysis?.timelineMarkers[activeMarker] && (
                            <div className="mt-3 p-4 rounded-xl bg-amber-50/60 border border-amber-200/60 animate-fade-in relative">
                                <button onClick={() => setActiveMarker(null)} className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-amber-600/60 hover:text-amber-800 hover:bg-amber-100 transition-colors">
                                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                </button>
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                                        <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M6 2.5v4M6 8.5v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-text-primary">
                                            {analysis.timelineMarkers[activeMarker].label}
                                            <span className="font-normal text-text-tertiary ml-2 text-xs">{fmt(analysis.timelineMarkers[activeMarker].timestampSec)}</span>
                                        </p>
                                        <p className="text-sm text-text-secondary mt-1 leading-relaxed">{analysis.timelineMarkers[activeMarker].reasoning}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-2 space-y-5">
                        <div>
                            <h2 className="text-xs font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Summary</h2>
                            {analysisLoading ? (
                                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-5/6" /></div>
                            ) : (
                                <p className="text-sm text-text-secondary leading-relaxed">{analysis?.summary}</p>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xs font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">File Details</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: "Duration", value: fmt(duration) },
                                    { label: "Resolution", value: video.systemMetadata?.width && video.systemMetadata?.height ? `${video.systemMetadata.width}×${video.systemMetadata.height}` : "—" },
                                    { label: "Frame Rate", value: video.systemMetadata?.fps ? `${Math.round(video.systemMetadata.fps)} fps` : "—" },
                                    { label: "File Size", value: video.systemMetadata?.size ? fmtSize(video.systemMetadata.size) : "—" },
                                ].map(({ label, value }) => (
                                    <div key={label} className="px-3 py-2.5 rounded-lg bg-gray-50">
                                        <p className="text-[10px] text-text-tertiary mb-0.5">{label}</p>
                                        <p className="text-sm font-medium text-text-primary">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- SIMULATE VIEWER AFFINITY (FULL-WIDTH) --- */}
                <div className="mt-8 pt-6 border-t border-border-light">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-semibold uppercase tracking-[1.5px] text-mb-pink-dark">Simulate Viewer Affinity</h2>
                        <span className="text-[10px] bg-mb-pink-light/20 text-mb-pink-dark px-2 py-0.5 rounded border border-mb-pink-light/60 font-medium">DEMO</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        {mockUsers.map(user => (
                            <button
                                key={user.id}
                                onClick={() => setSelectedUserId(user.id)}
                                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${selectedUserId === user.id ? 'bg-mb-pink-dark text-white border-mb-pink-dark shadow-sm' : 'bg-white text-text-secondary border-border-light hover:bg-gray-50'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${selectedUserId === user.id ? 'bg-white/20' : 'bg-gray-100'}`}>
                                        {user.name.charAt(0)}
                                    </div>
                                    {user.name}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-4 text-[11px] border border-border-light">
                            {(() => {
                                const user = mockUsers.find(u => u.id === selectedUserId);
                                if (!user) return null;

                                const topAffinities = Object.entries(user.ad_category_affinities || {})
                                    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                                    .slice(0, 6);

                                const slugToCategoryKey: Record<string, string> = {
                                    "premium-spirits": "alcohol_premium",
                                    "automotive-truck": "automotive_truck",
                                    "cpg-snacks": "cpg_snacks",
                                    "financial-services": "financial_services",
                                };
                                const category_key = slugToCategoryKey[slug] ?? toSnakeCaseTag(slug);
                                const isBlocked = user.exclusion_categories?.includes(category_key);

                                return (
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Viewing</div>
                                                <div className="text-[11px] text-text-primary font-medium mt-0.5">
                                                    {user.viewing_context.typical_daypart} · {user.viewing_context.device_type.toUpperCase()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Engagement</div>
                                                <div className="text-[11px] text-text-primary font-medium mt-0.5">{user.engagement_tier}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Demographics</div>
                                                <div className="text-[11px] text-text-primary mt-0.5">{user.demographics.length ? user.demographics.join(", ") : "—"}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">DMA</div>
                                                <div className="text-[11px] text-text-primary mt-0.5">{user.dma_region}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Exclusions</div>
                                                <div className={`text-[11px] mt-0.5 ${isBlocked ? "font-semibold text-red-700" : "text-text-primary"}`}>
                                                    {user.exclusion_categories.length ? user.exclusion_categories.join(", ") : "—"}
                                                    {isBlocked ? " (blocks this ad)" : ""}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider mb-1.5">Interest signals</div>
                                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto pr-1">
                                                {user.interest_signals.length ? user.interest_signals.map((t) => (
                                                    <span key={t} className="px-2 py-1 rounded-full bg-white text-[11px] font-medium text-text-secondary border border-border-light">
                                                        {t}
                                                    </span>
                                                )) : (
                                                    <span className="text-[11px] text-text-tertiary">—</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider mb-1.5">Top affinities</div>
                                                {topAffinities.length ? (
                                                    <div className="space-y-2">
                                                        {topAffinities.map(([k, v]) => (
                                                            <div key={k} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                                                                <div>
                                                                    <span className="text-[11px] font-medium text-text-primary">{k}</span>
                                                                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden ring-1 ring-inset ring-black/5">
                                                                        <div className="h-full bg-gray-800 rounded-full" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
                                                                    </div>
                                                                </div>
                                                                <div className="text-[11px] font-semibold text-text-primary tabular-nums">{Math.round(v * 100)}%</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px] text-text-tertiary">—</div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider mb-1.5">Content preferences</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {user.content_preferences.length ? user.content_preferences.map((p) => (
                                                        <span key={p} className="px-2 py-1 rounded-full bg-white text-[11px] font-medium text-text-secondary border border-border-light">
                                                            {p}
                                                        </span>
                                                    )) : (
                                                        <span className="text-[11px] text-text-tertiary">—</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className={`rounded-xl border p-4 transition-all ${affinityLoading ? 'bg-gray-50/50 border-border-light' : affinityResult?.isEligible ? 'bg-mb-green-light/10 border-mb-green-light/40' : 'bg-red-50/50 border-red-100'}`}>
                            {affinityLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-6 w-32" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-5/6" />
                                </div>
                            ) : affinityResult ? (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-black/5 pb-3">
                                        <div className="flex items-center gap-2">
                                            {affinityResult.isEligible ? (
                                                <div className="w-6 h-6 rounded-full bg-mb-green-dark text-white flex items-center justify-center">
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                </div>
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center">
                                                    <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                </div>
                                            )}
                                            <span className={`font-bold ${affinityResult.isEligible ? 'text-mb-green-dark' : 'text-red-700'}`}>
                                                {affinityResult.isEligible ? 'Match Eligible' : 'Delivery Blocked'}
                                            </span>
                                        </div>
                                        <div className="text-left sm:text-right">
                                            <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Match Score</div>
                                            <div className={`text-xl font-black ${affinityResult.isEligible ? 'text-mb-green-dark' : 'text-red-700'}`}>
                                                {affinityResult.score}
                                            </div>
                                        </div>
                                    </div>

                                    {affinityResult.scores && (
                                        <div className="mt-3 bg-white/60 p-3 rounded-lg border border-black/5">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">Metric breakdown</div>
                                                <div className="text-[10px] text-text-tertiary">
                                                    <span className="font-medium">Weights</span>: Affinity 40 · Demo 30 · Context 15 · Base 15
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {[
                                                    {
                                                        key: "Category affinity",
                                                        value: affinityResult.scores.categoryAffinity,
                                                        hint: "Direct category affinity plus interest overlap, with a small demo-tuned heuristic boost.",
                                                    },
                                                    {
                                                        key: "Demographic fit",
                                                        value: affinityResult.scores.demographicFit,
                                                        hint: "Match ratio against the ad’s preferred demographics (HHI thresholds, age, gender).",
                                                    },
                                                    {
                                                        key: "Viewing context",
                                                        value: affinityResult.scores.viewingContextFit,
                                                        hint: "Daypart + device score; premium categories get full-range impact.",
                                                    },
                                                    {
                                                        key: "Engagement multiplier",
                                                        value: affinityResult.scores.engagementMultiplier,
                                                        hint: "High/medium/low engagement scales the final score (0.85–1.15).",
                                                        isMultiplier: true,
                                                    },
                                                ].map((m) => (
                                                    <div key={m.key} className="rounded-lg bg-white/70 border border-black/5 p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-medium text-text-primary">{m.key}</span>
                                                                <span className="text-[10px] text-text-tertiary" title={m.hint}>(i)</span>
                                                            </div>
                                                            <div className="text-[11px] font-semibold text-text-primary tabular-nums">
                                                                {(m as any).isMultiplier ? `×${m.value.toFixed(2)}` : m.value.toFixed(2)}
                                                            </div>
                                                        </div>
                                                        {!(m as any).isMultiplier && (
                                                            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden ring-1 ring-inset ring-black/5">
                                                                <div className="h-full bg-gray-800 rounded-full" style={{ width: `${Math.max(0, Math.min(1, m.value)) * 100}%` }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-3 text-[11px] text-text-tertiary">
                                                Base points are added for non-targeted categories; final score is capped at 100.
                                            </div>
                                        </div>
                                    )}

                                    <details className="mt-3">
                                        <summary className="cursor-pointer select-none text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors">
                                            Scoring notes ({affinityResult.reasoning?.length || 0})
                                        </summary>
                                        <div className="mt-2 space-y-2">
                                            {affinityResult.reasoning?.map((reason, idx) => (
                                                <div key={idx} className="flex gap-2 text-[11px] leading-relaxed">
                                                    <span className="text-text-tertiary mt-0.5">•</span>
                                                    <span className={reason.startsWith('Failed') || reason.startsWith('Warning') ? 'text-red-700 font-medium' : 'text-text-secondary'}>{reason}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </>
                            ) : (
                                <p className="text-[11px] text-text-tertiary text-center">Select a profile to calculate match score.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Targeting / Suitability Rules */}
                <div>
                    <h2 className="text-sm font-semibold text-text-primary mb-1">Targeting &amp; Suitability Rules</h2>
                    <p className="text-xs text-text-tertiary mb-4">Current rules from your category configuration, plus AI-recommended additions based on video analysis.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="rounded-xl border border-border-light p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-mb-green-dark mb-3 flex items-center gap-1.5">
                                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 6l1.5 1.5L8 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                Target Contexts
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {(meta.targetContexts || "").split(", ").filter(Boolean).map((ctx) => (
                                    <span key={ctx} className="px-2.5 py-1 rounded-full bg-mb-green-light/40 text-[11px] font-medium text-mb-green-dark">{ctx}</span>
                                ))}
                                {analysisLoading ? <><Skeleton className="h-6 w-20" /><Skeleton className="h-6 w-24" /></> : analysis?.recommendedContexts.map((ctx) => (
                                    <span key={ctx} className="px-2.5 py-1 rounded-full bg-mb-green-light/20 text-[11px] font-medium text-mb-green-dark border border-mb-green-light/60 flex items-center gap-1">
                                        <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60"><path d="M6 1l1.5 3.2L11 4.8 8.5 7.2l.6 3.5L6 9l-3.1 1.7.6-3.5L1 4.8l3.5-.6z" /></svg>
                                        {ctx}
                                    </span>
                                ))}
                            </div>

                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-purple-700 mt-5 mb-3 flex items-center gap-1.5">
                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5"><circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" /><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                Target Audience Affinities
                            </p>
                            <div className="space-y-3">
                                {analysisLoading ? <Skeleton className="h-16 w-full" /> : analysis?.targetAudience && (
                                    typeof analysis.targetAudience === 'object' && 'highPriority' in analysis.targetAudience ? (
                                        <>
                                            {(analysis.targetAudience as TargetAudienceData).highPriority?.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[10px] font-semibold text-purple-900 bg-purple-100 px-2 py-0.5 rounded mr-1 min-w-[55px] text-center">HIGH</span>
                                                    {(analysis.targetAudience as TargetAudienceData).highPriority.map((aud: string) => (
                                                        <span key={aud} className="px-2.5 py-1 rounded-full bg-purple-50 text-[11px] font-medium text-purple-700 border border-purple-200">{aud}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {(analysis.targetAudience as TargetAudienceData).mediumPriority?.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[10px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded mr-1 min-w-[55px] text-center">MED</span>
                                                    {(analysis.targetAudience as TargetAudienceData).mediumPriority.map((aud: string) => (
                                                        <span key={aud} className="px-2.5 py-1 rounded-full bg-white text-[11px] font-medium text-purple-600 border border-purple-100">{aud}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {(analysis.targetAudience as TargetAudienceData).lowPriority?.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded mr-1 min-w-[55px] text-center">LOW</span>
                                                    {(analysis.targetAudience as TargetAudienceData).lowPriority.map((aud: string) => (
                                                        <span key={aud} className="px-2.5 py-1 rounded-full bg-white text-[11px] font-medium text-gray-500 border border-gray-200">{aud}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {String(analysis.targetAudience).split(",").map(aud => aud.trim()).filter(Boolean).map(aud => (
                                                <span key={aud} className="px-2.5 py-1 rounded-full bg-purple-50 text-[11px] font-medium text-purple-700 border border-purple-200">{aud}</span>
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>

                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-blue-600 mt-5 mb-3 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />
                                Target Demographics
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {analysisLoading ? <Skeleton className="h-6 w-32" /> : analysis?.targetDemographics?.length ? (
                                    analysis.targetDemographics.map((demo) => (
                                        <span key={demo} className="px-2.5 py-1 rounded-full bg-blue-50 text-[11px] font-medium text-blue-700 border border-blue-200">
                                            {demo}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-text-tertiary italic">Broad demographic appeal.</span>
                                )}
                            </div>

                        </div>
                        <div className="rounded-xl border border-border-light p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-mb-pink-dark mb-3 flex items-center gap-1.5">
                                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                Brand Safety (GARM)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {analysisLoading ? <Skeleton className="h-6 w-16" /> : (analysis?.brandSafetyGARM && analysis.brandSafetyGARM.length > 0) ? (
                                    analysis.brandSafetyGARM.map((exc) => (
                                        <span key={exc} className="px-2.5 py-1 rounded-full bg-mb-pink-light/20 text-[11px] font-medium text-mb-pink-dark border border-mb-pink-light/60 flex items-center gap-1">
                                            <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60"><path d="M6 1l1.5 3.2L11 4.8 8.5 7.2l.6 3.5L6 9l-3.1 1.7.6-3.5L1 4.8l3.5-.6z" /></svg>
                                            {exc}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs text-mb-green-dark bg-mb-green-light/20 px-3 py-1.5 rounded-lg border border-mb-green-light/60 flex items-center gap-1.5">
                                        <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M3.5 6l1.5 1.5L8.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        <strong>Clean Indicator:</strong> No subjective GARM violations detected.
                                    </span>
                                )}
                            </div>

                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-red-600 mt-5 mb-3 flex items-center gap-1.5">
                                <UserX className="w-3.5 h-3.5" />
                                Negative Demographics
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {analysisLoading ? <Skeleton className="h-6 w-32" /> : analysis?.negativeDemographics?.length ? (
                                    analysis.negativeDemographics.map((demo) => (
                                        <span key={demo} className="px-2.5 py-1 rounded-full bg-red-50 text-[11px] font-medium text-red-700 border border-red-200 flex items-center gap-1">
                                            <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60"><path d="M6 1l1.5 3.2L11 4.8 8.5 7.2l.6 3.5L6 9l-3.1 1.7.6-3.5L1 4.8l3.5-.6z" /></svg>
                                            {demo}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-text-tertiary italic">No excluded demographic signals.</span>
                                )}
                            </div>

                            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-secondary mt-5 mb-3 flex items-center gap-1.5">
                                <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                Negative Campaign Contexts
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {(meta.exclusions || "").split(", ").filter(Boolean).map((exc) => (
                                    <span key={exc} className="px-2.5 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-text-secondary">{exc}</span>
                                ))}
                                {analysisLoading ? <Skeleton className="h-6 w-20" /> : analysis?.negativeCampaignContexts?.map((exc) => (
                                    <span key={exc} className="px-2.5 py-1 rounded-full bg-gray-50 text-[11px] font-medium text-text-secondary border border-border-light flex items-center gap-1">
                                        <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-40"><path d="M6 1l1.5 3.2L11 4.8 8.5 7.2l.6 3.5L6 9l-3.1 1.7.6-3.5L1 4.8l3.5-.6z" /></svg>
                                        {exc}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Freewheel Payload Inspector */}
                <div>
                    <h2 className="text-sm font-semibold text-text-primary mb-1">Freewheel / Ad Server Config</h2>
                    <p className="text-xs text-text-tertiary mb-4">Auto-generated programmatic payload. These KVPs are sent to the SSP so it knows exactly when to bid.</p>
                    {analysisLoading ? <Skeleton className="h-48 w-full" /> : (
                        <div className="rounded-2xl overflow-hidden border border-gray-800">
                            <div className="bg-[#1e1e2e] px-4 py-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                                    </div>
                                    <span className="text-[11px] text-gray-400 ml-2 font-mono">freewheel_payload.json</span>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(freewheelPayload, null, 2)); }} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1">
                                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" /><path d="M2 9V2.5A.5.5 0 012.5 2H9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                                    Copy
                                </button>
                            </div>
                            <pre className="bg-[#11111b] px-5 py-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
                                <code>{freewheelPayload ? syntaxHighlight(JSON.stringify(freewheelPayload, null, 2)) : "{}"}</code>
                            </pre>
                        </div>
                    )}
                </div>

                {/* Databricks Contextual Lift Panel — benchmarks cited from Agility Ads (2025) */}
                <div className="mt-8">
                    <h2 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                        <img src="/databricks.png" alt="Databricks" className="h-4 object-contain" />
                        Databricks Contextual Lift
                    </h2>
                    <p className="text-xs text-text-tertiary mb-3 tracking-wide leading-relaxed">
                        <span className="font-semibold text-text-secondary">Agility Ads (2025 Contextual Advertising Report): </span>
                        Their research found that AI-driven contextual ads deliver{" "}
                        <span className="font-medium text-text-primary">30% higher conversion rates and performance</span>{" "}
                        compared to non-contextual alternatives, and that contextual targeting can boost{" "}
                        <span className="font-medium text-text-primary">purchase intent by 63%</span>.
                        Multimodal scene-level matching with TwelveLabs is designed to sit in that same contextual class; when you wire this dashboard to production data, measured lift should be compared against these enterprise benchmarks.
                    </p>
                    <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                        In production, this panel can query your live Databricks Delta Tables where player impression logs are joined with TwelveLabs scene IDs so your data science team can track completion, conversion, and intent lift in real time.
                    </p>
                    <div className="rounded-xl border border-border-light overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs border-collapse bg-white">
                            <thead>
                                <tr className="bg-gray-50 border-b border-border-light text-text-secondary">
                                    <th className="px-5 py-3 font-semibold">Context (Agility Ads, 2025)</th>
                                    <th className="px-5 py-3 font-semibold text-right">Reported outcome</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light">
                                <tr>
                                    <td className="px-5 py-3 text-text-primary font-medium">AI-driven contextual vs non-contextual alternatives</td>
                                    <td className="px-5 py-3 text-right text-text-primary font-semibold">+30% conversion / performance</td>
                                </tr>
                                <tr className="bg-mb-green-light/10">
                                    <td className="px-5 py-3 text-mb-green-dark font-semibold">Contextual targeting — purchase intent</td>
                                    <td className="px-5 py-3 text-right">
                                        <span className="inline-flex items-center gap-1 font-bold text-mb-green-dark">
                                            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M6 10V2M2 6l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                            +63%
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-xs">
                        <a
                            href="https://agilityads.com/blog/contextual-advertising-in-2025-the-future-of-privacy-first-digital-marketing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-mb-green-dark hover:underline"
                        >
                            Read the Agility Ads Report
                        </a>
                        <span className="text-text-tertiary"> — overview of 2025 contextual advertising trends and measurement.</span>
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ── JSON Syntax Highlighting ────────────────────────────── */
function syntaxHighlight(json: string) {
    const lines = json.split("\n");
    return (
        <>
            {lines.map((line, lineIdx) => {
                const tokens: React.ReactNode[] = [];
                const regex = /("(?:[^"\\]|\\.)*")\s*:?|(\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)/g;
                let match;
                let lastIndex = 0;
                while ((match = regex.exec(line)) !== null) {
                    if (match.index > lastIndex) tokens.push(<span key={`${lineIdx}-pre-${lastIndex}`} className="text-gray-500">{line.slice(lastIndex, match.index)}</span>);
                    if (match[1]) {
                        if (match[0].endsWith(":")) {
                            tokens.push(<span key={`${lineIdx}-${match.index}`}><span className="text-[#89b4fa]">{match[1]}</span><span className="text-gray-500">: </span></span>);
                        } else {
                            tokens.push(<span key={`${lineIdx}-${match.index}`} className="text-[#a6e3a1]">{match[1]}</span>);
                        }
                    } else if (match[2]) {
                        tokens.push(<span key={`${lineIdx}-${match.index}`} className="text-[#fab387]">{match[2]}</span>);
                    } else if (match[3]) {
                        tokens.push(<span key={`${lineIdx}-${match.index}`} className="text-[#cba6f7]">{match[3]}</span>);
                    }
                    lastIndex = match.index + match[0].length;
                }
                if (lastIndex < line.length) tokens.push(<span key={`${lineIdx}-tail`} className="text-gray-500">{line.slice(lastIndex)}</span>);
                return <div key={lineIdx}>{tokens.length > 0 ? tokens : <span className="text-gray-500">{line}</span>}</div>;
            })}
        </>
    );
}
