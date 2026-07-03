"use client";

import { useEffect, useState } from "react";
import { highlightCode } from "../lib/syntaxHighlight";

/**
 * Dark code preview with VS Code Dark+ syntax highlighting (Shiki).
 */
export default function OverviewCodeBlock({
  filename,
  language,
  code,
  maxHeightClass = "max-h-[min(52vh,420px)]",
}: {
  filename: string;
  language: string;
  code: string;
  maxHeightClass?: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    highlightCode(code, language)
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html);
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="syntax-code-block rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] overflow-hidden shadow-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex gap-1.5" aria-hidden>
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-[11px] text-[#888] font-tl-mono ml-2 truncate">{filename}</span>
        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[#666]">
          {language}
        </span>
      </div>

      {highlightedHtml ? (
        <div
          className={`syntax-code-block__body overflow-x-auto overflow-y-auto ${maxHeightClass}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre
          className={`px-5 py-4 text-[12.5px] leading-[1.7] font-tl-mono overflow-x-auto overflow-y-auto ${maxHeightClass} text-[#d4d4d4] whitespace-pre`}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
