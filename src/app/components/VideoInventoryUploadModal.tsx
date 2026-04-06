"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { upload } from '@vercel/blob/client';
import { invalidateVideoCache } from "../lib/videoCache";

interface VideoInventoryUploadModalProps {
    open: boolean;
    onClose: () => void;
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
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-medium text-white backdrop-blur-sm shadow-sm border border-white/10 z-10">
                {info.duration}
            </span>
            {!disabled && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors opacity-0 group-hover/card:opacity-100 z-10"
                >
                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5">
                        <path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                </button>
            )}
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 transition-opacity duration-200 z-10 ${hovering ? "opacity-100" : "opacity-0"}`}>
                <div className="h-full bg-white/80 transition-[width] duration-75" style={{ width: `${progress}%` }} />
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
export default function VideoInventoryUploadModal({
    open,
    onClose,
    targetIndex = "tl-context-engine-videos",
}: VideoInventoryUploadModalProps) {
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
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

    if (!open) return null;

    function handleTagAdd(val: string) {
        const trimmed = val.trim();
        if (trimmed && !tags.includes(trimmed)) {
            setTags([...tags, trimmed]);
        }
        setTagInput("");
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
        setTags([]);
        setTagInput("");
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

            let maxFilePercent = 0;
            try {
                const blob = await upload(vf.file.name, vf.file, {
                    access: 'public',
                    handleUploadUrl: '/api/upload',
                    multipart: true,
                    onUploadProgress: (p) => {
                        // Vercel Blob multipart uploads can fire out-of-order progress events
                        maxFilePercent = Math.max(maxFilePercent, p.percentage);
                        const overallPercent = Math.round(((i + (maxFilePercent / 100)) / total) * 50);
                        setUploadProgress((prev) => ({
                            ...prev,
                            percent: Math.max(prev.percent, overallPercent),
                            message: `Uploading to storage (${i + 1}/${total}) — ${Math.round(maxFilePercent)}%`,
                        }));
                    },
                });
                blobUrls.push(blob.url);
            } catch (err: unknown) {
                const msg = `Failed to upload "${vf.file.name}": ${err instanceof Error ? err.message : "Unknown error"}`;
                errors.push(msg);
                console.error(msg);
            }

            setUploadProgress((prev) => ({
                ...prev,
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
                        type: "inventory_video",
                        tags: tags.join(", "),
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

    const isValid = videoFiles.length > 0;

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
                        Upload Inventory Videos
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
                    {/* Information Note */}
                    <div className="bg-mb-pink-light/30 border border-mb-pink-light rounded-xl p-4 flex gap-3">
                        <div className="shrink-0 mt-0.5">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-mb-pink-dark">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 16V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">Automatic Metadata Extraction</h4>
                            <p className="text-xs text-gray-700 leading-relaxed">
                                Uploaded videos are immediately indexed by the TwelveLabs engine. The system will automatically analyze content, parse raw visual/audio semantics, and dynamically generate precise ad insertion points based on ad inventory targeting goals.
                            </p>
                        </div>
                    </div>

                    {/* Upload Progress Banner */}
                    <UploadProgressBanner progress={uploadProgress} />

                    {/* Custom Video Tags */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Internal Organization Tags</label>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {tags.map((tag) => (
                                    <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-[11px] font-medium text-text-secondary ${uploading ? "opacity-60" : ""}`}>
                                        {tag}
                                        {!uploading && (
                                            <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-text-primary transition-colors">
                                                <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5"><path d="M6 2L2 6M2 2L6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!uploading && (
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleTagAdd(tagInput); } }}
                                placeholder="e.g. Technology, Lifestyle, Organic Content..."
                                className="w-full px-4 py-2.5 rounded-lg border border-border-light bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-default transition-colors"
                            />
                        )}
                    </div>

                    {/* Video Upload */}
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                            Select Videos
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
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light shrink-0 bg-gray-50 rounded-b-2xl">
                    {!uploading ? (
                        <>
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 rounded-full border border-border-default text-sm font-medium text-text-primary hover:bg-white transition-all duration-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!isValid}
                                className={`
                  px-5 py-2 rounded-full text-sm font-medium transition-all duration-200
                  ${isValid
                                        ? "bg-gray-900 text-white hover:bg-black shadow-sm"
                                        : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    }
                `}
                            >
                                Upload & Analyze
                            </button>
                        </>
                    ) : uploadProgress.phase === "done" || uploadProgress.phase === "error" ? (
                        <button
                            onClick={handleReset}
                            className="px-5 py-2 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-black transition-all duration-200"
                        >
                            Done
                        </button>
                    ) : (
                        <p className="text-xs text-text-tertiary animate-pulse">
                            Processing with TwelveLabs…
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
