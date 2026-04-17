"use client";

/* ── Divider ────────────────────────────────────────────── */
function Divider() {
  return (
    <div className="my-12 flex items-center gap-4 max-w-[1200px] mx-auto px-8">
      <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, #E5E7EB, transparent)" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/TwelveLabs-Symbol.png" alt="" className="w-6 h-6 rounded opacity-40" />
      <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, #E5E7EB, transparent)" }} />
    </div>
  );
}

/* ── Code block ─────────────────────────────────────────── */
function CodeBlock({ filename, language, code }: { filename: string; language: string; code: string }) {
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
      <pre className="px-5 py-4 text-[12.5px] leading-[1.7] font-mono overflow-x-auto text-[#e1e1e1] whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ── Feature card ───────────────────────────────────────── */
function FeatureCard({ title, description, icon, iconBg }: { title: string; description: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <div className="p-6 rounded-2xl border border-[#E5E7EB] bg-white hover:border-gray-300 transition-all duration-200 hover:shadow-sm">
      <div className={`inline-flex p-2.5 rounded-xl mb-4 ${iconBg}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 text-[15px] mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

/* ── Code snippets ──────────────────────────────────────── */
const snippets = [
  {
    step: "1",
    title: "Scene Analysis with Pegasus",
    description:
      "Every video is analyzed by TwelveLabs' Pegasus model to produce structured, time-stamped scene metadata — sentiment, tone, environment, suitable ad categories, and GARM brand-safety flags.",
    filename: "api/analyze/route.js",
    language: "javascript",
    code: `const res = await tl_client.generate.text(videoId, {
  prompt: \`Analyze each scene segment and return JSON with:
  - scene_context, sentiment, tone, environment
  - ad_suitability: { suitable_categories, unsuitable_categories }
  - brand_safety: { garm_flags, risk_level }
  - ad_break_fitness: { interruption_risk, break_quality, score }
  Return a complete JSON array over the full timeline.\`
});

// Cached to Vercel Blob for instant re-use
await put(\`analysis_v3_\${videoId}.json\`, JSON.stringify(parsed));`,
  },
  {
    step: "2",
    title: "Marengo Vector Embeddings",
    description:
      "TwelveLabs' Marengo model generates 512-dimensional embeddings for both video segments and ad creatives. Cosine similarity between these vectors provides scene-to-ad semantic matching that keyword matching cannot achieve.",
    filename: "api/embeddings/route.js — adPlacementEngine.ts",
    language: "typescript",
    code: `// Cosine similarity between ad creative and scene segment vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; nA += a[i] ** 2; nB += b[i] ** 2;
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// Stretch tight cosine range [0.35–0.75] → full [0–1] scale
const rawSim = cosineSimilarity(ad.vector, segment.vector);
const SIM_MIN = 0.35, SIM_MAX = 0.75;
let contextMatch = (rawSim - SIM_MIN) / (SIM_MAX - SIM_MIN);
contextMatch = Math.pow(Math.max(0, Math.min(1, contextMatch)), 1.5);`,
  },
  {
    step: "3",
    title: "Two-Stage Multiplicative Scoring",
    description:
      "Ads are ranked using a two-stage formula: scene fit multiplied by user affinity. Scene fit acts as a gate — even a viewer's favourite ad category scores near zero in the wrong scene.",
    filename: "lib/adPlacementEngine.ts",
    language: "typescript",
    code: `// Stage 1 — sceneFit: does this ad BELONG in this scene?
const sceneFit =
  suitableMatch  * 0.15 +  // Pegasus suitable_categories hit
  environmentFit * 0.15 +  // Environment × category affinity table
  toneCompat     * 0.10 +  // Emotional tone compatibility
  contextMatch   * 0.60;   // Marengo vector similarity (dominant)

// Stage 2 — adAffinity: pre-computed user → ad category score
const totalScore = adAffinity * sceneFit;

// Diversity: no ad wins twice; category cap = ceil(breaks / 2)
return selectAdsWithDiversity(ranked, plan, config);`,
  },
  {
    step: "4",
    title: "Databricks Delta Lake Export",
    description:
      "Ad metadata and clip-averaged Marengo vectors are exported to a Databricks Delta table via a single POST request. The marengo_embedding_json column holds a JSON float array ready for Mosaic AI Vector Search indexing.",
    filename: "api/databricks/export/route.js — lib/databricksExportSql.ts",
    language: "sql",
    code: `-- Generated by buildAdMetadataExportSql()
-- Target: main.default.ad_metadata_premium_spirits
-- marengo_embedding_json: JSON float[] — cast with
--   from_json(marengo_embedding_json, 'array<double>') for Vector Search
CREATE OR REPLACE TABLE \`main\`.\`default\`.\`ad_metadata_premium_spirits\` AS
SELECT * FROM VALUES
  ('grey_goose_30s.mp4', 'Grey Goose — The Art of Enjoyment', 30,
   '["Bar scene","Cocktail","Celebration"]',
   '["Adults","HHI $100K+"]', '["Underage"]',
   '{"highPriority":["Luxury","Premium Spirits"]}',
   '["Children programming","Violence"]', '[]',
   '[0.021,-0.034,0.119,...]', 512, 'twelvelabs_marengo',
   'embedded_marengo_clip_avg')
AS v(creative_id, campaign_name, duration_sec, extracted_visual_contexts,
     target_demographics, negative_demographics, target_audience_affinity,
     negative_campaign_contexts, brand_safety_garm, marengo_embedding_json,
     embedding_dim, embedding_model, vector_sync_status);`,
  },
];

/* ── Why TwelveLabs rows ────────────────────────────────── */
const whyRows = [
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M9 11.5h5M11.5 9v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
    ),
    name: "Marengo 3.0 — Multimodal Embeddings",
    description:
      "State-of-the-art video representation model that encodes visual, audio, and textual content into a unified 512-dimensional vector space. Powers semantic scene matching in this engine.",
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><path d="M2 13l4-8 3 5 2-3 3 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    ),
    name: "Pegasus 1.2 — Generative Video Understanding",
    description:
      "Generates structured scene metadata (sentiment, tone, environment, GARM flags, suitable ad categories) with frame-level accuracy — the foundation of every ad break decision.",
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" /></svg>
    ),
    name: "Enterprise-Grade Infrastructure",
    description:
      "SOC 2 compliant, built for scale. Process thousands of hours of video via a simple REST API with consistent, predictable pricing and 99.9% uptime.",
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    ),
    name: "Research-Backed Innovation",
    description:
      "TwelveLabs' research team continuously improves model accuracy across visual, audio, and textual modalities — improving ad relevance with every model release.",
  },
];

/* ── Gradient constants ─────────────────────────────────── */
const GRAD = "linear-gradient(135deg, #D9F99D 0%, #FDE047 100%)";
const GRAD_WASH = "linear-gradient(135deg, rgba(217,249,157,0.15) 0%, rgba(253,224,71,0.15) 100%)";

/* ── Page ───────────────────────────────────────────────── */
export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="px-8 pt-12 pb-10 max-w-[1200px] mx-auto">

        {/* Label row */}
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/TwelveLabs-Symbol.png" alt="TwelveLabs" className="w-10 h-10 rounded-xl" />
          <span className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: "#84CC16" }}>
            TwelveLabs
          </span>
          <span className="text-[11px] text-gray-400">•</span>
          <a
            href="https://docs.twelvelabs.io/docs/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold uppercase tracking-[2px] text-gray-400 hover:text-gray-900 transition-colors"
          >
            Documentation
          </a>
          <span className="text-[11px] text-gray-400">•</span>
          <span className="text-[11px] font-semibold uppercase tracking-[2px] text-gray-400">Guide</span>
        </div>

        {/* Headline */}
        <h1 className="text-[42px] font-bold tracking-[-2px] text-gray-900 leading-[1.1] mb-5 max-w-[700px]">
          Contextual Ad Engine
        </h1>
        <p className="text-[17px] text-gray-500 leading-relaxed max-w-[640px] mb-8">
          Upload broadcast footage, let TwelveLabs&rsquo; multimodal models identify ideal ad breaks,
          rank ads by viewer affinity and scene fit, and preview ad-injected video — all from a
          single dashboard.
        </p>

        {/* CTA Buttons */}
        <div className="flex items-center gap-3 flex-wrap mb-12">
          <a
            href="https://docs.twelvelabs.io/docs/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-gray-900 transition-all hover:brightness-95"
            style={{ background: GRAD }}
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            Read the Docs
            <svg viewBox="0 0 10 10" fill="none" className="w-3 h-3 opacity-60"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <a
            href="https://github.com/nathanchess/twelvelabs-context-ad-engine/tree/main"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-black hover:rounded-2xl transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
            View Source
            <svg viewBox="0 0 10 10" fill="none" className="w-3 h-3 opacity-60"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <a
            href="https://www.twelvelabs.io/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-[#E5E7EB] text-gray-500 font-semibold text-sm hover:border-gray-400 hover:text-gray-900 transition-colors"
          >
            Talk to Sales
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H5M9.5 2.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>

        {/* Architecture + Demo panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#E5E7EB] bg-gray-50 flex flex-col items-center justify-center aspect-4/3 text-center p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/TwelveLabs-Symbol.png" alt="" className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium text-gray-500 mb-1">Architecture Diagram</p>
           
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-gray-900 flex flex-col items-center justify-center aspect-4/3 text-center p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-br from-gray-800 to-gray-950" />
            <div className="relative z-10 w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white ml-0.5">
                <path d="M8 5L19 12L8 19V5Z" fill="currentColor" />
              </svg>
            </div>
            <p className="relative z-10 text-sm font-medium text-white/80 mb-1">Demo Video</p>
            
          </div>
        </div>
      </section>

      {/* ── Problem Statement ─────────────────────────────── */}
      <section className="px-8 py-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-4">
          The Contextual Ad Gap
        </h2>
        <p className="text-[15px] text-gray-500 leading-relaxed max-w-[780px] mb-4">
          Streaming platforms insert ads based on <strong className="text-gray-900">demographic targeting alone</strong> — a beer ad plays
          during a somber funeral scene; a luxury car ad interrupts a comedic moment. The mismatch erodes
          viewer trust and brand equity.
        </p>
        <p className="text-[15px] text-gray-500 leading-relaxed max-w-[780px]">
          TwelveLabs&rsquo; multimodal models unlock a new primitive:{" "}
          <strong className="text-gray-900">scene-level understanding</strong>. By knowing exactly what is
          happening in every second of video — the emotion, the environment, the objects, the dialogue — we
          can match ads to moments that amplify rather than interrupt the viewer experience.
        </p>
      </section>

      {/* ── Stats row ─────────────────────────────────────── */}
      <section className="px-8 pb-10 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              value: "40+",
              label: "Ads in inventory",
              sub: "",
              icon: (
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
                  <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              ),
            },
            {
              value: "3",
              label: "User Profiles",
              sub: "",
              icon: (
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
                  <circle cx="3.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 12.5c0-1.2 0.9-2 2-2s2 0.8 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="8" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 12.5c0-1.2 0.9-2 2-2s2 0.8 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="12.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M10.5 12.5c0-1.2 0.9-2 2-2s2 0.8 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              value: "512",
              label: "Vector Embedding Dimensions",
              sub: "",
              icon: (
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
                  <circle cx="3" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="8" cy="3" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="5" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="11" cy="9" r="1.5" fill="currentColor" />
                  <circle cx="8" cy="13" r="1.5" fill="currentColor" />
                  <path
                    d="M4.2 4.8l2.2 3.8M8 4.5v4.5M12.2 5.8l-2.8 2.2M5.8 10.2l1.8 2.3M10.5 9.5l-1.2 2.8"
                    stroke="currentColor"
                    strokeWidth="0.75"
                    strokeLinecap="round"
                    opacity={0.45}
                  />
                </svg>
              ),
            },
            {
              value: "3",
              label: "Safety modes",
              sub: "",
              icon: (
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden>
                  <path
                    d="M8 1.5l5 2v5.2c0 3.4-2.4 6-5 6.8-2.6-.8-5-3.4-5-6.8V3.5l5-2z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path d="M5 6.5h6M5 8.75h6M5 11h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
              ),
            },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-4 rounded-xl border border-[#E5E7EB] bg-white p-4">
              <div className="p-2 rounded-lg shrink-0" style={{ background: "rgba(217,249,157,0.3)", color: "#65A30D" }}>
                {s.icon}
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Core Features ─────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-2">Core Features</h2>
        <p className="text-[15px] text-gray-500 mb-8">
          Everything needed to go from raw footage to precision-targeted ad placement.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            iconBg="bg-indigo-50 text-indigo-600"
            icon={
              <svg viewBox="0 0 16 16" fill="none" className="w-5 h-5" aria-hidden>
                <circle cx="5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 11c0-1 0.8-1.8 1.5-1.8s1.5 0.8 1.5 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="11" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M9.5 11c0-1 0.8-1.8 1.5-1.8s1.5 0.8 1.5 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path
                  d="M7.5 8.5h1M8 8.5V6.5M7.2 6.8l1.6-1.6M8.8 6.8L7.2 5.2"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="Real-time profile ad switching"
            description="Switch between the three custom demo personas in the player. Ranked ad recommendations and the injected preview update immediately — no reload — so you can compare how scene fit and user affinity reshape the same break in real time."
          />
          <FeatureCard
            iconBg="bg-orange-50"
            icon={
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src="/databricks-mark.svg" alt="" width={20} height={20} className="w-5 h-5 object-contain" />
            }
            title="Databricks contextual lift"
            description="Export Marengo-backed ad metadata and impressions-ready rows to Delta Lake via the Databricks SQL driver. Join TwelveLabs scene IDs with warehouse analytics to measure contextual lift, benchmark campaigns, and operationalize the pipeline beside your existing BI stack."
          />
          <FeatureCard
            iconBg="bg-green-50 text-green-600"
            icon={<svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C9.98528 0 12 2.01472 12 4.5C12 6.98528 9.98528 9 7.5 9C6.36252 8.99998 5.32451 8.57691 4.53223 7.88086L0.707031 11.707L0 11L3.85742 7.1416C3.31847 6.39969 3 5.48716 3 4.5C3 2.01474 5.01475 4.07169e-05 7.5 0ZM7.5 1C5.56704 1.00004 4 2.56703 4 4.5C4 6.43297 5.56704 7.99996 7.5 8C9.433 8 11 6.433 11 4.5C11 2.567 9.433 1 7.5 1Z" fill="currentColor" style={{ transform: "scale(0.75) translate(1.5px, 1.5px)" }} /></svg>}
            title="Semantic Search"
            description="Search video inventory by meaning, not keywords. Describe a scene, emotion, or moment — Marengo embeddings surface the exact timestamp across all indexed content."
          />
          <FeatureCard
            iconBg="bg-orange-50 text-orange-600"
            icon={<svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="Multiplicative Ad Scoring"
            description="Two-stage formula: scene fit (Marengo vector similarity + environment/tone) multiplied by user affinity. Scene context gates viewer preference — not the reverse."
          />
          <FeatureCard
            iconBg="bg-yellow-50 text-yellow-600"
            icon={<svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><circle cx="5" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="11" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.2" /><path d="M7.5 8h1M7.5 7l1-2M7.5 9l1 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>}
            title="Cross-Break Diversity"
            description="Ensures no single ad or category dominates a broadcast. Selected ads are hard-excluded from future breaks; category caps prevent over-representation."
          />
          <FeatureCard
            iconBg="bg-pink-50 text-pink-600"
            icon={<svg viewBox="0 0 16 16" fill="none" className="w-5 h-5"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" /><path d="M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>}
            title="Ad-Injected Preview"
            description="Generate a full broadcast preview with ads injected at computed break points. Ad skip logic, playback controls, and downloadable JSON plan included."
          />
        </div>
      </section>

      <Divider />

      {/* ── How It Works ──────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-2">How It Works</h2>
        <p className="text-[15px] text-gray-500 mb-10">
          Three core steps from raw footage to ranked, diverse ad placement.
        </p>

        <div className="flex flex-col gap-12">
          {snippets.map((s) => (
            <div key={s.step}>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-gray-900 shrink-0"
                  style={{ background: GRAD }}
                >
                  {s.step}
                </span>
                <h3 className="text-[18px] font-semibold text-gray-900">{s.title}</h3>
              </div>
              <p className="text-[15px] text-gray-500 leading-relaxed mb-6 ml-10">{s.description}</p>
              <CodeBlock filename={s.filename} language={s.language} code={s.code} />
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Why TwelveLabs ────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-2">Why TwelveLabs?</h2>
        <p className="text-[15px] text-gray-500 mb-8">
          TwelveLabs provides the foundational models that power every inference in this engine.
        </p>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          {whyRows.map((row, i) => (
            <div
              key={row.name}
              className={`flex items-start gap-4 px-6 py-5 ${i < whyRows.length - 1 ? "border-b border-[#E5E7EB]" : ""}`}
            >
              <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(217,249,157,0.3)", color: "#65A30D" }}>
                {row.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-[14px] mb-1">{row.name}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{row.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <a
            href="https://www.twelvelabs.io/research"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
          >
            Read TwelveLabs Research Papers
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H5M9.5 2.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </section>

      <Divider />

      {/* ── Business Impact ───────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-2">Business Impact</h2>
        <p className="text-[15px] text-gray-500 mb-8">
          Contextual placement drives measurable outcomes for publishers, brands, and viewers.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#E5E7EB] p-6 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4" style={{ color: "#84CC16" }}><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <span className="font-semibold text-gray-900 text-sm">For Publishers</span>
            </div>
            <ul className="space-y-2.5">
              {[
                ["Higher CPMs", "Context-matched inventory commands premium rates over run-of-network."],
                ["Brand Safety at Scale", "Automated GARM classification prevents costly misplacements."],
                ["Viewer Retention", "Relevant ads reduce skip rates and improve completion metrics."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#84CC16" }}><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-sm text-gray-500"><strong className="text-gray-900">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] p-6 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4" style={{ color: "#FBBF24" }}><path d="M2 10l3-6 3 4 2-2 2 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="font-semibold text-gray-900 text-sm">For Advertisers</span>
            </div>
            <ul className="space-y-2.5">
              {[
                ["Scene-Fit Verification", "Know exactly which scenes your creative appears in before buying."],
                ["Cross-Break Diversity", "Frequency controls prevent over-exposure and ad fatigue."],
                ["Affinity-Matched Audiences", "Viewer cohort scoring ensures the right person sees the right ad."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#FBBF24" }}><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-sm text-gray-500"><strong className="text-gray-900">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Technology Stack ──────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-gray-900 mb-8">Technology Stack</h2>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-gray-50">
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gray-400">Layer</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gray-400">Technology</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gray-400">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {[
                ["Frontend", "Next.js 15 + React 19", "App Router, SSR, and real-time client computation"],
                ["Video AI", "TwelveLabs API", "Marengo embeddings + Pegasus scene analysis"],
                ["Ad Engine", "TypeScript Pure Functions", "Deterministic scoring with useMemo for instant re-ranking"],
                ["Styling", "Tailwind CSS v4 + Strand DS", "TwelveLabs brand design system"],
                ["Storage", "Vercel Blob", "Video analysis cache + embedding cache"],
                ["Streaming", "HLS.js + CloudFront CDN", "Adaptive bitrate playback for content + ad videos"],
                ["Data Platform", "Databricks Delta Lake", "Ad metadata + Marengo embedding export for Mosaic AI Vector Search"],
              ].map(([layer, tech, purpose]) => (
                <tr key={layer} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-700">{layer}</td>
                  <td className="px-6 py-3 font-mono text-xs font-medium" style={{ color: "#65A30D" }}>{tech}</td>
                  <td className="px-6 py-3 text-gray-500 text-xs">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────── */}
      <section className="px-8 pb-16 max-w-[1200px] mx-auto">
        <div className="rounded-2xl px-8 py-10 text-center" style={{ background: GRAD_WASH, border: "1px solid rgba(217,249,157,0.6)" }}>
          <h3 className="text-[22px] font-bold tracking-tight text-gray-900 mb-2">
            Ready to see contextual ad placement in action?
          </h3>
          <p className="text-[15px] text-gray-500 mb-6 max-w-[500px] mx-auto">
            Upload a video, explore the ad inventory, and watch the engine rank ads in real time as you switch viewer profiles.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://docs.twelvelabs.io/docs/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-gray-900 transition-all hover:brightness-95"
              style={{ background: GRAD }}
            >
              API Documentation
            </a>
            <a
              href="https://www.twelvelabs.io/research"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-black hover:rounded-2xl transition-all duration-200"
            >
              Research Papers
              <svg viewBox="0 0 10 10" fill="none" className="w-3 h-3 opacity-60"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a
              href="https://www.twelvelabs.io/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-[#E5E7EB] text-gray-500 font-semibold text-sm hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              Talk to Sales
              <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H5M9.5 2.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E7EB] px-8 py-6 text-center">
        <p className="text-[12px] text-gray-400">
          Built by Nathan Che &nbsp;•&nbsp; Powered by{" "}
          <a
            href="https://www.twelvelabs.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-900 transition-colors font-medium"
          >
            TwelveLabs
          </a>
        </p>
      </footer>
    </div>
  );
}
