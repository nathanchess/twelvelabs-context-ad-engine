"use client";

/**
 * Dark “terminal” code preview — same shell as the landing page CodeBlock and Databricks SQL preview.
 */
export default function OverviewCodeBlock({
  filename,
  language,
  code,
}: {
  filename: string;
  language: string;
  code: string;
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#1e1e2e] overflow-hidden shadow-xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/2">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <span className="text-[11px] text-[#888] font-mono ml-2">{filename}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-[#666]">{language}</span>
      </div>
      <pre className="px-5 py-4 text-[12px] leading-[1.7] font-mono overflow-x-auto overflow-y-auto max-h-[min(52vh,420px)] text-[#e1e1e1] whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
