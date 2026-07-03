"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import Hls from "hls.js";
import { hlsClientConfig } from "../../../lib/hlsClientConfig";
import { useVideos } from "../../../lib/videoCache";
import {
  identifyAdBreaks,
  buildUserEligibilityCache,
  selectAdsWithDiversity,
} from "../../../lib/adPlacementEngine";
import {
  DEFAULT_PLACEMENT_CONFIG,
  MOCK_USERS,
  type AdInventoryItem,
  type CastMember,
  type Segment,
} from "../../../lib/types";

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PlannedInsertion = {
  breakIndex: number;
  timestamp: number;
  adUrl: string;
  adTitle: string;
  adBrand: string;
};

export default function GeneratedVideoPreviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const videoId = params.videoId as string;
  const selectedUserId = searchParams.get("user") || "ethan";
  const user = MOCK_USERS.find((u) => u.id === selectedUserId) || MOCK_USERS[0];

  const { videos, loading: videosLoading } = useVideos("tl-context-engine-videos");
  const video = useMemo(() => videos.find((v) => v.id === videoId) || null, [videos, videoId]);
  const hlsUrl = video?.hls?.videoUrl ?? null;

  // Timeline / inventory data
  const [segments, setSegments] = useState<Segment[]>([]);
  const [adInventory, setAdInventory] = useState<AdInventoryItem[]>([]);
  const [segmentVectors, setSegmentVectors] = useState<Record<string, number[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);

  // Player refs — always rendered, never conditionally mounted
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const adVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainHlsRef = useRef<Hls | null>(null);
  const adHlsRef = useRef<Hls | null>(null);
  const triggeredRef = useRef<Set<number>>(new Set());

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [adPlayback, setAdPlayback] = useState<PlannedInsertion | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Skip-ad countdown
  const [adElapsed, setAdElapsed] = useState(0);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch timeline + ad inventory ──────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const [timelineRes, inventoryRes, vectorsRes] = await Promise.all([
          fetch("/api/generateAdPlan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId }),
          }),
          fetch("/api/adInventory"),
          fetch(`/api/embeddings?videoId=${videoId}`),
        ]);
        if (!timelineRes.ok) throw new Error("Failed to load timeline");
        if (!inventoryRes.ok) throw new Error("Failed to load ad inventory");
        const timelineData = await timelineRes.json();
        const invData = await inventoryRes.json();
        const vectorsData = vectorsRes.ok ? await vectorsRes.json() : { segments: {} };
        if (!mounted) return;
        setSegments(Array.isArray(timelineData?.segments) ? timelineData.segments : []);
        setCast(Array.isArray(timelineData?.cast) ? timelineData.cast : []);
        setAdInventory(Array.isArray(invData) ? invData : []);
        setSegmentVectors(vectorsData?.segments || {});
      } catch (e) {
        if (mounted) setDataError(e instanceof Error ? e.message : "Failed to load preview");
      } finally {
        if (mounted) setDataLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [videoId]);

  // ── Engine ─────────────────────────────────────────────────
  const enrichedSegments = useMemo(
    () => segments.map((seg, i) => ({ ...seg, vector: segmentVectors[i] ?? undefined })),
    [segments, segmentVectors]
  );
  const adBreaks = useMemo(() => identifyAdBreaks(enrichedSegments, DEFAULT_PLACEMENT_CONFIG), [enrichedSegments]);
  const eligibilityCache = useMemo(() => buildUserEligibilityCache(user, adInventory), [user, adInventory]);
  const plan = useMemo(
    () => selectAdsWithDiversity(adBreaks, user, adInventory, DEFAULT_PLACEMENT_CONFIG, eligibilityCache),
    [adBreaks, user, adInventory, eligibilityCache]
  );
  const selectedInsertions = useMemo<PlannedInsertion[]>(
    () =>
      plan
        .filter((p) => p.selectedAd?.ad?.asset_url)
        .map((p) => ({
          breakIndex: p.breakIndex,
          timestamp: p.timestamp,
          adUrl: p.selectedAd!.ad.asset_url,
          adTitle: p.selectedAd!.ad.proposedTitle || p.selectedAd!.ad.brand,
          adBrand: p.selectedAd!.ad.brand,
        })),
    [plan]
  );

  // Manifest download blob — must be client-only (URL.createObjectURL isn't available on server)
  const [manifestHref, setManifestHref] = useState<string>("#");
  useEffect(() => {
    const payload = {
      sourceVideoId: videoId,
      sourceVideoUrl: hlsUrl || "",
      user: user.name,
      generatedAt: new Date().toISOString(),
      adInsertions: selectedInsertions,
    };
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    setManifestHref(href);
    return () => URL.revokeObjectURL(href);
  }, [videoId, hlsUrl, user.name, selectedInsertions]);

  // ── HLS setup — runs when hlsUrl becomes available ─────────
  // The <video> element is always in the DOM (no early-return), so
  // mainVideoRef.current is reliably populated when this effect fires.
  useEffect(() => {
    const el = mainVideoRef.current;
    if (!el || !hlsUrl) return;
    mainHlsRef.current?.destroy();
    mainHlsRef.current = null;
    if (Hls.isSupported() && hlsUrl.includes(".m3u8")) {
      const hls = new Hls(hlsClientConfig());
      hls.loadSource(hlsUrl);
      hls.attachMedia(el);
      mainHlsRef.current = hls;
    } else {
      el.src = hlsUrl;
    }
    return () => {
      mainHlsRef.current?.destroy();
      mainHlsRef.current = null;
    };
  }, [hlsUrl]);

  // ── Player event listeners — also reruns when hlsUrl changes ─
  // This guarantees it fires after the HLS source is attached and
  // the <video> is definitely in the DOM.
  useEffect(() => {
    const el = mainVideoRef.current;
    if (!el) return;
    const onTime  = () => setCurrentTime(el.currentTime || 0);
    const onDur   = () => { if (el.duration && !isNaN(el.duration)) setDuration(el.duration); };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    el.addEventListener("timeupdate",     onTime);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("play",           onPlay);
    el.addEventListener("pause",          onPause);
    return () => {
      el.removeEventListener("timeupdate",     onTime);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("play",           onPlay);
      el.removeEventListener("pause",          onPause);
    };
  }, [hlsUrl]); // retrigger when source changes so we reattach to the refreshed element

  useEffect(() => {
    const el = mainVideoRef.current;
    if (el) el.playbackRate = playbackRate;
    // Ad always plays at 1x regardless of content speed
  }, [playbackRate]);

  // Keep muted state in sync whenever adPlayback changes (new ad el is created)
  useEffect(() => {
    const adEl = adVideoRef.current;
    if (adEl) adEl.muted = isMuted;
  }, [adPlayback, isMuted]);

  // ── Ad break injection ────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || adPlayback || selectedInsertions.length === 0) return;
    for (const ins of selectedInsertions) {
      if (
        !triggeredRef.current.has(ins.breakIndex) &&
        currentTime >= ins.timestamp &&
        currentTime < ins.timestamp + 2.5
      ) {
        triggeredRef.current.add(ins.breakIndex);
        mainVideoRef.current?.pause();
        setAdPlayback(ins);
        break;
      }
    }
  }, [isPlaying, currentTime, adPlayback, selectedInsertions]);

  // ── Ad overlay playback ───────────────────────────────────
  // We intentionally use native el.src here instead of HLS.js.
  // HLS.js internally uses XHR which triggers CORS preflight — the ad CDN
  // (CloudFront) doesn't send CORS headers, so HLS.js always fails with a
  // network error. Native <video src> bypasses XHR entirely; the browser
  // issues a standard media request that doesn't require CORS headers.
  // On Safari this plays HLS natively. On Chrome the video may not decode HLS
  // but at least won't block the whole overlay with a network error.
  useEffect(() => {
    if (!adPlayback) return;
    const el = adVideoRef.current;
    if (!el) return;
    adHlsRef.current?.destroy();
    adHlsRef.current = null;
    el.src = adPlayback.adUrl;
    el.load();
    el.play().catch(() => {});
    const onEnded = () => {
      setAdPlayback(null);
      mainVideoRef.current?.play().catch(() => {});
    };
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.pause();
      el.src = "";
    };
  }, [adPlayback]);

  // ── Skip-ad timer ────────────────────────────────────────
  useEffect(() => {
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    if (adPlayback) {
      setAdElapsed(0);
      adTimerRef.current = setInterval(() => setAdElapsed((n) => n + 1), 1000);
    }
    return () => { if (adTimerRef.current) clearInterval(adTimerRef.current); };
  }, [adPlayback]);

  const skipAd = useCallback(() => {
    const adEl = adVideoRef.current;
    if (adEl) { adEl.pause(); adEl.src = ""; }
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    setAdPlayback(null);
    mainVideoRef.current?.play().catch(() => {});
  }, []);

  // ── Controls ─────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const el = mainVideoRef.current;
    if (!el || adPlayback || !hlsUrl) return;
    if (isPlaying) el.pause();
    else el.play().catch(() => {});
  }, [isPlaying, adPlayback, hlsUrl]);

  const isLoading = dataLoading || videosLoading;

  // ─────────────────────────────────────────────────────────
  // The layout is always rendered so <video> refs are always
  // in the DOM. HLS attaches when hlsUrl becomes available.
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          {/* Breadcrumb back-link */}
          <Link
            href={`/video-inventory/${videoId}`}
            className="inline-flex items-center gap-1.5 text-[12px] text-foreground-muted hover:text-foreground-body transition-colors mb-2 group"
          >
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 transition-transform group-hover:-translate-x-0.5">
              <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate max-w-[260px]">
              {video?.systemMetadata?.filename?.replace(/\.[^.]+$/, "") || videoId}
            </span>
          </Link>
          <p className="text-[11px] uppercase tracking-[1.5px] text-foreground-muted font-semibold">Generated Preview</p>
          <p className="text-sm text-foreground-muted mt-1">
            Viewer: {user.name}
            {!isLoading && ` / ${plan.length} planned ad breaks`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={manifestHref}
            download={`generated-plan-${videoId}.json`}
            className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 inline-flex items-center gap-1.5"
          >
            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M6 1.5v6M3.5 5.5L6 8l2.5-2.5M2 9.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Download Generated Plan
          </a>
        </div>
      </div>

      {/* Error banner */}
      {dataError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{dataError}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* ── Left: Ad-injected player ── */}
        <div className="rounded-xl border border-border-secondary overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-border-secondary text-[11px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">
            Content Preview (Ad-Injected)
          </div>

          {/* Video area — always in DOM */}
          <div className="relative aspect-video bg-black" onClick={!adPlayback ? togglePlay : undefined} style={{ cursor: adPlayback ? "default" : "pointer" }}>
            <video
              ref={mainVideoRef}
              className={`w-full h-full object-contain transition-opacity duration-200 ${adPlayback ? "opacity-0" : "opacity-100"}`}
              playsInline
            />
            <video
              ref={adVideoRef}
              className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${adPlayback ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              playsInline
            />

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
                <svg className="w-6 h-6 animate-spin text-white/70" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" /></svg>
                <p className="text-[11px] text-white/50">Loading preview data…</p>
              </div>
            )}

            {/* No source overlay */}
            {!isLoading && !hlsUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-[12px] text-white/60">
                Source video stream unavailable
              </div>
            )}

            {/* Play button overlay (only when paused and ready) */}
            {!isPlaying && !adPlayback && !isLoading && hlsUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg viewBox="0 0 20 20" fill="white" className="w-7 h-7 ml-1"><path d="M6 4l12 6-12 6V4z" /></svg>
                </div>
              </div>
            )}

            {/* Ad break label */}
            {adPlayback && (
              <div className="absolute top-2 left-2 z-10 rounded bg-black/70 border border-white/20 px-2 py-1">
                <p className="text-[10px] text-white/60 uppercase tracking-wide font-semibold">Ad Break {adPlayback.breakIndex + 1}</p>
                <p className="text-[12px] text-white font-semibold">{adPlayback.adTitle}</p>
                <p className="text-[10px] text-white/50">{adPlayback.adBrand}</p>
              </div>
            )}

            {/* Skip ad button — appears after 5 s */}
            {adPlayback && (
              <div className="absolute bottom-4 right-4 z-10">
                {adElapsed < 5 ? (
                  <div className="px-3 py-1.5 rounded bg-black/60 border border-white/20 text-[11px] text-white/50 tabular-nums select-none">
                    Skip in {5 - adElapsed}s
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); skipAd(); }}
                    className="px-3 py-1.5 rounded bg-white/20 hover:bg-white/35 backdrop-blur-sm border border-white/30 text-[11px] text-white font-semibold transition-colors"
                  >
                    Skip Ad →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="px-4 py-3 border-t border-border-secondary bg-white space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                disabled={!hlsUrl || isLoading}
                className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                {isPlaying
                  ? <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5"><rect x="3" y="2.5" width="2.2" height="7" rx="0.7"/><rect x="6.8" y="2.5" width="2.2" height="7" rx="0.7"/></svg>
                  : <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5 ml-0.5"><path d="M4 2.8v6.4c0 .5.5.8.9.5l4.6-3.2a.7.7 0 000-1.1L4.9 2.3A.6.6 0 004 2.8z"/></svg>}
              </button>
              <span className="text-[11px] text-foreground-muted tabular-nums w-24 shrink-0">
                {fmt(currentTime)} / {fmt(duration || 0)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.5}
                value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  const el = mainVideoRef.current;
                  if (el && !adPlayback) el.currentTime = t;
                }}
                disabled={!hlsUrl || isLoading}
                className="flex-1 h-1 accent-gray-900 disabled:opacity-30"
              />
              <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="text-[11px] border border-border-secondary rounded px-2 py-1 bg-white text-foreground-subtle"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r}>{r}x</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  const main = mainVideoRef.current;
                  const ad = adVideoRef.current;
                  if (main) main.muted = next;
                  if (ad) ad.muted = next;
                }}
                className="text-[11px] border border-border-secondary rounded px-2 py-1 bg-white text-foreground-subtle hover:bg-gray-50 shrink-0"
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </div>
            {/* Planned break timestamps */}
            {selectedInsertions.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-foreground-muted">Ad breaks:</span>
                {selectedInsertions.map((ins) => (
                  <button
                    key={ins.breakIndex}
                    onClick={() => {
                      const el = mainVideoRef.current;
                      if (el && !adPlayback) { el.currentTime = Math.max(0, ins.timestamp - 3); el.play().catch(() => {}); }
                    }}
                    className="text-[10px] text-foreground-body bg-gray-100 hover:bg-gray-200 rounded px-1.5 py-0.5 tabular-nums transition-colors"
                  >
                    {fmt(ins.timestamp)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Selected ads grid (equal-width cards) ── */}
        <div className="rounded-xl border border-border-secondary overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-border-secondary text-[11px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">
            Selected Ads
          </div>
          <div className="max-h-[70vh] overflow-auto p-3">
            {isLoading && (
              <div className="py-8 flex items-center justify-center gap-2 text-[11px] text-foreground-muted">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" /></svg>
                Loading ad plan…
              </div>
            )}
            {!isLoading && plan.length === 0 && (
              <p className="py-4 text-[11px] text-foreground-muted text-center">No ad breaks available.</p>
            )}
            {/* 2-col grid ensures every card has the same width */}
            {!isLoading && plan.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {plan.map((entry) => (
                  <div key={entry.breakIndex} className="rounded-lg border border-border-secondary overflow-hidden flex flex-col">
                    <div className="px-2.5 py-2 bg-gray-50 border-b border-border-secondary flex items-center justify-between gap-1 shrink-0">
                      <p className="text-[11px] font-semibold text-foreground-body">Break {entry.breakIndex + 1}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-foreground-muted tabular-nums">{fmt(entry.timestamp)}</span>
                        {entry.diversityApplied && <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">Diversity</span>}
                      </div>
                    </div>
                    {entry.selectedAd ? (
                      <>
                        <div className="px-2.5 py-1.5 bg-white shrink-0">
                          <p className="text-[11px] font-semibold text-foreground-body truncate">{entry.selectedAd.ad.proposedTitle || entry.selectedAd.ad.brand}</p>
                          <p className="text-[10px] text-foreground-muted truncate">{entry.selectedAd.ad.brand}</p>
                        </div>
                        <div className="bg-black flex-1 min-h-[120px]">
                          <video src={entry.selectedAd.ad.asset_url} controls className="w-full h-full object-contain" preload="metadata" />
                        </div>
                      </>
                    ) : (
                      <p className="p-3 text-[11px] text-foreground-muted">No ad selected.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cast */}
      {cast.length > 0 && (
        <div className="rounded-xl border border-border-secondary p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-foreground-muted mb-2">Cast</p>
          <div className="flex flex-wrap gap-1.5">
            {cast.map((c) => (
              <span key={c.name} className="px-2 py-1 rounded-full bg-gray-50 border border-border-secondary text-[11px] text-foreground-subtle">{c.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
