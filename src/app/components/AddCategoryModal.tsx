"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { invalidateVideoCache } from "../lib/videoCache";

interface AddCategoryModalProps {
    open: boolean;
    onClose: () => void;
    /** When true, name / contexts / exclusions are pre-filled and locked — only video upload is active */
    videoOnly?: boolean;
    categoryName?: string;
    categoryContexts?: string[];
    categoryExclusions?: string[];
    /** TwelveLabs index name for video indexing */
    targetIndex?: string;
}

interface VideoFileInfo {
    file: File;
    url: string;
    duration: string;
}

interface UploadProgress {
    phase: "idle" | "blob" | "twelvelabs" | "done" | "error";
    percent: number;
    message: string;
    currentFile?: string;
    blobCompleted: number;
    blobTotal: number;
    tlCompleted: number;
    tlTotal: number;
    errors: string[];
}

const contextSuggestions = [
    "Bar scenes", "Social gatherings", "Celebration", "Outdoor", "Construction",
    "Adventure", "Sports viewing", "Party", "Casual hangout", "Business",
    "Planning", "Future-focused", "Family", "Urban", "Travel",
];

const exclusionSuggestions = [
    "Violence", "Addiction", "Underage", "Gambling", "Crime",
    "Health/diet content", "Urban luxury", "Sedentary", "Political", "Religious",
];

function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Spinner ────────────────────────────────────────────── */
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-20" />
            <path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}

/* ── Individual video preview card ──────────────────────── */
function VideoPreviewCard({
    info,
    onRemove,
    disabled,
}: {
    info: VideoFileInfo;
    onRemove: () => void;
    disabled?: boolean;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [progress, setProgress] = useState(0);
    const [hovering, setHovering] = useState(false);
    const rafRef = useRef<number>(0);

    const tick = useCallback(() => {
        if (videoRef.current) {
            const pct = (videoRef.current.currentTime / (videoRef.current.duration || 1)) * 100;
            setProgress(pct);
            rafRef.current = requestAnimationFrame(tick);
        }
    }, []);

    function handleMouseEnter() {
        setHovering(true);
        videoRef.current?.play().catch(() => { });
        rafRef.current = requestAnimationFrame(tick);
    }

    function handleMouseLeave() {
        setHovering(false);
        cancelAnimationFrame(rafRef.current);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
        setProgress(0);
    }

    useEffect(() => {
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    return (
        <div
            className={`relative rounded-xl overflow-hidden bg-gray-900 group/card ${disabled ? "opacity-60 pointer-events-none" : ""}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <video
                ref={videoRef}
                src={info.url}
                muted
                loop
                playsInline
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                preload="metadata"
                className="w-full aspect-video object-cover"
            />
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-white backdrop-blur-sm">
                {info.duration}
            </span>
            {!disabled && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors opacity-0 group-hover/card:opacity-100"
                >
                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5">
                        <path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                </button>
            )}
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 transition-opacity duration-200 ${hovering ? "opacity-100" : "opacity-0"}`}>
                <div className="h-full bg-white/80 transition-[width] duration-75" style={{ width: `${progress}%` }} />
            </div>
            <div className="px-2.5 py-2 bg-white">
                <p className="text-[11px] text-text-primary truncate font-medium">{info.file.name}</p>
                <p className="text-[10px] text-text-tertiary">{(info.file.size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
        </div>
    );
}

/* ── Upload Progress Banner ─────────────────────────────── */
function UploadProgressBanner({ progress }: { progress: UploadProgress }) {
    if (progress.phase === "idle") return null;

    const isDone = progress.phase === "done";
    const isError = progress.phase === "error";

    return (
        <div className={`rounded-xl border p-4 space-y-3 transition-all duration-300 ${isDone ? "border-green-200 bg-green-50/50" :
            isError ? "border-red-200 bg-red-50/50" :
                "border-border-light bg-gray-50/50"
            }`}>
            {/* Status row */}
            <div className="flex items-center gap-3">
                {!isDone && !isError && <Spinner className="w-4 h-4 text-text-secondary" />}
                {isDone && (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-green-600">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
                {isError && (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-red-500">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                )}
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${isDone ? "text-green-700" : isError ? "text-red-600" : "text-text-primary"}`}>
                        {progress.message}
                    </p>
                    {progress.currentFile && !isDone && (
                        <p className="text-[10px] text-text-tertiary truncate mt-0.5">{progress.currentFile}</p>
                    )}
                </div>
                <span className="text-[11px] font-medium text-text-secondary tabular-nums shrink-0">
                    {Math.round(progress.percent)}%
                </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-gray-200/80 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${isDone ? "bg-green-500" :
                        isError ? "bg-red-400" :
                            "bg-gray-700"
                        }`}
                    style={{ width: `${progress.percent}%` }}
                />
            </div>

            {/* Phase breakdown */}
            {(progress.phase === "blob" || progress.phase === "twelvelabs") && (
                <div className="flex items-center gap-4 text-[10px] text-text-tertiary">
                    <span className={progress.phase === "blob" ? "text-text-secondary font-medium" : ""}>
                        Vercel Blob: {progress.blobCompleted}/{progress.blobTotal}
                    </span>
                    <span className={progress.phase === "twelvelabs" ? "text-text-secondary font-medium" : ""}>
                        TwelveLabs: {progress.tlCompleted}/{progress.tlTotal}
                    </span>
                </div>
            )}

            {/* Errors */}
            {progress.errors.length > 0 && (
                <div className="space-y-1 mt-1">
                    {progress.errors.map((err, i) => (
                        <p key={i} className="text-[10px] text-red-500">⚠ {err}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Main Modal ─────────────────────────────────────────── */
export default function AddCategoryModal({
    open,
    onClose,
    videoOnly = false,
    categoryName = "",
    categoryContexts = [],
    categoryExclusions = [],
    targetIndex = "tl-context-engine-ads",
}: AddCategoryModalProps) {
    const [name, setName] = useState("");
    const [contexts, setContexts] = useState<string[]>([]);
    const [contextInput, setContextInput] = useState("");
    const [exclusions, setExclusions] = useState<string[]>([]);
    const [exclusionInput, setExclusionInput] = useState("");
    const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [initialized, setInitialized] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
        phase: "idle",
        percent: 0,
        message: "",
        blobCompleted: 0,
        blobTotal: 0,
        tlCompleted: 0,
        tlTotal: 0,
        errors: [],
    });

    // Sync pre-filled values when modal opens
    useEffect(() => {
        if (open && !initialized) {
            if (videoOnly) {
                setName(categoryName);
                setContexts(categoryContexts);
                setExclusions(categoryExclusions);
            }
            setInitialized(true);
        }
        if (!open) {
            setInitialized(false);
        }
    }, [open, videoOnly, categoryName, categoryContexts, categoryExclusions, initialized]);

    if (!open) return null;

    function handleContextAdd(val: string) {
        if (videoOnly) return;
        const trimmed = val.trim();
        if (trimmed && !contexts.includes(trimmed)) {
            setContexts([...contexts, trimmed]);
        }
        setContextInput("");
    }

    function handleExclusionAdd(val: string) {
        if (videoOnly) return;
        const trimmed = val.trim();
        if (trimmed && !exclusions.includes(trimmed)) {
            setExclusions([...exclusions, trimmed]);
        }
        setExclusionInput("");
    }

    function handleFiles(newFiles: FileList | null) {
        if (!newFiles || uploading) return;
        const accepted = Array.from(newFiles).filter((f) =>
            f.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/i.test(f.name)
        );
        accepted.forEach((file) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement("video");
            video.preload = "metadata";
            video.src = url;
            video.onloadedmetadata = () => {
                setVideoFiles((prev) => [
                    ...prev,
                    { file, url, duration: formatDuration(video.duration) },
                ]);
            };
        });
    }

    function removeVideo(index: number) {
        if (uploading) return;
        setVideoFiles((prev) => {
            const copy = [...prev];
            URL.revokeObjectURL(copy[index].url);
            copy.splice(index, 1);
            return copy;
        });
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
    }

    function handleReset() {
        if (uploading) return; // Prevent closing during upload
        setName("");
        setContexts([]);
        setContextInput("");
        setExclusions([]);
        setExclusionInput("");
        videoFiles.forEach((v) => URL.revokeObjectURL(v.url));
        setVideoFiles([]);
        setUploadProgress({
            phase: "idle", percent: 0, message: "",
            blobCompleted: 0, blobTotal: 0, tlCompleted: 0, tlTotal: 0, errors: [],
        });
        onClose();
    }

    /* ── Upload Pipeline ──────────────────────────────────── */
    async function handleUpload() {
        if (videoFiles.length === 0 || uploading) return;

        setUploading(true);
        const total = videoFiles.length;
        const errors: string[] = [];

        // Phase 1: Upload to Vercel Blob
        setUploadProgress({
            phase: "blob",
            percent: 0,
            message: `Uploading ${total} video${total !== 1 ? "s" : ""} to storage…`,
            blobCompleted: 0,
            blobTotal: total,
            tlCompleted: 0,
            tlTotal: total,
            errors: [],
        });

        const blobUrls: string[] = [];

        for (let i = 0; i < videoFiles.length; i++) {
            const vf = videoFiles[i];
            const blobPercent = Math.round(((i) / total) * 50); // Blob is 0-50%

            setUploadProgress((prev) => ({
                ...prev,
                percent: blobPercent,
                message: `Uploading to Vercel Blob (${i + 1}/${total})…`,
                currentFile: vf.file.name,
                blobCompleted: i,
            }));

            try {
                const formData = new FormData();
                formData.append("file", vf.file);
                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({ error: "Upload failed" }));
                    throw new Error(errBody.error || `Upload returned ${res.status}`);
                }
                const blob = await res.json();
                blobUrls.push(blob.url);
            } catch (err: unknown) {
                const msg = `Failed to upload "${vf.file.name}": ${err instanceof Error ? err.message : "Unknown error"}`;
                errors.push(msg);
                console.error(msg);
            }

            setUploadProgress((prev) => ({
                ...prev,
                percent: Math.round(((i + 1) / total) * 50),
                blobCompleted: i + 1,
            }));
        }

        if (blobUrls.length === 0) {
            setUploadProgress((prev) => ({
                ...prev,
                phase: "error",
                percent: 0,
                message: "All uploads to storage failed.",
                errors,
            }));
            setUploading(false);
            return;
        }

        // Phase 2: Index on TwelveLabs via SSE
        setUploadProgress((prev) => ({
            ...prev,
            phase: "twelvelabs",
            percent: 50,
            message: `Indexing ${blobUrls.length} video${blobUrls.length !== 1 ? "s" : ""} on TwelveLabs…`,
            currentFile: undefined,
            blobCompleted: total,
            errors,
        }));

        try {
            const res = await fetch("/api/videos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    videoURLs: blobUrls,
                    metadata: {
                        type: "ad",
                        category: videoOnly ? categoryName : name,
                        slug: (videoOnly ? categoryName : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                        targetContexts: (videoOnly ? categoryContexts : contexts).join(", "),
                        exclusions: (videoOnly ? categoryExclusions : exclusions).join(", "),
                    },
                    target_index: targetIndex,
                }),
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({ error: "Unknown server error" }));
                throw new Error(errBody.error || `Server returned ${res.status}`);
            }

            // Read SSE stream
            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response stream");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                let eventName = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        eventName = line.slice(7).trim();
                    } else if (line.startsWith("data: ") && eventName) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const tlPercent = 50 + Math.round((data.percent || 0) / 2); // TL is 50-100%

                            if (eventName === "progress") {
                                setUploadProgress((prev) => ({
                                    ...prev,
                                    percent: tlPercent,
                                    message: data.message,
                                    tlCompleted: data.completed || 0,
                                }));
                            } else if (eventName === "video_done") {
                                setUploadProgress((prev) => ({
                                    ...prev,
                                    percent: tlPercent,
                                    message: `Indexed video ${data.completed} of ${data.total}`,
                                    tlCompleted: data.completed || 0,
                                }));
                            } else if (eventName === "video_error") {
                                errors.push(`TwelveLabs error for video ${data.index + 1}: ${data.error}`);
                                setUploadProgress((prev) => ({
                                    ...prev,
                                    percent: tlPercent,
                                    errors: [...prev.errors, `TwelveLabs: ${data.error}`],
                                }));
                            } else if (eventName === "complete") {
                                // Invalidate cached video data so next page load fetches fresh
                                invalidateVideoCache();
                                setUploadProgress((prev) => ({
                                    ...prev,
                                    phase: "done",
                                    percent: 100,
                                    message: `Successfully indexed ${data.videos?.length || 0} of ${data.total} videos`,
                                    tlCompleted: data.total,
                                    errors: prev.errors,
                                }));
                            }
                        } catch {
                            // ignore malformed JSON
                        }
                        eventName = "";
                    }
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            errors.push(msg);
            setUploadProgress((prev) => ({
                ...prev,
                phase: "error",
                message: `TwelveLabs indexing failed: ${msg}`,
                errors,
            }));
        }

        setUploading(false);
    }

    const filteredContextSuggestions = videoOnly ? [] : contextSuggestions.filter(
        (s) => !contexts.includes(s) && s.toLowerCase().includes(contextInput.toLowerCase())
    ).slice(0, 6);

    const filteredExclusionSuggestions = videoOnly ? [] : exclusionSuggestions.filter(
        (s) => !exclusions.includes(s) && s.toLowerCase().includes(exclusionInput.toLowerCase())
    ).slice(0, 6);

    const isValid = videoOnly ? videoFiles.length > 0 : !!name.trim();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleReset}>
            <div className="absolute inset-0 bg-gray-700/40 backdrop-blur-[2px] animate-fade-in" />

            <div
                className="relative bg-white rounded-2xl shadow-lg w-full max-w-[560px] mx-4 animate-modal-in max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border-light shrink-0">
                    <h2 className="text-lg font-semibold text-text-primary">
                        {videoOnly ? "Add Videos" : "Add Category"}
                    </h2>
                    {!uploading && (
                        <button
                            onClick={handleReset}
                            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-gray-50 transition-colors duration-200"
                            aria-label="Close modal"
                        >
                            <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4">
                                <path d="M9.5 2.5L2.5 9.5M2.5 2.5L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Scrollable Content */}
                <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
                    {/* Upload Progress Banner */}
                    <UploadProgressBanner progress={uploadProgress} />

                    {/* Category Name */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Category Name</label>
                        <input
                            type="text"
                            value={videoOnly ? categoryName : name}
                            onChange={(e) => !videoOnly && setName(e.target.value)}
                            placeholder="e.g. Premium Spirits, Automotive"
                            disabled={videoOnly || uploading}
                            className={`w-full px-4 py-2.5 rounded-lg border border-border-light text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-default transition-colors ${(videoOnly || uploading) ? "bg-gray-50 text-text-secondary cursor-not-allowed" : "bg-white"}`}
                        />
                    </div>

                    {/* Target Contexts */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Target Contexts</label>
                        {(videoOnly ? categoryContexts : contexts).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(videoOnly ? categoryContexts : contexts).map((ctx) => (
                                    <span key={ctx} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mb-green-light/40 text-[11px] font-medium text-mb-green-dark ${(videoOnly || uploading) ? "opacity-60" : ""}`}>
                                        {ctx}
                                        {!videoOnly && !uploading && (
                                            <button onClick={() => setContexts(contexts.filter((c) => c !== ctx))} className="hover:text-text-primary transition-colors">
                                                <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!videoOnly && !uploading && (
                            <>
                                <input
                                    type="text"
                                    value={contextInput}
                                    onChange={(e) => setContextInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleContextAdd(contextInput); } }}
                                    placeholder="Type and press Enter to add..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-border-light bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-default transition-colors"
                                />
                                {filteredContextSuggestions.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {filteredContextSuggestions.map((s) => (
                                            <button key={s} onClick={() => handleContextAdd(s)} className="px-2.5 py-1 rounded-full border border-border-light text-[11px] font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors">
                                                + {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Exclusions */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Exclusions</label>
                        {(videoOnly ? categoryExclusions : exclusions).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(videoOnly ? categoryExclusions : exclusions).map((exc) => (
                                    <span key={exc} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mb-pink-light/40 text-[11px] font-medium text-mb-pink-dark ${(videoOnly || uploading) ? "opacity-60" : ""}`}>
                                        {exc}
                                        {!videoOnly && !uploading && (
                                            <button onClick={() => setExclusions(exclusions.filter((e) => e !== exc))} className="hover:text-text-primary transition-colors">
                                                <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!videoOnly && !uploading && (
                            <>
                                <input
                                    type="text"
                                    value={exclusionInput}
                                    onChange={(e) => setExclusionInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleExclusionAdd(exclusionInput); } }}
                                    placeholder="Type and press Enter to add..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-border-light bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-default transition-colors"
                                />
                                {filteredExclusionSuggestions.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {filteredExclusionSuggestions.map((s) => (
                                            <button key={s} onClick={() => handleExclusionAdd(s)} className="px-2.5 py-1 rounded-full border border-border-light text-[11px] font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors">
                                                + {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Video Upload */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Upload Videos
                            {videoFiles.length > 0 && (
                                <span className="text-text-tertiary font-normal ml-1">({videoFiles.length})</span>
                            )}
                        </label>

                        {!uploading && (
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`
                  relative border-2 border-dashed rounded-xl p-6 cursor-pointer text-center
                  transition-all duration-200
                  ${dragOver
                                        ? "border-gray-700 bg-gray-50"
                                        : "border-border-light hover:border-border-default hover:bg-gray-50/50"
                                    }
                `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="video/*"
                                    multiple
                                    onChange={(e) => handleFiles(e.target.files)}
                                    className="hidden"
                                />
                                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-50 flex items-center justify-center">
                                    <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5 text-text-tertiary">
                                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                                <p className="text-sm text-text-secondary mb-0.5">
                                    Drop video files here, or <span className="text-text-primary font-medium">browse</span>
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    Supports MP4, MOV, AVI, MKV, WebM
                                </p>
                            </div>
                        )}

                        {videoFiles.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
                                {videoFiles.map((info, i) => (
                                    <VideoPreviewCard
                                        key={`${info.file.name}-${i}`}
                                        info={info}
                                        onRemove={() => removeVideo(i)}
                                        disabled={uploading}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light shrink-0">
                    {!uploading ? (
                        <>
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 rounded-full border border-border-default text-sm font-medium text-text-primary hover:border-gray-700 transition-all duration-200 hover:rounded-2xl"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!isValid}
                                className={`
                  px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:rounded-2xl
                  ${isValid
                                        ? "bg-gray-700 text-white hover:bg-gray-600"
                                        : "bg-gray-100 text-text-tertiary cursor-not-allowed"
                                    }
                `}
                            >
                                {videoOnly ? "Upload Videos" : "Add Category"}
                            </button>
                        </>
                    ) : uploadProgress.phase === "done" || uploadProgress.phase === "error" ? (
                        <button
                            onClick={handleReset}
                            className="px-5 py-2 rounded-full bg-gray-700 text-white text-sm font-medium hover:bg-gray-600 transition-all duration-200"
                        >
                            Done
                        </button>
                    ) : (
                        <p className="text-xs text-text-tertiary">
                            Upload in progress — please don&apos;t close this window
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
