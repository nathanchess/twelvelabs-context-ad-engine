"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Hls from "hls.js";
import { hlsClientConfig } from "../../lib/hlsClientConfig";
import { useVideos } from "../../lib/videoCache";
import {
  identifyAdBreaks,
  buildUserEligibilityCache,
  selectAdsWithDiversity,
} from "../../lib/adPlacementEngine";
import {
  MOCK_USERS,
  DEFAULT_PLACEMENT_CONFIG,
  type Segment,
  type CastMember,
  type MockUser,
  type PlacementConfig,
  type AdInventoryItem,
  type AdBreakCandidate,
  type AdRankResult,
  type DiversityPlanEntry,
} from "../../lib/types";

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "---";
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

/* ── Intensity Bar ───────────────────────────────────────── */
function IntensityBar({ value, color = "bg-gray-700" }: { value: number; color?: string }) {
  return (
    <div className="h-1 rounded-full bg-gray-100 overflow-hidden w-16">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/* ── Score Bar ───────────────────────────────────────────── */
function ScoreBar({ value, max = 1, label, className = "" }: { value: number; max?: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className={className}>
      {label && <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-tertiary">{label}</span>
        <span className="text-[10px] font-semibold text-text-primary tabular-nums">{value.toFixed(2)}</span>
      </div>}
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden ring-1 ring-inset ring-black/5">
        <div className="h-full bg-gray-800 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function toProfessionalSentenceCase(text: string): string {
  if (!text) return text;
  return text
    .split(/([.!?]\s+)/)
    .map((chunk) => {
      if (!chunk || /^[.!?]\s*$/.test(chunk)) return chunk;
      const trimmed = chunk.trimStart();
      if (!trimmed) return chunk;
      return chunk.replace(trimmed, trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
    })
    .join("")
    .replace(/\bscene fit\b/g, "Scene Fit")
    .replace(/\binterruption risk\b/g, "Interruption Risk")
    .replace(/\bbrand safety\b/g, "Brand Safety");
}

/* ── Ad Preview Modal ─────────────────────────────────────── */
function AdPreviewModal({
  ad,
  onClose,
}: {
  ad: AdRankResult;
  onClose: () => void;
}) {
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalHlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = modalVideoRef.current;
    if (!el) return;
    const url = ad.ad.asset_url;
    if (Hls.isSupported() && url.includes(".m3u8")) {
      const hls = new Hls(hlsClientConfig());
      hls.loadSource(url);
      hls.attachMedia(el);
      modalHlsRef.current = hls;
    } else {
      el.src = url;
    }
    el.play().catch(() => {});

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setTime(el.currentTime || 0);
    const onDur = () => setDuration(el.duration || 0);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDur);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDur);
      modalHlsRef.current?.destroy();
      modalHlsRef.current = null;
    };
  }, [ad.ad.asset_url]);

  const togglePlay = () => {
    const el = modalVideoRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else el.play().catch(() => {});
  };

  const seek = (next: number) => {
    const el = modalVideoRef.current;
    if (!el || !duration) return;
    el.currentTime = Math.max(0, Math.min(duration, next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-4xl rounded-2xl border border-border-light bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[1.5px] text-text-tertiary font-semibold">Ad Preview</p>
            <p className="text-sm font-semibold text-text-primary truncate">{ad.ad.proposedTitle || ad.ad.brand}</p>
            <p className="text-[11px] text-text-tertiary truncate">Company: {ad.ad.brand}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="bg-black aspect-video">
          <video
            ref={modalVideoRef}
            className="w-full h-full object-contain"
            playsInline
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            preload="metadata"
          />
        </div>
        <div className="px-5 py-3 border-t border-border-light bg-white">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors">
              {isPlaying ? (
                <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><rect x="3" y="2.5" width="2.3" height="7" rx="0.7" fill="currentColor" /><rect x="6.7" y="2.5" width="2.3" height="7" rx="0.7" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M4 2.8v6.4c0 .5.5.8.9.5l4.6-3.2c.4-.3.4-.8 0-1.1L4.9 2.2A.6.6 0 004 2.8z" fill="currentColor" /></svg>
              )}
            </button>
            <span className="text-[11px] tabular-nums text-text-tertiary w-20">{fmt(time)} / {fmt(duration || 0)}</span>
            <input type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={(e) => seek(parseFloat(e.target.value))} className="flex-1 h-1 accent-gray-900" />
            <select
              value={rate}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                setRate(next);
                if (modalVideoRef.current) modalVideoRef.current.playbackRate = next;
              }}
              className="text-[11px] border border-border-light rounded px-2 py-1 bg-white text-text-secondary"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (modalVideoRef.current) modalVideoRef.current.muted = nextMuted;
              }}
              className="text-[11px] border border-border-light rounded px-2 py-1 bg-white text-text-secondary hover:bg-gray-50"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                setIsMuted(v === 0);
                if (modalVideoRef.current) {
                  modalVideoRef.current.volume = v;
                  modalVideoRef.current.muted = v === 0;
                }
              }}
              className="w-20 h-1 accent-gray-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Viewer Profile Detail Modal ─────────────────────────── */
function ViewerProfileModal({ user, onClose }: { user: MockUser; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-border-light w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-bold text-text-secondary">{user.name.charAt(0)}</div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[1.5px] text-text-tertiary">Viewer profile</p>
              <p className="text-sm font-semibold text-text-primary mt-0.5">{user.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Device", value: user.viewing_context.device_type.toUpperCase() },
              { label: "Daypart", value: user.viewing_context.typical_daypart.replace(/_/g, " ") },
              { label: "Engagement", value: user.engagement_tier },
              { label: "DMA", value: user.dma_region },
            ].map(({ label, value }) => (
              <div key={label} className="px-3 py-2.5 rounded-lg bg-gray-50">
                <p className="text-[10px] text-text-tertiary mb-0.5 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-medium text-text-primary capitalize">{value}</p>
              </div>
            ))}
          </div>
          {[
            { title: "Demographics", items: user.demographics },
            { title: "Interest signals", items: user.interest_signals },
            { title: "Content preferences", items: user.content_preferences },
            { title: "Exclusion categories", items: user.exclusion_categories },
          ].map(({ title, items }) => (
            <div key={title}>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">{title}</p>
              <div className="flex flex-wrap gap-1.5">
                {(items.length ? items : ["---"]).map((d) => (
                  <span key={d} className="px-2 py-1 rounded-full bg-gray-50 border border-border-light text-[11px] text-text-secondary">{d}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Scene Detail Modal ──────────────────────────────────── */
function SceneDetailModal({ segment, index, onClose, onSeek }: { segment: Segment; index: number; onClose: () => void; onSeek: (t: number) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const riskColors: Record<string, string> = { low: "text-green-700 bg-green-50 border-green-200", medium: "text-amber-700 bg-amber-50 border-amber-200", high: "text-red-700 bg-red-50 border-red-200" };
  const severityColors: Record<string, string> = { "floor violation": "text-red-800 bg-red-100", "high risk": "text-red-700 bg-red-50", "medium risk": "text-amber-700 bg-amber-50", "low risk": "text-yellow-700 bg-yellow-50" };
  const breakQualityColors: Record<string, string> = { high: "text-green-700 bg-green-50 border-green-200", medium: "text-amber-700 bg-amber-50 border-amber-200", low: "text-red-700 bg-red-50 border-red-200" };
  const rl = (segment.brand_safety?.risk_level || "").toLowerCase();
  const bq = (segment.ad_break_fitness?.post_segment_break_quality || "").toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-border-light w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-[11px] font-bold shrink-0">{index + 1}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[1.5px] text-text-tertiary">Scene {index + 1}</p>
              <p className="text-sm font-medium text-text-primary leading-tight mt-0.5 truncate">{segment.scene_context}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { onSeek(segment.start_time); onClose(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-medium hover:bg-gray-700 transition-colors">
              <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {fmt(segment.start_time)}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors">
              <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "Start", value: fmt(segment.start_time) }, { label: "End", value: fmt(segment.end_time) }, { label: "Environment", value: segment.environment?.replace(/_/g, " ") }].map(({ label, value }) => (
              <div key={label} className="px-3 py-2.5 rounded-lg bg-gray-50">
                <p className="text-[10px] text-text-tertiary mb-0.5 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-semibold text-text-primary tabular-nums capitalize">{value}</p>
              </div>
            ))}
          </div>
          {segment.cast_present && segment.cast_present.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Cast in Scene</p>
              <div className="flex flex-wrap gap-1.5">{segment.cast_present.map((name) => (<span key={name} className="px-2.5 py-1 rounded-full bg-gray-50 border border-border-light text-[11px] font-medium text-text-primary">{name}</span>))}</div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Emotional Profile</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-border-light text-[11px] font-medium text-text-secondary capitalize">Sentiment: {segment.sentiment}</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-border-light text-[11px] font-medium text-text-secondary capitalize">Tone: {segment.tone}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
              <span>Emotional Intensity</span>
              <IntensityBar value={segment.emotional_intensity} />
              <span className="tabular-nums text-text-primary font-medium">{Math.round(segment.emotional_intensity * 100)}%</span>
            </div>
          </div>
          {segment.brand_safety && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Brand Safety (GARM)</p>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${segment.brand_safety.is_safe ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>{segment.brand_safety.is_safe ? "Safe" : "Flagged"}</span>
                <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${riskColors[rl] || "text-text-secondary bg-gray-50 border-border-light"}`}>Risk: {segment.brand_safety.risk_level}</span>
              </div>
              {segment.brand_safety.garm_flags.length > 0 ? (
                <div className="space-y-1.5">{segment.brand_safety.garm_flags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${severityColors[flag.severity.toLowerCase()] || "bg-gray-100 text-text-secondary"}`}>{flag.severity.replace(/_/g, " ")}</span>
                    <span className="text-text-secondary"><span className="font-medium text-text-primary">{flag.category}:</span> {flag.evidence}</span>
                  </div>
                ))}</div>
              ) : (
                <p className="text-[11px] text-green-700 flex items-center gap-1.5">
                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  No GARM flags detected
                </p>
              )}
            </div>
          )}
          {segment.ad_suitability && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Ad Suitability</p>
              {segment.ad_suitability.confidence !== undefined && (
                <div className="flex items-center gap-3 text-[11px] text-text-tertiary mb-2">
                  <span>Confidence</span>
                  <IntensityBar value={segment.ad_suitability.confidence} color="bg-mb-green-dark" />
                  <span className="tabular-nums text-text-primary font-medium">{Math.round(segment.ad_suitability.confidence * 100)}%</span>
                </div>
              )}
              {segment.ad_suitability.suitable_categories.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-text-tertiary mb-1.5">Suitable</p>
                  <div className="flex flex-wrap gap-1.5">{segment.ad_suitability.suitable_categories.map((cat) => (<span key={cat} className="px-2 py-0.5 rounded-full bg-mb-green-light/20 border border-mb-green-light/50 text-[11px] text-mb-green-dark font-medium">{cat}</span>))}</div>
                </div>
              )}
              {segment.ad_suitability.contextual_themes.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-tertiary mb-1.5">Contextual Themes</p>
                  <div className="flex flex-wrap gap-1.5">{segment.ad_suitability.contextual_themes.map((theme) => (<span key={theme} className="px-2 py-0.5 rounded-full bg-gray-50 border border-border-light text-[11px] text-text-secondary">{theme}</span>))}</div>
                </div>
              )}
            </div>
          )}
          {segment.ad_break_fitness && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-2">Ad Break Fitness</p>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${breakQualityColors[bq] || "text-text-secondary bg-gray-50 border-border-light"}`}>Quality: {segment.ad_break_fitness.post_segment_break_quality}</span>
                <span className="px-2.5 py-1 rounded-full border border-border-light bg-gray-50 text-[11px] text-text-secondary capitalize">{segment.ad_break_fitness.break_type.replace(/_/g, " ")}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-tertiary mb-3">
                <span>Interruption Risk</span>
                <IntensityBar value={segment.ad_break_fitness.interruption_risk} color="bg-amber-500" />
                <span className="tabular-nums text-text-primary font-medium">{Math.round(segment.ad_break_fitness.interruption_risk * 100)}%</span>
              </div>
              {segment.ad_break_fitness.reasoning && (
                <div className="rounded-lg bg-gray-50 border border-border-light px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-1">Break Reasoning</p>
                  <p className="text-[12px] text-text-secondary leading-relaxed">{segment.ad_break_fitness.reasoning}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Safety Mode Info Modal ──────────────────────────────── */
function SafetyModeInfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const modes = [
    {
      key: "strict",
      label: "Strict",
      color: "text-green-700 bg-green-50 border-green-200",
      description: "Most conservative filtering. Ads are only placed in scenes that pass every GARM flag check, have low interruption risk, and explicit suitable-category matches. Prioritises brand safety over revenue. Best for news, family content, or premium advertisers.",
      traits: ["Low interruption risk required", "No GARM flags tolerated", "Explicit category match enforced", "Minimum score floor raised"],
    },
    {
      key: "balanced",
      label: "Balanced",
      color: "text-amber-700 bg-amber-50 border-amber-200",
      description: "Default mode. Balances brand safety with ad revenue. Allows moderate interruption risk and soft category matches. GARM flags are evaluated but medium-risk scenes remain eligible. Suitable for most content types.",
      traits: ["Moderate interruption risk allowed", "Medium GARM risk tolerated", "Soft category matching", "Standard score thresholds"],
    },
    {
      key: "revenue_max",
      label: "Revenue Max",
      color: "text-red-700 bg-red-50 border-red-200",
      description: "Maximises ad break opportunities by relaxing safety constraints. Higher interruption risk scenes become eligible, category matching is looser, and break spacing is tightened. Use only when ad density is the primary objective.",
      traits: ["High interruption risk allowed", "Looser category matching", "Reduced minimum spacing", "More breaks identified"],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-border-light w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div>
            <p className="text-[10px] uppercase tracking-[1.5px] text-text-tertiary font-semibold">Config</p>
            <p className="text-sm font-semibold text-text-primary mt-0.5">Safety Mode</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors"
          >
            <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-text-secondary leading-relaxed">
            Safety mode controls how aggressively the engine filters ad break candidates based on brand safety, interruption risk, and contextual match quality.
          </p>
          {modes.map((m) => (
            <div key={m.key} className={`rounded-xl border px-4 py-3 ${m.color}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${m.color}`}>{m.label}</span>
              </div>
              <p className="text-[12px] leading-relaxed mb-2">{m.description}</p>
              <ul className="space-y-1">
                {m.traits.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[11px]">
                    <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5 shrink-0"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Sentiment dot color ─────────────────────────────────── */
function sentimentDot(sentiment: string) {
  const s = sentiment.toLowerCase();
  const map: Record<string, string> = { positive: "bg-green-400", neutral: "bg-gray-400", negative: "bg-red-400", mixed: "bg-amber-400" };
  return map[s] ?? "bg-gray-300";
}

/* ══════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════ */
export default function VideoInventoryDetailPage() {
  const params = useParams();
  const videoId = params.videoId as string;

  const { videos, loading } = useVideos("tl-context-engine-videos");
  const video = useMemo(() => videos.find((v) => v.id === videoId) || null, [videos, videoId]);

  /* Video player state */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);

  /* Data state */
  const summaryFetchedRef = useRef(false);
  const timelineFetchedRef = useRef(false);
  const adInventoryFetchedRef = useRef(false);
  const [summaryData, setSummaryData] = useState<{ summary?: string; proposedTitle?: string; targetAudience?: string[]; tags?: string[] } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [expandedSegment, setExpandedSegment] = useState<{ seg: Segment; idx: number } | null>(null);

  /* Ad inventory state */
  const [adInventory, setAdInventory] = useState<AdInventoryItem[]>([]);
  const [adInventoryLoading, setAdInventoryLoading] = useState(false);

  /* Embedding state — segment vectors fetched from /api/embeddings */
  const embeddingsFetchedRef = useRef(false);
  const [segmentVectors, setSegmentVectors] = useState<Record<string, number[]>>({});
  const [embeddingsLoading, setEmbeddingsLoading] = useState(false);

  /* Viewer profile */
  const [selectedUserId, setSelectedUserId] = useState("ethan");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const selectedUser = MOCK_USERS.find((u) => u.id === selectedUserId) || MOCK_USERS[0];
  const [profileDetailsUserId, setProfileDetailsUserId] = useState<string | null>(null);

  /* Placement config */
  const [placementConfig, setPlacementConfig] = useState<PlacementConfig>(DEFAULT_PLACEMENT_CONFIG);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);

  /* Ad placement UI state */
  const [selectedBreakIdx, setSelectedBreakIdx] = useState<number>(0);
  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);
  const [showDisqualified, setShowDisqualified] = useState(false);
  const [previewAd, setPreviewAd] = useState<AdRankResult | null>(null);

  /* Main HLS instance ref — persists across renders so URL changes are the only teardown trigger */
  const mainHlsRef = useRef<Hls | null>(null);

  /* Ad playback intercept */
  const adVideoRef = useRef<HTMLVideoElement | null>(null);
  const adHlsRef = useRef<Hls | null>(null);
  const triggeredBreaksRef = useRef<Set<number>>(new Set());
  const [adPlaybackState, setAdPlaybackState] = useState<{
    adUrl: string;
    resumeTime: number;
    breakIdx: number;
    adTitle: string;
    adBrand: string;
    thumbnail?: string;
  } | null>(null);
  const [adTimeRemaining, setAdTimeRemaining] = useState(0);

  /* ── Engine computation (pure, deterministic, instant) ── */

  // Merge TwelveLabs segment vectors into the scene segments so the engine
  // can use cosine similarity for Signal D in computeSceneFit.
  const enrichedSegments = useMemo<Segment[]>(() => {
    if (!segments) return [];
    return segments.map((seg, i) => ({
      ...seg,
      vector: segmentVectors[i] ?? undefined,
    }));
  }, [segments, segmentVectors]);

  const adBreaks = useMemo<AdBreakCandidate[]>(() => {
    if (enrichedSegments.length === 0) return [];
    return identifyAdBreaks(enrichedSegments, placementConfig);
  }, [enrichedSegments, placementConfig]);

  const eligibilityCache = useMemo(() => {
    if (adInventory.length === 0) return {};
    return buildUserEligibilityCache(selectedUser, adInventory);
  }, [selectedUser, adInventory]);

  const adPlan = useMemo<DiversityPlanEntry[]>(() => {
    if (adBreaks.length === 0 || adInventory.length === 0) return [];
    return selectAdsWithDiversity(adBreaks, selectedUser, adInventory, placementConfig, eligibilityCache);
  }, [adBreaks, selectedUser, adInventory, placementConfig, eligibilityCache]);

  // Keep rankedAdsPerBreak as a derived array for backward compat with ad trigger effect
  const rankedAdsPerBreak = useMemo<AdRankResult[][]>(
    () => adPlan.map((p) => p.rankedAds),
    [adPlan]
  );

  const currentPlanEntry = adPlan[selectedBreakIdx] ?? null;
  const currentBreakAds = currentPlanEntry?.rankedAds ?? [];
  const eligibleAds = currentBreakAds.filter((r) => !r.isDisqualified);
  const disqualifiedAds = currentBreakAds.filter((r) => r.isDisqualified);
  const topRankedEligible = eligibleAds[0] ?? null;
  const selectedByDiversity = currentPlanEntry?.selectedAd ?? null;
  const diversityOverrodeTop =
    !!selectedByDiversity &&
    !!topRankedEligible &&
    selectedByDiversity.ad.id !== topRankedEligible.ad.id;

  /* Stable HLS URL — only changes when the actual stream URL changes */
  const hlsUrl = video?.hls?.videoUrl ?? null;

  /* HLS setup — depends only on hlsUrl string, not the full video object */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !hlsUrl) return;

    // Destroy previous instance if URL changed
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
  }, [hlsUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Track playback — only re-binds when video element or segments change, NOT on volume/mute */
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      setVideoTime(el.currentTime);
      const segs = segmentsRef.current;
      if (segs) {
        const idx = segs.findIndex((s) => el.currentTime >= s.start_time && el.currentTime < s.end_time);
        setActiveSegmentIdx(idx >= 0 ? idx : null);
      }
    };
    const onDur = () => setVideoDuration(el.duration);
    const onPlay = () => setIsPlaying(true);
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
  }, [hlsUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Player controls */
  const togglePlay = useCallback(() => { if (!videoRef.current) return; if (isPlaying) videoRef.current.pause(); else videoRef.current.play().catch(() => {}); }, [isPlaying]);
  const seekTo = useCallback((sec: number) => { const el = videoRef.current; if (!el) return; el.currentTime = Math.max(0, sec); el.play().catch(() => {}); }, []);
  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) { const val = parseFloat(e.target.value); setVolume(val); if (val > 0) setIsMuted(false); if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = false; } }
  function toggleMute() { if (!videoRef.current) return; const newMuted = !isMuted; setIsMuted(newMuted); videoRef.current.muted = newMuted; if (newMuted) { videoRef.current.volume = 0; setVolume(0); } else { videoRef.current.volume = 1; setVolume(1); } }
  function changePlaybackRate(rate: number) { setPlaybackRate(rate); setShowSpeedMenu(false); if (videoRef.current) videoRef.current.playbackRate = rate; }
  function toggleFullScreen() { if (!document.fullscreenElement) playerContainerRef.current?.requestFullscreen().catch(() => {}); else document.exitFullscreen(); }
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) { if (!timelineRef.current || !videoDuration) return; const rect = timelineRef.current.getBoundingClientRect(); seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * videoDuration); }
  function handleTimelineHover(e: React.MouseEvent<HTMLDivElement>) { if (!timelineRef.current || !videoDuration) return; const rect = timelineRef.current.getBoundingClientRect(); setHoverTime(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * videoDuration); }

  /* Summary fetch */
  useEffect(() => {
    if (!videoId || summaryFetchedRef.current) return;
    summaryFetchedRef.current = true;
    (async () => {
      setSummaryLoading(true);
      try {
        const res = await fetch("/api/generateVideoSummary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId }) });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        let payload = data;
        if (typeof data?.data === "string") { try { payload = JSON.parse(data.data); } catch { /* use data as-is */ } }
        else if (data?.data && typeof data.data === "object") payload = data.data;
        setSummaryData(payload || null);
      } catch { setSummaryData(null); }
      finally { setSummaryLoading(false); }
    })();
  }, [videoId]);

  /* Timeline + cast fetch */
  useEffect(() => {
    if (!video || timelineFetchedRef.current) return;
    timelineFetchedRef.current = true;
    (async () => {
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const res = await fetch("/api/generateAdPlan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: video.id, videoDuration: video.systemMetadata?.duration || 0 }) });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        let resolved = data;
        if (typeof data?.data === "string") { try { resolved = JSON.parse(data.data); } catch { /* use data as-is */ } }
        else if (data?.data && typeof data.data === "object") resolved = data.data;
        const segs = resolved?.segments || [];
        setSegments(Array.isArray(segs) ? segs : []);
        if (Array.isArray(resolved?.cast)) setCast(resolved.cast);
      } catch { setTimelineError("Could not load scene intelligence data."); setSegments(null); }
      finally { setTimelineLoading(false); }
    })();
  }, [video]);

  /* Ad inventory fetch */
  useEffect(() => {
    if (adInventoryFetchedRef.current) return;
    adInventoryFetchedRef.current = true;
    (async () => {
      setAdInventoryLoading(true);
      try {
        const res = await fetch("/api/adInventory");
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        setAdInventory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Ad inventory fetch failed:", err);
        setAdInventory([]);
      } finally {
        setAdInventoryLoading(false);
      }
    })();
  }, []);

  /* Embeddings fetch — triggers after segments are loaded */
  useEffect(() => {
    if (!segments || segments.length === 0 || !videoId || embeddingsFetchedRef.current) return;
    embeddingsFetchedRef.current = true;
    (async () => {
      setEmbeddingsLoading(true);
      try {
        const res = await fetch(`/api/embeddings?videoId=${videoId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.segments && Object.keys(data.segments).length > 0) {
          // Convert string keys back to numbers for indexing
          const vectors: Record<string, number[]> = {};
          for (const [k, v] of Object.entries(data.segments)) {
            vectors[k] = v as number[];
          }
          setSegmentVectors(vectors);
        }
      } catch (err) {
        console.warn("[embeddings] Fetch failed (non-fatal):", err);
      } finally {
        setEmbeddingsLoading(false);
      }
    })();
  }, [segments, videoId]);

  /* Reset triggered breaks when segment data changes */
  useEffect(() => {
    triggeredBreaksRef.current = new Set();
  }, [segments]);

  /* Ad break trigger — fires every timeupdate, intercepts playback at break timestamps */
  useEffect(() => {
    if (!isPlaying || adPlaybackState !== null || adBreaks.length === 0 || adPlan.length === 0) return;
    for (let i = 0; i < adBreaks.length; i++) {
      const brk = adBreaks[i];
      if (!triggeredBreaksRef.current.has(i) && videoTime >= brk.timestamp && videoTime < brk.timestamp + 3) {
        // Use the diversity-selected ad for this break
        const topAd = adPlan[i]?.selectedAd;
        if (topAd?.ad?.asset_url) {
          videoRef.current?.pause();
          triggeredBreaksRef.current.add(i);
          setAdPlaybackState({
            adUrl: topAd.ad.asset_url,
            resumeTime: brk.timestamp,
            breakIdx: i,
            adTitle: topAd.ad.proposedTitle || topAd.ad.brand,
            adBrand: topAd.ad.brand,
            thumbnail: topAd.ad.thumbnailUrl,
          });
          setSelectedBreakIdx(i);
        }
        break;
      }
    }
  }, [videoTime, isPlaying, adPlaybackState, adBreaks, adPlan]);

  /* Ad load + playback — fires when adPlaybackState becomes non-null */
  useEffect(() => {
    if (!adPlaybackState) return;
    const el = adVideoRef.current;
    if (!el) return;

    const url = adPlaybackState.adUrl;
    // Ads are loaded via native media requests to avoid HLS.js XHR CORS preflight issues
    // from CloudFront streams that do not expose Access-Control-Allow-Origin for localhost.
    adHlsRef.current?.destroy();
    adHlsRef.current = null;
    el.src = url;
    el.load();
    el.play().catch(() => {});

    const onEnded = () => {
      adHlsRef.current?.destroy();
      adHlsRef.current = null;
      setAdPlaybackState(null);
      const mainEl = videoRef.current;
      if (mainEl) {
        mainEl.currentTime = adPlaybackState.resumeTime;
        mainEl.play().catch(() => {});
      }
    };
    const onTimeUpdate = () => {
      if (el.duration && !isNaN(el.duration)) {
        setAdTimeRemaining(Math.max(0, Math.ceil(el.duration - el.currentTime)));
      }
    };

    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      adHlsRef.current?.destroy();
      adHlsRef.current = null;
    };
  }, [adPlaybackState]);

  /* Skip ad */
  const skipAd = useCallback(() => {
    const el = adVideoRef.current;
    if (el) { el.pause(); el.src = ""; }
    adHlsRef.current?.destroy();
    adHlsRef.current = null;
    const resumeTime = adPlaybackState?.resumeTime ?? videoTime;
    setAdPlaybackState(null);
    const mainEl = videoRef.current;
    if (mainEl) {
      mainEl.currentTime = resumeTime;
      mainEl.play().catch(() => {});
    }
  }, [adPlaybackState, videoTime]);

  const filename = video?.systemMetadata?.filename || "Untitled";
  const displayName = filename.replace(/\.[^.]+$/, "");
  const analysisTitle = summaryData?.proposedTitle?.trim() || "Untitled Analysis";
  const duration = video?.systemMetadata?.duration || 0;
  const width = video?.systemMetadata?.width || 0;
  const height = video?.systemMetadata?.height || 0;
  const fps = video?.systemMetadata?.fps || 0;
  const size = video?.systemMetadata?.size;
  const thumbnailUrl = video?.hls?.thumbnailUrls?.[0];
  const progressPct = videoDuration ? (videoTime / videoDuration) * 100 : 0;
  const timelineBase = videoDuration > 0 ? videoDuration : (segments && segments.length > 0 ? (segments[segments.length - 1]?.end_time ?? 0) : 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-border-light px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-text-tertiary mb-2">
              <Link href="/video-inventory" className="hover:text-text-primary transition-colors inline-flex items-center gap-1">
                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Video Inventory
              </Link>
            </div>
            <h1 className="text-[26px] font-bold tracking-[-0.8px] text-text-primary">{analysisTitle}</h1>
            <p className="text-sm text-text-tertiary mt-1">File name: {displayName}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Profile selector */}
            <div className="relative">
              <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-light bg-white text-sm text-text-primary hover:bg-gray-50 transition-colors">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-text-secondary">{selectedUser.name.charAt(0)}</div>
                <span className="font-medium">{selectedUser.name}</span>
                <svg viewBox="0 0 10 6" fill="none" className="w-2.5 h-2.5 text-text-tertiary"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-border-light py-1.5 z-40 overflow-hidden">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Viewer profile (demo)</p>
                    {MOCK_USERS.map((user) => (
                      <div key={user.id} className={`relative w-full px-3 py-2 flex items-center gap-2.5 text-[12px] transition-colors cursor-pointer select-none ${selectedUserId === user.id ? "bg-gray-50 text-text-primary font-medium" : "text-text-secondary hover:bg-gray-50"}`} onClick={() => { setSelectedUserId(user.id); setShowProfileMenu(false); }} role="option" aria-selected={selectedUserId === user.id}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${selectedUserId === user.id ? "bg-gray-900 text-white" : "bg-gray-100 text-text-secondary"}`}>{user.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{user.name}</div>
                          <div className="text-[10px] text-text-tertiary truncate">{user.demographics.slice(0, 2).join(", ") || "No demographics"}</div>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(false); setProfileDetailsUserId(user.id); }} className="w-7 h-7 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors shrink-0" title="View profile details">
                          <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M6 8V6M6 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Config toggle */}
            <button onClick={() => setShowConfigPanel(!showConfigPanel)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showConfigPanel ? "border-gray-900 bg-gray-900 text-white" : "border-border-light bg-white text-text-primary hover:bg-gray-50"}`}>
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M6.5 1.5h3v3l2.1 1.2 2.1-2.1 2.1 2.1-2.1 2.1L15 9.5v3h-3l-1.2 2.1 2.1 2.1-2.1 2.1-2.1-2.1L7.5 18h-3l-1.2-2.1L1.2 18l-2.1-2.1 2.1-2.1L0 12.5v-3h3l1.2-2.1L2.1 5.3l2.1-2.1 2.1 2.1z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(1,0) scale(0.85)" /><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" /></svg>
              Config
            </button>
            <Link
              href={`/video-inventory/${videoId}/generate?user=${selectedUserId}&safetyMode=${placementConfig.safetyMode}&maxBreaks=${placementConfig.maxBreaks}&minSpacingSeconds=${placementConfig.minSpacingSeconds}&minSegmentDuration=${placementConfig.minSegmentDuration}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-900 bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Generate Video
            </Link>
          </div>
        </div>
      </header>

      <main className="px-8 py-6 space-y-8">
        {loading && !video ? (
          <div className="h-[320px] rounded-2xl bg-gray-50 border border-border-light animate-pulse" />
        ) : !video ? (
          <div className="text-sm text-text-secondary">Video not found in this inventory.</div>
        ) : (
          <>
            {/* ── Placement Config Panel ── */}
            {showConfigPanel && (
              <div className="rounded-xl border border-border-light bg-gray-50/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Placement Configuration</h3>
                  <button onClick={() => setShowConfigPanel(false)} className="text-text-tertiary hover:text-text-primary transition-colors">
                    <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Safety Mode</label>
                      <button
                        type="button"
                        onClick={() => setShowSafetyInfo(true)}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors shrink-0"
                        title="Learn about safety modes"
                      >
                        <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5"><path d="M6 8V6M6 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /></svg>
                      </button>
                    </div>
                    <div className="flex rounded-lg border border-border-light overflow-hidden">
                      {(["strict", "balanced", "revenue_max"] as const).map((mode) => (
                        <button key={mode} onClick={() => setPlacementConfig((c) => ({ ...c, safetyMode: mode }))} className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${placementConfig.safetyMode === mode ? "bg-gray-900 text-white" : "bg-white text-text-secondary hover:bg-gray-50"}`}>
                          {mode.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary block mb-1.5">
                      Max Breaks: {placementConfig.maxBreaks}
                    </label>
                    <input type="range" min="1" max="8" value={placementConfig.maxBreaks} onChange={(e) => setPlacementConfig((c) => ({ ...c, maxBreaks: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary block mb-1.5">
                      Min Spacing: {placementConfig.minSpacingSeconds}s
                    </label>
                    <input type="range" min="30" max="600" step="30" value={placementConfig.minSpacingSeconds} onChange={(e) => setPlacementConfig((c) => ({ ...c, minSpacingSeconds: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary block mb-1.5">
                      Min Segment: {placementConfig.minSegmentDuration}s
                    </label>
                    <input type="range" min="10" max="120" step="5" value={placementConfig.minSegmentDuration} onChange={(e) => setPlacementConfig((c) => ({ ...c, minSegmentDuration: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Video + Scene Intelligence side by side ── */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

              {/* Video Player */}
              <div className="xl:col-span-3">
                <div ref={playerContainerRef} className="rounded-2xl overflow-hidden bg-white border border-border-light shadow-sm">
                  <div className="relative aspect-video bg-black" onClick={adPlaybackState ? undefined : togglePlay} style={{ cursor: adPlaybackState ? "default" : "pointer" }}>
                    {/* Main content video */}
                    <video
                      ref={videoRef}
                      playsInline
                      controlsList="nodownload noplaybackrate noremoteplayback"
                      disablePictureInPicture
                      disableRemotePlayback
                      className="w-full h-full object-contain"
                      poster={thumbnailUrl}
                    />

                    {/* Ad video — always mounted so ref is available, hidden when not active */}
                    <video
                      ref={adVideoRef}
                      playsInline
                      controlsList="nodownload noplaybackrate noremoteplayback"
                      disablePictureInPicture
                      disableRemotePlayback
                      className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${adPlaybackState ? "opacity-100 z-20" : "opacity-0 -z-10 pointer-events-none"}`}
                    />

                    {/* Ad UI overlay (badge, title, skip button) */}
                    {adPlaybackState && (
                      <div className="absolute inset-0 z-30 pointer-events-none select-none">
                        {/* Top-left: AD badge + countdown */}
                        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-auto">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-amber-900 uppercase tracking-wider shadow-sm">Ad</span>
                          {adTimeRemaining > 0 && (
                            <span className="text-[11px] text-white/70 tabular-nums font-medium">{adTimeRemaining}s</span>
                          )}
                        </div>
                        {/* Bottom: ad brand + title + skip */}
                        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-end justify-between bg-linear-to-t from-black/70 to-transparent pointer-events-auto">
                          <div className="min-w-0 mr-4">
                            <p className="text-[10px] text-white/50 font-semibold uppercase tracking-widest mb-0.5">{adPlaybackState.adBrand}</p>
                            <p className="text-sm font-semibold text-white leading-tight truncate">{adPlaybackState.adTitle}</p>
                          </div>
                          <button
                            onClick={skipAd}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/30 bg-black/60 text-[11px] text-white font-semibold hover:bg-black/80 transition-colors backdrop-blur-sm"
                          >
                            Skip
                            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2 2l6 4-6 4V2z" fill="currentColor" /><path d="M10 2v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Play button — only when content video is paused and no ad is playing */}
                    {!isPlaying && !adPlaybackState && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-gray-900 ml-1"><path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28a1 1 0 00-1.5.86z" fill="currentColor" /></svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Seekable Timeline with ad break markers */}
                  <div className="px-3 pb-3 pt-2 bg-white border-t border-border-light">
                    <div ref={timelineRef} className="relative h-6 cursor-pointer group/timeline" onClick={handleTimelineClick} onMouseMove={handleTimelineHover} onMouseLeave={() => setHoverTime(null)}>
                      <div className="absolute top-2.5 left-0 right-0 h-1.5 rounded-full bg-gray-100 group-hover/timeline:h-2.5 group-hover/timeline:top-2 transition-all duration-150 ring-1 ring-inset ring-black/5 overflow-hidden">
                        {segments && timelineBase > 0 && segments.map((seg, idx) => {
                          const left = (seg.start_time / timelineBase) * 100;
                          const w = ((seg.end_time - seg.start_time) / timelineBase) * 100;
                          const isActive = activeSegmentIdx === idx;
                          return <div key={idx} className={`absolute top-0 h-full transition-opacity ${isActive ? "opacity-100" : "opacity-40"}`} style={{ left: `${left}%`, width: `${w}%`, backgroundColor: `hsl(${(idx * 47) % 360}, 55%, 60%)` }} />;
                        })}
                        <div className="absolute top-0 left-0 h-full bg-gray-800/30 rounded-full" style={{ width: `${progressPct}%` }} />
                      </div>
                      {/* Ad break diamond markers */}
                      {timelineBase > 0 && adBreaks.map((brk, i) => {
                        const pct = (brk.timestamp / timelineBase) * 100;
                        return (
                          <button key={`brk-${i}`} onClick={(e) => { e.stopPropagation(); setSelectedBreakIdx(i); seekTo(brk.timestamp); }} className="absolute top-0 -translate-x-1/2 z-10 group/brk" style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }} title={`Ad Break ${i + 1} at ${fmt(brk.timestamp)} (score: ${brk.score.toFixed(3)})`}>
                            <div className={`w-4 h-4 rotate-45 rounded-[2px] border transition-all duration-200 ${selectedBreakIdx === i ? "bg-green-500 border-green-400 scale-125 shadow-[0_0_6px_rgba(34,197,94,0.4)]" : "bg-green-400/80 border-green-300/60 hover:bg-green-500 hover:scale-110"}`} />
                          </button>
                        );
                      })}
                      {hoverTime !== null && (
                        <div className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded shadow-sm border border-border-light bg-white text-[10px] font-medium text-text-primary tabular-nums pointer-events-none z-10" style={{ left: `${(hoverTime / (videoDuration || 1)) * 100}%` }}>{fmt(hoverTime)}</div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1 px-0.5">
                      <span className="text-[11px] text-text-tertiary tabular-nums cursor-default">{fmt(videoTime)} / {fmt(duration)}</span>
                      <div className="flex items-center gap-4 text-text-tertiary">
                        <div className="flex items-center gap-2">
                          <button onClick={toggleMute} className="w-5 h-5 flex items-center justify-center hover:text-text-primary transition-colors">
                            {isMuted || volume === 0 ? (
                              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            )}
                          </button>
                          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange} className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800" />
                        </div>
                        <div className="relative">
                          <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="text-[11px] font-semibold px-2 py-0.5 rounded hover:bg-gray-100 transition-colors">{playbackRate}x</button>
                          {showSpeedMenu && (
                            <div className="absolute bottom-full right-0 mb-2 w-20 bg-white rounded-lg shadow-lg border border-border-light py-1 z-50 overflow-hidden">
                              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (<button key={rate} onClick={() => changePlaybackRate(rate)} className={`w-full text-left px-3 py-1 text-[11px] hover:bg-gray-50 transition-colors ${playbackRate === rate ? "text-gray-900 font-semibold bg-gray-50" : "text-text-secondary"}`}>{rate}x</button>))}
                            </div>
                          )}
                        </div>
                        <button onClick={toggleFullScreen} className="w-5 h-5 flex items-center justify-center hover:text-text-primary transition-colors">
                          <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary + file details below player */}
                <div className="mt-4 space-y-4">
                  {summaryData && !summaryLoading && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Summary</p>
                      <p className="text-sm text-text-secondary leading-relaxed">{summaryData.summary}</p>
                      {summaryData.targetAudience && summaryData.targetAudience.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary mb-1.5">Target Audience</p>
                          <div className="flex flex-wrap gap-2">{summaryData.targetAudience.map((aud) => (<span key={aud} className="px-2 py-0.5 rounded-full bg-gray-50 border border-border-light text-[11px] text-text-secondary">{aud}</span>))}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {summaryLoading && (<div className="space-y-1.5 animate-pulse"><div className="h-3 w-32 bg-gray-100 rounded-full" /><div className="h-3.5 w-full bg-gray-100 rounded-full" /><div className="h-3.5 w-4/5 bg-gray-100 rounded-full" /></div>)}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Duration", value: duration ? fmt(duration) : "---" },
                      { label: "Resolution", value: width && height ? `${width}x${height}` : "---" },
                      { label: "Frame Rate", value: fps ? `${Math.round(fps)} fps` : "---" },
                      { label: "File Size", value: fmtSize(size) },
                    ].map(({ label, value }) => (
                      <div key={label} className="px-3 py-2.5 rounded-lg bg-gray-50">
                        <p className="text-[10px] text-text-tertiary mb-0.5">{label}</p>
                        <p className="text-sm font-medium text-text-primary">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Scene Intelligence Panel ── */}
              <div className="xl:col-span-2">
                <div className="rounded-2xl border border-border-light bg-white overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-border-light bg-gray-50/60">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Scene Intelligence Extraction</h2>
                        {segments && (<p className="text-[11px] text-text-tertiary mt-0.5">{segments.length} scene{segments.length !== 1 ? "s" : ""} detected{adBreaks.length > 0 ? ` / ${adBreaks.length} ad break${adBreaks.length !== 1 ? "s" : ""}` : ""}</p>)}
                      </div>
                      {timelineLoading && (<div className="flex items-center gap-1.5 text-[11px] text-text-tertiary"><div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />Analyzing</div>)}
                    </div>
                    {/* Mini segment timeline with ad break markers */}
                    {segments && segments.length > 0 && timelineBase > 0 && (
                      <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-visible relative">
                        {segments.map((seg, idx) => {
                          const left = (seg.start_time / timelineBase) * 100;
                          const w = ((seg.end_time - seg.start_time) / timelineBase) * 100;
                          const isActive = activeSegmentIdx === idx;
                          return <button key={idx} type="button" onClick={() => seekTo(seg.start_time)} className="absolute top-0 h-full transition-opacity hover:opacity-100" style={{ left: `${left}%`, width: `${Math.max(0.5, w)}%`, opacity: isActive ? 1 : 0.5, backgroundColor: `hsl(${(idx * 47) % 360}, 55%, 60%)` }} title={`${fmt(seg.start_time)} - ${fmt(seg.end_time)}`} />;
                        })}
                        {adBreaks.map((brk, i) => {
                          const pct = (brk.timestamp / timelineBase) * 100;
                          return <div key={`mini-brk-${i}`} className="absolute -top-1 w-2 h-2 rotate-45 bg-green-500 border border-green-400 rounded-[1px] -translate-x-1/2 z-10" style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }} title={`Break ${i + 1}`} />;
                        })}
                      </div>
                    )}
                  </div>

                  {/* Scene list */}
                  <div className="divide-y divide-border-light max-h-[calc(100vh-260px)] overflow-y-auto">
                    {timelineLoading && (<div className="p-4 space-y-3 animate-pulse">{[1, 2, 3, 4].map((i) => (<div key={i} className="space-y-2"><div className="h-3 w-20 bg-gray-100 rounded-full" /><div className="h-4 w-full bg-gray-100 rounded-lg" /><div className="h-4 w-3/4 bg-gray-100 rounded-lg" /></div>))}</div>)}
                    {timelineError && (<div className="px-4 py-6 text-center"><p className="text-[11px] text-red-600">{timelineError}</p></div>)}
                    {!timelineLoading && !timelineError && segments && segments.length === 0 && (<div className="px-4 py-6 text-center"><p className="text-[11px] text-text-tertiary">No scenes found.</p></div>)}

                    {!timelineLoading && segments && segments.map((seg, idx) => {
                      const isActive = activeSegmentIdx === idx;
                      const hue = (idx * 47) % 360;
                      const bq = (seg.ad_break_fitness?.post_segment_break_quality || "").toLowerCase();
                      const breakAtThisSegment = adBreaks.find((b) => b.segmentIndex === idx);
                      return (
                        <div key={idx}>
                          <div className={`group relative transition-colors ${isActive ? "bg-gray-50/80" : "bg-white hover:bg-gray-50/50"}`}>
                            <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} style={{ backgroundColor: `hsl(${hue}, 55%, 55%)` }} />
                            <div className="px-4 py-3.5 pl-5">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: `hsl(${hue}, 55%, 55%)` }}>{idx + 1}</div>
                                  <button onClick={() => seekTo(seg.start_time)} className="text-[11px] text-text-tertiary font-medium tabular-nums hover:text-text-primary transition-colors flex items-center gap-1" title="Jump to scene">
                                    {fmt(seg.start_time)} - {fmt(seg.end_time)}
                                    <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity"><path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  </button>
                                </div>
                                <button onClick={() => setExpandedSegment({ seg, idx })} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-lg border border-border-light bg-white text-[10px] text-text-tertiary hover:text-text-primary hover:border-gray-300 hover:shadow-sm transition-all">
                                  <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M1 1h3.5M1 1v3.5M11 1H7.5M11 1v3.5M1 11h3.5M1 11V7.5M11 11H7.5M11 11V7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  Details
                                </button>
                              </div>
                              <p className="text-[12px] text-text-primary leading-snug mb-2">{seg.scene_context}</p>
                              {seg.cast_present && seg.cast_present.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1.5">{seg.cast_present.slice(0, 4).map((name) => (<span key={name} className="text-[10px] text-text-tertiary">{name}</span>))}{seg.cast_present.length > 4 && (<span className="text-[10px] text-text-tertiary">+{seg.cast_present.length - 4}</span>)}</div>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="flex items-center gap-1 text-[10px] text-text-tertiary"><span className={`w-1.5 h-1.5 rounded-full ${sentimentDot(seg.sentiment)}`} />{seg.sentiment}</span>
                                <span className="text-[10px] text-text-tertiary/50">.</span>
                                <span className="text-[10px] text-text-tertiary capitalize">{seg.tone}</span>
                                {seg.environment && (<><span className="text-[10px] text-text-tertiary/50">.</span><span className="text-[10px] text-text-tertiary capitalize">{seg.environment.replace(/_/g, " ")}</span></>)}
                                {seg.ad_break_fitness && (
                                  <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${bq === "high" ? "text-green-700 bg-green-50" : bq === "medium" ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"}`}>
                                    {seg.ad_break_fitness.post_segment_break_quality} break
                                  </span>
                                )}
                              </div>
                              {seg.ad_suitability?.suitable_categories && seg.ad_suitability.suitable_categories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">{seg.ad_suitability.suitable_categories.slice(0, 3).map((cat) => (<span key={cat} className="px-1.5 py-0.5 rounded text-[10px] bg-mb-green-light/20 text-mb-green-dark border border-mb-green-light/40">{cat}</span>))}{seg.ad_suitability.suitable_categories.length > 3 && (<span className="text-[10px] text-text-tertiary px-1 py-0.5">+{seg.ad_suitability.suitable_categories.length - 3}</span>)}</div>
                              )}
                            </div>
                          </div>
                          {/* Ad break indicator between segments */}
                          {breakAtThisSegment && (
                            <button onClick={() => { const brkIdx = adBreaks.indexOf(breakAtThisSegment); setSelectedBreakIdx(brkIdx); }} className={`w-full flex items-center gap-2 px-5 py-2 border-y border-green-200/60 transition-colors ${adBreaks.indexOf(breakAtThisSegment) === selectedBreakIdx ? "bg-green-50" : "bg-green-50/40 hover:bg-green-50"}`}>
                              <div className="w-3 h-3 rotate-45 bg-green-500 rounded-[2px] shrink-0" />
                              <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Ad Break {adBreaks.indexOf(breakAtThisSegment) + 1}</span>
                              <span className="text-[10px] text-green-600 tabular-nums">{fmt(breakAtThisSegment.timestamp)}</span>
                              <span className="text-[10px] text-green-600/60 ml-auto">Score: {breakAtThisSegment.score.toFixed(3)}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════
               Ad Placement Panel
               ══════════════════════════════════════════════════════ */}
            {adBreaks.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">Contextual Ad Placements</h2>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {adBreaks.length} break{adBreaks.length !== 1 ? "s" : ""} identified / {adInventory.length} ad{adInventory.length !== 1 ? "s" : ""} in inventory / Viewing as <span className="font-medium text-text-primary">{selectedUser.name}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {adInventoryLoading && (
                      <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                        <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
                        Loading ads
                      </div>
                    )}
                    {embeddingsLoading && (
                      <div className="flex items-center gap-1.5 text-[11px] text-indigo-600">
                        <div className="w-3 h-3 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                        Fetching embeddings
                      </div>
                    )}
                  </div>
                </div>

                {/* Break selector strip */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                  {adBreaks.map((brk, i) => {
                    const planEntry = adPlan[i];
                    const selectedAd = planEntry?.selectedAd;
                    const sceneFit = selectedAd?.scores.sceneFit ?? 0;
                    return (
                      <button key={i} onClick={() => { setSelectedBreakIdx(i); setExpandedAdId(null); }} className={`shrink-0 px-4 py-2.5 rounded-xl border transition-all ${selectedBreakIdx === i ? "border-green-500 bg-green-50 shadow-sm" : "border-border-light bg-white hover:bg-gray-50"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2.5 h-2.5 rotate-45 bg-green-500 rounded-[1px]" />
                          <span className="text-[11px] font-semibold text-text-primary">Break {i + 1}</span>
                        </div>
                        <div className="text-[10px] text-text-tertiary tabular-nums">{fmt(brk.timestamp)}</div>
                        {selectedAd && (
                          <div className="mt-1 space-y-0.5">
                            <div className="text-[10px] text-green-700 font-medium truncate max-w-[140px]">{selectedAd.ad.brand}</div>
                            <div className="flex items-center gap-1">
                              <div className="h-0.5 rounded-full bg-gray-200 flex-1 overflow-hidden">
                                <div className={`h-full rounded-full ${sceneFit >= 0.6 ? "bg-green-500" : sceneFit >= 0.35 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${sceneFit * 100}%` }} />
                              </div>
                              <span className="text-[9px] text-text-tertiary tabular-nums">{(sceneFit * 100).toFixed(0)}% fit</span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Ranked ads for selected break */}
                {adBreaks[selectedBreakIdx] && (
                  <div className="rounded-2xl border border-border-light overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50/60 border-b border-border-light">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Break {selectedBreakIdx + 1} at {fmt(adBreaks[selectedBreakIdx].timestamp)}</span>
                          <span className="text-[10px] text-text-tertiary ml-3">
                            {eligibleAds.length} eligible / {disqualifiedAds.length} disqualified
                          </span>
                        </div>
                        <div className="text-right shrink-0 text-[10px] text-text-tertiary space-y-0.5">
                          <div>Scene: <span className="text-text-primary font-medium">{adBreaks[selectedBreakIdx].precedingSegment.sentiment} / {adBreaks[selectedBreakIdx].precedingSegment.tone}</span></div>
                          <div>Environment: <span className="text-text-primary font-medium capitalize">{adBreaks[selectedBreakIdx].precedingSegment.environment || "—"}</span></div>
                        </div>
                      </div>
                      {currentPlanEntry?.diversityApplied && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-amber-700">Diversity Selection</p>
                          {diversityOverrodeTop ? (
                            <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                              Selected by diversity: <span className="font-semibold">{selectedByDiversity?.ad.proposedTitle || selectedByDiversity?.ad.brand}</span>
                              {" "}({selectedByDiversity?.ad.brand}) instead of top-ranked{" "}
                              <span className="font-semibold">{topRankedEligible?.ad.proposedTitle || topRankedEligible?.ad.brand}</span>
                              {" "}to avoid repetition.
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                              Diversity rules evaluated, and the top-ranked ad remained eligible.
                            </p>
                          )}
                          {currentPlanEntry.diversityReason && (
                            <p className="text-[10px] text-amber-700/90 mt-1">{currentPlanEntry.diversityReason}</p>
                          )}
                          {selectedByDiversity?.ad?.asset_url && (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="rounded-md border border-amber-200 bg-white/70 p-2">
                                <p className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold mb-1">Selected Ad</p>
                                <div className="rounded bg-black overflow-hidden h-36">
                                  <video
                                    className="w-full h-full object-cover"
                                    src={selectedByDiversity.ad.asset_url}
                                    controls
                                    controlsList="nodownload noplaybackrate noremoteplayback"
                                    disablePictureInPicture
                                    disableRemotePlayback
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                </div>
                                <p className="text-[10px] text-amber-900 mt-1 truncate">{selectedByDiversity.ad.proposedTitle || selectedByDiversity.ad.brand}</p>
                              </div>
                              {diversityOverrodeTop && topRankedEligible?.ad?.asset_url && (
                                <div className="rounded-md border border-amber-200 bg-white/70 p-2">
                                  <p className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold mb-1">Top Ranked (Suppressed)</p>
                                  <div className="rounded bg-black overflow-hidden h-36">
                                    <video
                                      className="w-full h-full object-cover"
                                      src={topRankedEligible.ad.asset_url}
                                      controls
                                      controlsList="nodownload noplaybackrate noremoteplayback"
                                      disablePictureInPicture
                                      disableRemotePlayback
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  </div>
                                  <p className="text-[10px] text-amber-900 mt-1 truncate">{topRankedEligible.ad.proposedTitle || topRankedEligible.ad.brand}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="divide-y divide-border-light">
                      {eligibleAds.length === 0 && !adInventoryLoading && (
                        <div className="px-5 py-8 text-center">
                          <p className="text-[11px] text-text-tertiary">No eligible ads for this break position.</p>
                        </div>
                      )}
                      {eligibleAds.slice(0, 5).map((result, rank) => {
                        const isExpanded = expandedAdId === result.ad.id;
                        const isSelectedByDiversity = currentPlanEntry?.selectedAd?.ad.id === result.ad.id;
                        return (
                          <div key={result.ad.id} className={`${isSelectedByDiversity ? "bg-green-50/30" : "bg-white"}`}>
                            <div className="px-5 py-3.5 flex items-start gap-4">
                              {/* Rank badge */}
                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${rank === 0 ? "bg-gray-900 text-white" : rank === 1 ? "bg-gray-700 text-white" : "bg-gray-200 text-text-primary"}`}>
                                  {rank + 1}
                                </div>
                                {isSelectedByDiversity && (
                                  <span className="text-[8px] text-green-700 font-bold uppercase tracking-wide">Selected</span>
                                )}
                              </div>

                              {/* Thumbnail */}
                              {result.ad.thumbnailUrl && (
                                <div className="w-16 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                  <img src={result.ad.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                              )}

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[12px] font-semibold text-text-primary truncate">
                                    {result.ad.proposedTitle || result.ad.brand}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-text-tertiary uppercase shrink-0">{result.ad.category_key.replace(/_/g, " ")}</span>
                                </div>
                                <p className="text-[10px] text-text-tertiary mb-0.5 truncate">Company: {result.ad.brand}</p>
                                <p className="text-[11px] text-text-secondary leading-snug">{toProfessionalSentenceCase(result.matchExplanation)}</p>
                              </div>

                              {/* Score */}
                              <div className="text-right shrink-0">
                                <div className={`text-lg font-black tabular-nums ${result.totalScore >= 0.5 ? "text-green-600" : result.totalScore >= 0.3 ? "text-amber-600" : "text-text-primary"}`}>
                                  {(result.totalScore * 100).toFixed(0)}
                                </div>
                                <div className="text-[9px] text-text-tertiary uppercase tracking-wider">Score</div>
                                <button
                                  type="button"
                                  onClick={() => setPreviewAd(result)}
                                  className="mt-1.5 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] font-semibold hover:bg-gray-700 transition-colors inline-flex items-center gap-1"
                                >
                                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                                    <path d="M4 3v6l5-3-5-3z" fill="currentColor" />
                                  </svg>
                                  View Ad
                                </button>
                              </div>

                              {/* Expand button */}
                              <button onClick={() => setExpandedAdId(isExpanded ? null : result.ad.id)} className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-gray-100 transition-colors shrink-0 mt-1">
                                <svg viewBox="0 0 10 6" fill="none" className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </button>
                            </div>

                            {/* Expanded signal chain */}
                            {isExpanded && (
                              <div className="px-5 pb-4 pt-0">
                                <div className="rounded-xl bg-gray-50 border border-border-light p-4 space-y-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-text-tertiary">Signal Chain</p>

                                  {/* ── User Match ─────────────────────── */}
                                  <div className={`rounded-lg px-3 py-2.5 ${result.scores.adAffinity >= 0.7 ? "bg-green-50 ring-1 ring-green-200" : result.scores.adAffinity >= 0.4 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-gray-50 ring-1 ring-gray-200"}`}>
                                    <ScoreBar value={result.scores.adAffinity} label="User Match" />
                                    <p className="text-[9px] text-text-tertiary mt-1 mb-1.5">Pre-calculated: category affinity + demographics + viewing context</p>
                                    {result.signalChain.eligibilityReasoning.length > 0 && (
                                      <ul className="space-y-0.5">
                                        {result.signalChain.eligibilityReasoning.filter(r => !r.startsWith("EXCLUDED")).slice(0, 4).map((r, ri) => (
                                          <li key={ri} className="text-[9px] text-text-tertiary leading-tight">{r}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>

                                  {/* ── Scene Fit ──────────────────────── */}
                                  <div className={`rounded-lg px-3 py-2.5 ${result.scores.sceneFit >= 0.5 ? "bg-green-50 ring-1 ring-green-200" : result.scores.sceneFit >= 0.3 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-red-50 ring-1 ring-red-200"}`}>
                                    <ScoreBar value={result.scores.sceneFit} label="Scene Fit ×" />
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                                      <ScoreBar value={result.scores.contextMatch} label="Vector match (60%)" />
                                      <ScoreBar value={result.scores.toneCompat} label="Tone compat (10%)" />
                                      <ScoreBar value={result.scores.environmentFit} label="Environment (15%)" />
                                      <ScoreBar value={result.scores.suitableMatch} label="Category (15%)" />
                                    </div>
                                    {/* Vector similarity readout */}
                                    <div className="mt-2 pt-2 border-t border-black/5">
                                      {result.signalChain.vectorsAvailable ? (
                                        <div className="flex items-center gap-2">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-indigo-100 border border-indigo-300 text-[9px] font-medium text-indigo-800">
                                            <svg viewBox="0 0 8 8" fill="none" className="w-2 h-2"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1"/><path d="M4 2v2l1.5 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                                            Vector Similarity
                                          </span>
                                          <span className="text-[9px] text-text-tertiary">
                                            Cosine sim: <span className="font-semibold text-text-primary tabular-nums">
                                              {result.signalChain.vectorSimilarity !== null
                                                ? result.signalChain.vectorSimilarity.toFixed(4)
                                                : "—"}
                                            </span>
                                            {" "}→ normalized: <span className="font-semibold text-text-primary tabular-nums">{result.scores.contextMatch.toFixed(3)}</span>
                                          </span>
                                        </div>
                                      ) : (
                                        <p className="text-[9px] text-text-tertiary italic flex items-center gap-1.5">
                                          {embeddingsLoading
                                            ? <>
                                                <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" /></svg>
                                                Loading TwelveLabs embeddings…
                                              </>
                                            : "Embeddings unavailable — refresh /api/videos to generate"}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* ── Formula ─────────────────────────── */}
                                  <p className="text-[9px] text-text-tertiary tabular-nums">
                                    {result.scores.adAffinity.toFixed(2)} (user) × {result.scores.sceneFit.toFixed(2)} (scene) = <span className="font-bold text-text-primary">{result.totalScore.toFixed(3)}</span>
                                  </p>

                                  {/* ── Gate Results ─────────────────────── */}
                                  <div>
                                    <p className="text-[10px] text-text-tertiary mb-1">Eligibility Gates</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {result.signalChain.gateResults.map((g) => (
                                        <span key={g.gate} className={`px-2 py-0.5 rounded text-[10px] font-medium ${g.passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} title={g.reason || ""}>
                                          {g.passed ? "Pass" : "Fail"}: {g.gate}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* ── Scene metadata ───────────────────── */}
                                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                                    <div><span className="text-text-tertiary">Scene: </span><span className="text-text-primary">{result.signalChain.segmentSentiment} / {result.signalChain.segmentTone}</span></div>
                                    <div><span className="text-text-tertiary">Environment: </span><span className="text-text-primary capitalize">{result.signalChain.segmentEnvironment.replace(/_/g, " ") || "—"}</span></div>
                                    <div><span className="text-text-tertiary">Brand safety: </span><span className={result.signalChain.brandSafetyStatus ? "text-green-700" : "text-red-700"}>{result.signalChain.brandSafetyStatus ? "Safe" : "Flagged"} ({result.signalChain.riskLevel})</span></div>
                                    {result.signalChain.segmentThemes.length > 0 && (
                                      <div><span className="text-text-tertiary">Themes: </span><span className="text-text-primary">{result.signalChain.segmentThemes.slice(0, 2).join(", ")}</span></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Disqualified ads section */}
                    {disqualifiedAds.length > 0 && (
                      <div className="border-t border-border-light">
                        <button onClick={() => setShowDisqualified(!showDisqualified)} className="w-full px-5 py-2.5 flex items-center justify-between text-[11px] text-text-tertiary hover:bg-gray-50 transition-colors">
                          <span className="font-semibold">{disqualifiedAds.length} Disqualified Ad{disqualifiedAds.length !== 1 ? "s" : ""}</span>
                          <svg viewBox="0 0 10 6" fill="none" className={`w-3 h-3 transition-transform ${showDisqualified ? "rotate-180" : ""}`}><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        {showDisqualified && (
                          <div className="divide-y divide-border-light">
                            {disqualifiedAds.map((result) => (
                              <div key={result.ad.id} className="px-5 py-3 flex items-center gap-3 bg-red-50/30">
                                <div className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center shrink-0">
                                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[11px] font-medium text-text-primary">{result.ad.brand}</span>
                                  <span className="text-[10px] text-text-tertiary ml-2">{result.ad.category_key.replace(/_/g, " ")}</span>
                                </div>
                                <div className="text-[10px] text-red-600 max-w-[300px] truncate">{result.disqualificationReasons[0]}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Loading state for ad placement engine */}
            {segments && segments.length > 0 && adBreaks.length === 0 && !timelineLoading && (
              <div className="rounded-xl border border-border-light bg-gray-50/60 px-5 py-8 text-center">
                {adInventoryLoading ? (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-text-tertiary">
                    <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
                    Loading ad inventory...
                  </div>
                ) : (
                  <p className="text-[11px] text-text-tertiary">
                    No suitable ad break positions found with current configuration. Try adjusting the safety mode or reducing minimum spacing.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {expandedSegment && (
        <SceneDetailModal segment={expandedSegment.seg} index={expandedSegment.idx} onClose={() => setExpandedSegment(null)} onSeek={seekTo} />
      )}

      {profileDetailsUserId && (
        <ViewerProfileModal user={MOCK_USERS.find((u) => u.id === profileDetailsUserId) || selectedUser} onClose={() => setProfileDetailsUserId(null)} />
      )}

      {previewAd && (
        <AdPreviewModal ad={previewAd} onClose={() => setPreviewAd(null)} />
      )}

      {showSafetyInfo && (
        <SafetyModeInfoModal onClose={() => setShowSafetyInfo(false)} />
      )}
    </div>
  );
}
