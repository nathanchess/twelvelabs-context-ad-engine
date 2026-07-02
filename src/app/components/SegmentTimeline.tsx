import React from "react";

type Segment = {
  start_time: number;
  end_time: number;
  scene_context: string;
  environment: string;
  sentiment: string;
  emotional_intensity: number;
  tone: string;
  ad_suitability?: {
    suitable_categories: string[];
    contextual_themes: string[];
  };
};

interface SegmentTimelineProps {
  segments: Segment[];
  onSeek?: (time: number) => void;
}

export function SegmentTimeline({ segments, onSeek }: SegmentTimelineProps) {
  if (!segments || segments.length === 0) {
    return null;
  }

  const totalDuration =
    segments[segments.length - 1]?.end_time ?? segments[0].end_time ?? 0;

  return (
    <section className="max-w-4xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[1.5px] text-foreground-muted">
          Timeline segments
        </h2>
        <p className="text-[11px] text-foreground-muted">
          Click a segment to scrub the player.
        </p>
      </div>

      {/* Simple horizontal timeline */}
      <div className="w-full h-2 rounded-full bg-gray-100 border border-border-secondary overflow-hidden mb-3">
        <div className="flex h-full">
          {segments.map((seg, idx) => {
            const widthPct =
              totalDuration > 0
                ? ((seg.end_time - seg.start_time) / totalDuration) * 100
                : 0;
            return (
              <button
                key={idx}
                type="button"
                className="h-full bg-tl-master-brand-light-green/60 hover:bg-tl-master-brand-dark-green/80 transition-colors"
                style={{ width: `${Math.max(2, widthPct)}%` }}
                onClick={() => onSeek?.(seg.start_time)}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {segments.map((seg, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSeek?.(seg.start_time)}
            className="w-full text-left rounded-xl border border-border-secondary bg-white hover:bg-gray-50 transition-colors px-3 py-2.5 flex items-start gap-3"
          >
            <div className="w-16 text-[11px] text-foreground-muted font-medium shrink-0">
              <div>
                {Math.round(seg.start_time)}s–{Math.round(seg.end_time)}s
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wide">
                {seg.environment}
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[11px] text-foreground-body leading-snug">
                {seg.scene_context}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-foreground-muted">
                <span className="px-2 py-0.5 rounded-full bg-gray-50 border border-border-secondary">
                  Sentiment: {seg.sentiment}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gray-50 border border-border-secondary">
                  Tone: {seg.tone}
                </span>
                {(seg.ad_suitability?.suitable_categories || []).slice(0, 2).map((cat) => (
                  <span
                    key={cat}
                    className="px-2 py-0.5 rounded-full bg-tl-master-brand-light-green/20 border border-tl-master-brand-light-green/50 text-tl-master-brand-dark-green"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

