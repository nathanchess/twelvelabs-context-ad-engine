"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ZoomIn, ZoomOut, Maximize, Clock, FileText, X, ScatterChart, Cpu, Database, Download } from 'lucide-react';
import { CachedVideo } from '../lib/videoCache';
import type { AdMetadataExportRow } from '../lib/databricksExportSql';
import { embeddingVectorToJson, getMarengoAdVectorForCreative } from '../lib/marengoAdEmbedding';
import DatabricksExportModal from './DatabricksExportModal';

const POINT_SIZE = 16;
const HOVER_SCALE = 2;

interface EmbeddingsViewProps {
    videos: CachedVideo[];
    categoryName: string;
}

export default function EmbeddingsView({ videos, categoryName }: EmbeddingsViewProps) {
    const [points, setPoints] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [selectedVideo, setSelectedVideo] = useState<CachedVideo | null>(null);
    const [hoveredVideo, setHoveredVideo] = useState<CachedVideo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isTableExpanded, setIsTableExpanded] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);

    // Analysis Cache State
    const [analysisMap, setAnalysisMap] = useState<Record<string, any>>({});
    const [analysesLoaded, setAnalysesLoaded] = useState(false);
    const [analyzingAll, setAnalyzingAll] = useState(false);
    const [analyzingProgress, setAnalyzingProgress] = useState(0);
    const analyzingRef = useRef(false);

    const containerRef = useRef<HTMLDivElement>(null);

    const adMetadataExportRows: AdMetadataExportRow[] = useMemo(() => {
        return videos.map((v) => {
            const ana = analysisMap[v.id];
            const ta = ana?.targetAudience;
            let audienceStr = "";
            if (typeof ta === "string") audienceStr = ta;
            else if (ta && typeof ta === "object") {
                audienceStr = JSON.stringify({
                    highPriority: ta.highPriority || [],
                    mediumPriority: ta.mediumPriority || [],
                    lowPriority: ta.lowPriority || [],
                });
            }
            const adVec = getMarengoAdVectorForCreative(v);
            const marengoJson = embeddingVectorToJson(adVec);
            return {
                creativeId: String(v.systemMetadata?.filename || v.id),
                campaignName: String(ana?.proposedTitle || ""),
                durationSeconds: Math.round(v.systemMetadata?.duration || 0),
                extractedVisualContexts: JSON.stringify(ana?.recommendedContexts || []),
                targetDemographics: JSON.stringify(ana?.targetDemographics || []),
                negativeDemographics: JSON.stringify(ana?.negativeDemographics || []),
                targetAudienceAffinity: audienceStr,
                negativeCampaignContexts: JSON.stringify(ana?.negativeCampaignContexts || []),
                brandSafetyGarm: JSON.stringify(ana?.brandSafetyGARM || []),
                marengoEmbeddingJson: marengoJson,
                embeddingDim: adVec ? adVec.length : 0,
                embeddingModel: adVec ? "twelvelabs_marengo" : "",
                vectorSyncStatus: adVec ? "embedded_marengo_clip_avg" : "pending_no_marengo_segments",
            };
        });
    }, [videos, analysisMap]);

    // Load globally cached analysis data from Vercel Blob
    useEffect(() => {
        const fetchAnalyses = async () => {
            try {
                const res = await fetch('/api/analyses', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setAnalysisMap(data);
                }
            } catch (err) {
                console.error("Failed to load global analyses:", err);
            } finally {
                setAnalysesLoaded(true);
            }
        };
        fetchAnalyses();
    }, []);

    // Automatically trigger analysis for missing videos
    useEffect(() => {
        if (!analysesLoaded || !videos.length || analyzingRef.current) return;

        const toAnalyze = videos.filter(v => !analysisMap[v.id]);
        if (toAnalyze.length === 0) return;

        analyzingRef.current = true;
        setAnalyzingAll(true);
        setAnalyzingProgress(0);

        const runAnalysis = async () => {
            let completed = 0;
            const chunkSize = 3;

            for (let i = 0; i < toAnalyze.length; i += chunkSize) {
                if (!analyzingRef.current) break; // Stop loop if component unmounted

                const chunk = toAnalyze.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (video) => {
                    try {
                        const meta = parseUserMeta(video.userMetadata);
                        const prompt = `Analyze this ad video. Return a JSON object with these exact keys:
- "summary": 2-3 sentence description of what the ad shows and its message
- "company": the brand or company featured in this ad
- "proposedTitle": a compelling, concise ad title
- "recommendedContexts": array of 3-5 literal visual and audio scene tags that you can actually see or hear (e.g., "Beach", "Sunny Sky", "Cocktails", "Friends Laughing"). Do not use abstract concepts.
- "negativeCampaignContexts": array of 2-3 negative campaign contexts or settings to avoid for this specific ad (e.g. "Indoor Settings", "Negative Reviews", "Gloomy Weather").
- "brandSafetyGARM": array of 1-3 strictly defined GARM (Global Alliance for Responsible Media) brand safety exclusions present or bordering in this video. Only use terms like: "Violence", "Underage", "Hate Speech", "Tragedy", "Crime", "Drugs", "Adult Content". If absolutely clean, return [].
- "targetDemographics": array of 1-3 target demographic requirements for this ad (e.g., "Adults", "Male", "HHI $100K+"). If none, return [].
- "negativeDemographics": array of 1-3 demographic exclusions ONLY IF the ad explicitly forbids an audience (e.g., alcohol ads excluding "Underage"). For general products (e.g., snacks, cars), return [].
- "targetAudience": Object with 3 string arrays: "highPriority" (2-3 items), "mediumPriority" (1-2 items), and "lowPriority" (1-2 items). These are target audience affinities (e.g., Luxury, Spirits, Gen-Z).
- "timelineMarkers": array of 3-6 objects with { "timestampSec": number, "label": short label, "reasoning": why this moment is relevant for ad targeting }

Return ONLY valid JSON, no markdown fences.`;

                        const res = await fetch("/api/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ videoId: video.id, prompt }),
                        });

                        if (res.ok) {
                            const result = await res.json();
                            let parsed = result;
                            if (typeof result === "string" || result.data || result.text) {
                                const raw = typeof result === "string" ? result : (result.data || result.text || JSON.stringify(result));
                                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                                if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
                            }
                            if (parsed && typeof parsed === 'object') {
                                setAnalysisMap(prev => ({ ...prev, [video.id]: parsed }));
                            }
                        }
                    } catch (err) {
                        console.error("Failed to analyze", video.id, err);
                    }
                    completed++;
                    if (analyzingRef.current) {
                        setAnalyzingProgress(Math.round((completed / toAnalyze.length) * 100));
                    }
                }));
            }

            if (analyzingRef.current) {
                setAnalyzingAll(false);
                analyzingRef.current = false;
            }
        };

        runAnalysis();

        return () => {
            analyzingRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysesLoaded, videos]);

    function fmtSize(bytes: number): string {
        if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
        return `${(bytes / 1e3).toFixed(0)} KB`;
    }

    // Compute PCA and project points
    useEffect(() => {
        if (!videos || videos.length === 0) {
            setLoading(false);
            return;
        }

        const processEmbeddings = async () => {
            try {
                // 1. Extract and Validate Embeddings
                const vectors: number[][] = [];
                const validVideos: CachedVideo[] = [];
                let dim = 0;

                videos.forEach((v: any) => {
                    let vec: number[] | null = null;

                    // Fallback for old cache format (1D array)
                    if (v.embedding && Array.isArray(v.embedding) && v.embedding.length > 0 && typeof v.embedding[0] === 'number') {
                        vec = v.embedding;
                    }
                    // New format: Array of objects { startOffsetSec, endOffsetSec, vector }
                    else if (v.embedding_segments && Array.isArray(v.embedding_segments) && v.embedding_segments.length > 0) {
                        const segs = v.embedding_segments;
                        let validCount = 0;
                        let sum: number[] = [];

                        for (const seg of segs) {
                            if (seg.vector && Array.isArray(seg.vector)) {
                                if (validCount === 0) {
                                    sum = new Array(seg.vector.length).fill(0);
                                }
                                if (seg.vector.length === sum.length) {
                                    for (let i = 0; i < sum.length; i++) {
                                        sum[i] += seg.vector[i];
                                    }
                                    validCount++;
                                }
                            }
                        }

                        if (validCount > 0) {
                            vec = sum.map(val => val / validCount);
                        }
                    }

                    if (vec) {
                        if (dim === 0) dim = vec.length;
                        if (vec.length === dim) {
                            vectors.push(vec);
                            validVideos.push(v);
                        }
                    }
                });

                if (vectors.length === 0) {
                    setLoading(false);
                    return;
                }

                let xs: number[] = [];
                let ys: number[] = [];

                // 2. Dimensionality Reduction
                if (vectors.length === 1) {
                    xs = [0.5];
                    ys = [0.5];
                } else {
                    console.log(`[Embeddings] Starting PCA: ${vectors.length} vectors × ${dim} dims`);
                    const t0 = performance.now();

                    try {
                        const mean = new Array(dim).fill(0);
                        vectors.forEach(v => v.forEach((val, i) => mean[i] += val));
                        mean.forEach((_, i) => mean[i] /= vectors.length);
                        const centered = vectors.map(v => v.map((val, i) => val - mean[i]));

                        const N = centered.length;
                        const K = Array.from({ length: N }, () => new Array(N).fill(0));
                        for (let i = 0; i < N; i++) {
                            for (let j = i; j < N; j++) {
                                let dot = 0;
                                for (let d = 0; d < dim; d++) dot += centered[i][d] * centered[j][d];
                                K[i][j] = dot;
                                K[j][i] = dot;
                            }
                        }

                        const powerIteration = (mat: number[][], size: number, deflateVec: number[] | null) => {
                            let v = Array.from({ length: size }, () => Math.random() - 0.5);
                            let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
                            v = v.map(x => x / norm);

                            for (let iter = 0; iter < 100; iter++) {
                                let w = new Array(size).fill(0);
                                for (let i = 0; i < size; i++) {
                                    for (let j = 0; j < size; j++) w[i] += mat[i][j] * v[j];
                                }
                                if (deflateVec) {
                                    const proj = w.reduce((s, x, i) => s + x * deflateVec[i], 0);
                                    w = w.map((x, i) => x - proj * deflateVec[i]);
                                }
                                norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
                                if (norm < 1e-10) break;
                                v = w.map(x => x / norm);
                            }
                            return v;
                        };

                        const alpha1 = powerIteration(K, N, null);
                        const alpha2 = powerIteration(K, N, alpha1);

                        xs = alpha1;
                        ys = alpha2;

                        const elapsed = (performance.now() - t0).toFixed(1);
                        console.log(`[Embeddings] PCA complete in ${elapsed}ms`);
                    } catch (pcaError) {
                        console.error("[Embeddings] PCA failed, falling back to raw dimensions", pcaError);
                        xs = vectors.map(v => v[0]);
                        ys = vectors.map(v => v[1] || 0);
                    }
                }

                // 3. Normalize to 0-1
                let minX = Math.min(...xs), maxX = Math.max(...xs);
                let minY = Math.min(...ys), maxY = Math.max(...ys);

                if (maxX === minX) { maxX += 1e-6; minX -= 1e-6; }
                if (maxY === minY) { maxY += 1e-6; minY -= 1e-6; }

                const normalize = (val: number, min: number, max: number) => (val - min) / (max - min);

                const finalPoints = validVideos.map((v, i) => ({
                    id: v.id,
                    x: normalize(xs[i], minX, maxX),
                    y: normalize(ys[i], minY, maxY),
                    video: v
                }));

                setPoints(finalPoints);
                setLoading(false);

            } catch (err: any) {
                console.error("Embedding processing error:", err);
                setError(err.message);
                setLoading(false);
            }
        };

        const timer = setTimeout(processEmbeddings, 50);
        return () => clearTimeout(timer);
    }, [videos]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            setTransform(p => ({
                ...p,
                k: Math.min(Math.max(0.5, p.k + e.deltaY * -0.001), 5)
            }));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setTransform(p => ({
            ...p,
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        }));
    };

    const handleMouseUp = () => setIsDragging(false);

    const padding = 60;

    return (
        <div className="flex flex-col">
            {/* Canvas */}
            <div
                ref={containerRef}
                className="relative w-full h-[500px] lg:h-[700px] rounded-2xl border border-dashed border-border-light bg-gray-50 overflow-hidden select-none cursor-move"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.25) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Controls */}
                <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white p-1.5 rounded-xl shadow-lg border border-border-light">
                    <button onClick={() => setTransform(p => ({ ...p, k: Math.min(p.k + 0.5, 5) }))} className="p-2 hover:bg-gray-50 rounded-lg text-text-secondary cursor-pointer">
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={() => setTransform(p => ({ ...p, k: Math.max(p.k - 0.5, 0.5) }))} className="p-2 hover:bg-gray-50 rounded-lg text-text-secondary cursor-pointer">
                        <ZoomOut className="w-5 h-5" />
                    </button>
                    <div className="h-px bg-border-light mx-1" />
                    <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} className="p-2 hover:bg-gray-50 rounded-lg text-text-secondary cursor-pointer">
                        <Maximize className="w-5 h-5" />
                    </button>
                </div>

                {loading && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md">
                        <div className="relative flex items-center justify-center mb-6">
                            <div className="absolute w-20 h-20 border-4 border-mb-green-light/30 rounded-full animate-ping"></div>
                            <div className="absolute w-16 h-16 border-4 border-t-mb-green-dark border-r-amber-400 border-b-mb-pink-dark border-l-mb-green-light rounded-full animate-spin"></div>
                            <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center z-10">
                                <Cpu className="w-4 h-4 text-mb-green-dark animate-pulse" />
                            </div>
                        </div>
                        <h3 className="text-sm font-semibold text-text-primary tracking-tight mb-2">Analyzing Ad Inventory</h3>
                        <p className="text-xs text-text-tertiary">Retrieving embeddings and running PCA projection...</p>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center text-red-500 bg-red-50/80 p-4 text-center">
                        Error visualizing embeddings: {error}
                    </div>
                )}

                {!loading && points.length > 0 && (
                    <div
                        className="w-full h-full origin-center transition-transform duration-75 ease-out"
                        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
                    >
                        {points.map(pt => {
                            const w = containerRef.current?.clientWidth || 800;
                            const h = containerRef.current?.clientHeight || 600;

                            const px = padding + pt.x * (w - padding * 2);
                            const py = padding + pt.y * (h - padding * 2);

                            const isSelected = selectedVideo?.id === pt.id;
                            const isHovered = hoveredVideo?.id === pt.id;

                            return (
                                <div
                                    key={pt.id}
                                    className="absolute flex items-center justify-center transition-all duration-300 ease-spring cursor-pointer"
                                    style={{
                                        left: px,
                                        top: py,
                                        width: POINT_SIZE,
                                        height: POINT_SIZE,
                                        transform: `translate(-50%, -50%) scale(${isSelected || isHovered ? HOVER_SCALE : 1})`,
                                        zIndex: isSelected || isHovered ? 50 : 10
                                    }}
                                    onMouseEnter={() => setHoveredVideo(pt.video)}
                                    onMouseLeave={() => setHoveredVideo(null)}
                                    onClick={(e) => { e.stopPropagation(); setSelectedVideo(pt.video); }}
                                >
                                    <div className={`w-full h-full rounded shadow-sm shadow-black/20 ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`} style={{ background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)' }} />

                                    {/* Hover Tooltip */}
                                    {(isHovered || isSelected) && (
                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 animate-[fadeInUp_0.2s_forwards]">
                                            <div className="w-24 h-14 bg-gray-900 rounded-lg overflow-hidden border border-border-light shadow-xl">
                                                <SafeVideo
                                                    src={pt.video.hls?.videoUrl || ""}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    loop
                                                    playsInline
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Empty State */}
                {!loading && points.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
                        No embeddings available to visualize. (Make sure your videos have finished indexing)
                    </div>
                )}

                {/* Preview Card */}
                {selectedVideo && (
                    <div className="absolute top-4 right-4 z-30 w-80 bg-white rounded-2xl shadow-2xl border border-border-light overflow-hidden animate-[fadeIn_0.3s_ease-out]">
                        <div className="relative aspect-video bg-black group">
                            <SafeVideo
                                src={selectedVideo.hls?.videoUrl || ""}
                                controls
                                className="w-full h-full object-contain"
                            />
                            <button
                                onClick={() => setSelectedVideo(null)}
                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4">
                            <h3 className="font-semibold text-text-primary line-clamp-1 mb-1">
                                {selectedVideo.systemMetadata?.filename || selectedVideo.id}
                            </h3>
                            <div className="flex items-center gap-4 text-xs text-text-tertiary mb-3">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {Math.round(selectedVideo.systemMetadata?.duration || 0)}s
                                </span>
                                <span className="flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" />
                                    {fmtSize(selectedVideo.systemMetadata?.size || 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Ad metadata table + Databricks export (data is real; labels match export SQL) */}
            <div className="mt-6 flex-none bg-white border border-border-light rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-border-light flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-text-primary" />
                        <h3 className="text-sm font-semibold text-text-primary">Databricks Ad Metadata Table</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {analyzingAll && (
                            <span className="text-[11px] font-medium text-mb-green-dark animate-pulse">
                                Analyzing... {analyzingProgress}%
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setExportModalOpen(true)}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-gray-100 px-2.5 py-1 rounded border border-border-light transition-colors cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-border-light text-text-tertiary font-medium">
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Creative ID</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Campaign Name</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Duration</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Extracted Visual Contexts</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Target Demographics</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Negative Demographics</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Target Audience Affinity</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Negative Campaign Contexts</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Brand Safety (GARM)</th>
                                <th className="px-5 py-3 font-medium whitespace-nowrap">Marengo embedding</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light text-text-secondary">
                            {videos.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-5 py-8 text-center text-text-tertiary">No data available</td>
                                </tr>
                            ) : (isTableExpanded ? videos : videos.slice(0, 5)).map((v, idx) => {
                                const ana = analysisMap[v.id];

                                const creativeId = v.systemMetadata?.filename || v.id;
                                const duration = `${Math.round(v.systemMetadata?.duration || 0)}s`;

                                const campaignName = ana?.proposedTitle || <span className="text-text-tertiary italic text-[11px]">Pending Analysis...</span>;
                                const contexts = ana?.recommendedContexts?.length > 0 ? `[${ana.recommendedContexts.slice(0, 3).join(", ")}]` : <span className="text-text-tertiary italic text-[11px]">Pending...</span>;
                                const targetDemographics = ana?.targetDemographics?.length > 0 ? `[${ana.targetDemographics.join(", ")}]` : <span className="text-text-tertiary italic text-[11px]">Pending...</span>;
                                const negativeDemographics = ana?.negativeDemographics?.length > 0 ? `[${ana.negativeDemographics.join(", ")}]` : <span className="text-text-tertiary italic text-[11px] font-medium text-mb-green-dark">None</span>;
                                const audience = ana?.targetAudience
                                    ? (typeof ana.targetAudience === 'string' ? ana.targetAudience : `[${[...(ana.targetAudience.highPriority || []), ...(ana.targetAudience.mediumPriority || []), ...(ana.targetAudience.lowPriority || [])].slice(0, 3).join(", ")}]`)
                                    : <span className="text-text-tertiary italic text-[11px]">Pending...</span>;
                                const negContexts = ana?.negativeCampaignContexts?.length > 0 ? `[${ana.negativeCampaignContexts.slice(0, 3).join(", ")}]` : <span className="text-text-tertiary italic text-[11px]">Pending...</span>;
                                const exclusions = ana?.brandSafetyGARM?.length > 0 ? `[${ana.brandSafetyGARM.slice(0, 3).join(", ")}]` : <span className="text-text-tertiary italic text-[11px] font-medium text-mb-green-dark">Clean</span>;

                                const adVec = getMarengoAdVectorForCreative(v);

                                return (
                                    <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-5 py-3 font-mono text-[11px] font-medium text-text-primary truncate max-w-[120px]">{creativeId}</td>
                                        <td className="px-5 py-3 font-medium text-text-primary truncate max-w-[180px]">{campaignName}</td>
                                        <td className="px-5 py-3 truncate max-w-[100px] text-text-secondary">{duration}</td>
                                        <td className="px-5 py-3 truncate max-w-[200px] text-text-secondary">{contexts}</td>
                                        <td className="px-5 py-3 truncate max-w-[160px] text-text-secondary">{targetDemographics}</td>
                                        <td className="px-5 py-3 truncate max-w-[160px] text-red-600">{negativeDemographics}</td>
                                        <td className="px-5 py-3 truncate max-w-[160px] text-text-secondary">{audience}</td>
                                        <td className="px-5 py-3 truncate max-w-[160px] text-text-secondary">{typeof negContexts === 'string' ? negContexts : null}{typeof negContexts === 'object' ? negContexts : null}</td>
                                        <td className="px-5 py-3 text-red-600 truncate max-w-[150px]">{exclusions}</td>
                                        <td className="px-5 py-3 max-w-[200px]">
                                            {adVec ? (
                                                <span className="inline-flex flex-col gap-0.5">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-mb-green-light/60 bg-mb-green-light/20 text-[10px] font-medium text-mb-green-dark w-fit">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-mb-green-dark shrink-0" />
                                                        {adVec.length}d in Delta export
                                                    </span>
                                                    <span className="text-[10px] text-text-tertiary leading-snug">
                                                        JSON array for Mosaic / Vector Search
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-text-tertiary italic text-[11px]">
                                                    No clips in cache — refresh Videos tab
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {videos.length > 5 && (
                    <div className="border-t border-border-light bg-gray-50/50">
                        <button
                            onClick={() => setIsTableExpanded(!isTableExpanded)}
                            className="w-full px-5 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {isTableExpanded ? "Collapse view" : `View all ${videos.length} entries`}
                        </button>
                    </div>
                )}
            </div>

            <DatabricksExportModal
                open={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                categoryName={categoryName}
                rows={adMetadataExportRows}
            />
        </div>
    );
}

// Helper component to swallow AbortErrors when autoPlay videos unmount rapidly
function SafeVideo({ src, className, controls, muted, loop, playsInline }: any) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && src) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Swallow the AbortError caused by rapid mouse movement
                    if (error.name !== 'AbortError') {
                        console.error("Video play error:", error);
                    }
                });
            }
        }
    }, [src]);

    return (
        <video
            ref={videoRef}
            src={src}
            className={className}
            controls={controls}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            muted={muted}
            loop={loop}
            playsInline={playsInline}
        />
    );
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
