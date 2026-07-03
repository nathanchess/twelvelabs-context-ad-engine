"use client";

import {
  AnalyzeIcon,
  ApiDocIcon,
  ArrowBoxRightIcon,
  Button,
  CheckmarkIcon,
  ContactSalesIcon,
  EmbedIcon,
  GridIcon,
  MarengoIcon,
  PegasusIcon,
  ProfileIcon,
  RocketIcon,
  ScalableIcon,
  SearchIcon,
  SegmentIcon,
  ServersIcon,
  TwelveLabsLogo,
  VideoIcon,
} from "@twelvelabs-io/react";
import ScrollFadeUp from "./components/ScrollFadeUp";
import ScrollProgressBar from "./components/ScrollProgressBar";
import OverviewCodeBlock from "./components/OverviewCodeBlock";

type IconTone = "embed" | "search" | "analyze" | "brand";

const iconToneClass: Record<IconTone, string> = {
  embed: "bg-surface-embed text-foreground-embed",
  search: "bg-surface-search text-foreground-search",
  analyze: "bg-surface-analyze text-foreground-analyze",
  brand: "bg-tl-master-brand-light-green text-tl-master-brand-dark-green",
};

/* ── Divider ────────────────────────────────────────────── */
function Divider() {
  return (
    <div className="my-12 flex items-center gap-4 max-w-[1200px] mx-auto px-8">
      <div className="flex-1 h-px bg-border-secondary" />
      <TwelveLabsLogo className="h-5 w-auto opacity-40" />
      <div className="flex-1 h-px bg-border-secondary" />
    </div>
  );
}

/* ── Feature card ───────────────────────────────────────── */
function FeatureCard({
  title,
  description,
  icon,
  tone,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: IconTone;
}) {
  return (
    <div className="rounded-2xl border border-border-secondary bg-surface-white p-6 transition-all duration-200 hover:border-border-primary hover:shadow-sm">
      <div className={`mb-4 inline-flex rounded-xl p-2.5 ${iconToneClass[tone]}`}>
        {icon}
      </div>
      <h3 className="mb-2 text-[15px] font-semibold tracking-tight text-foreground-body">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground-subtle">{description}</p>
    </div>
  );
}

/* ── Code snippets ──────────────────────────────────────── */
const snippets: {
  step: string;
  title: string;
  description: string;
  filename: string;
  language: string;
  code: string;
  resourceLinks?: { href: string; label: string }[];
}[] = [
  {
    step: "1",
    title: "Pegasus 1.5 Scene Classification and Content Taxonomy 3.1",
    description:
      "Ad semantic IAB uses TwelveLabs Pegasus 1.5 in time-based mode: a `scene_classification` segment returns a short `scene_description` per time range. Each description is embedded with OpenAI `text-embedding-3-small` and compared (cosine similarity) to every node in the taxonomy embedding database — a k-nearest style pass that keeps the top candidates per scene and maps the best match to the exact Content Taxonomy 3.1 node id (`iab_id` in the JSON, surfaced as `taxonomyNodeId` in the API). Results are cached to Vercel Blob.",
    filename: "api/adInventoryIabSemantic/route.js",
    language: "javascript",
    code: `const created = await tlClient.analyzeAsync.tasks.create({
  modelName: "pegasus1.5",
  video: resolvedVideo.video,
  analysisMode: "time_based_metadata",
  responseFormat: {
    type: "segment_definitions",
    segmentDefinitions: [{
      id: "scene_classification",
      fields: [{ name: "scene_description", type: "string", /* ... */ }],
    }],
  },
  minSegmentDuration: 5,
  maxSegmentDuration: 30,
});
// Per scene: OpenAI text-embedding-3-small → cosine vs taxonomy_embeds.json
// Best node.iab_id = exact CT 3.1 id; topK=5 for taxonomyTopCandidates
const score = cosineSimilarity(sceneEmbedding, node.embedding);
pushTopCosine(taxonomyTopCandidates, { iab_id, breadcrumb, cosine_similarity: score }, 5);`,
    resourceLinks: [
      {
        label: "taxonomy_embeds.json (embedding database, repo root)",
        href: "https://github.com/nathanchess/twelvelabs-context-ad-engine/blob/main/taxonomy_embeds.json",
      },
      {
        label: "IAB Content Taxonomy (standards and 3.1 reference)",
        href: "https://iabtechlab.com/standards/content-taxonomy/",
      },
      {
        label: "IAB Taxonomies repository (GitHub)",
        href: "https://github.com/InteractiveAdvertisingBureau/Taxonomies",
      },
    ],
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
const whyRows: {
  icon: React.ReactNode;
  name: string;
  description: string;
  tone: IconTone;
}[] = [
  {
    icon: <MarengoIcon className="size-5" />,
    name: "Marengo 3.0 — Multimodal Embeddings",
    description:
      "State-of-the-art video representation model that encodes visual, audio, and textual content into a unified 512-dimensional vector space. Powers semantic scene matching in this engine.",
    tone: "embed",
  },
  {
    icon: <PegasusIcon className="size-5" />,
    name: "Pegasus 1.5 — Generative Video Understanding",
    description:
      "Drives time-based scene classification and metadata (including semantic Content Taxonomy 3.1 alignment via OpenAI embeddings) — a core input to ad break and IAB labeling in this app.",
    tone: "analyze",
  },
  {
    icon: <ScalableIcon className="size-5" />,
    name: "Enterprise-Grade Infrastructure",
    description:
      "SOC 2 compliant, built for scale. Process thousands of hours of video via a simple REST API with consistent, predictable pricing and 99.9% uptime.",
    tone: "brand",
  },
  {
    icon: <RocketIcon className="size-5" />,
    name: "Research-Backed Innovation",
    description:
      "TwelveLabs' research team continuously improves model accuracy across visual, audio, and textual modalities — improving ad relevance with every model release.",
    tone: "search",
  },
];
const ARCHITECTURE_LUCIDCHART_URL =
  "https://lucid.app/lucidchart/ef8d11e1-3f00-4bf0-b411-ab8e3bb3606b/edit?view_items=o97PhyrSgvaW%2Cyc8PiHljiUJe%2CD_7PDd.qF_w~%2CUh8PfmArC9R3%2Cgr8PjOz-iagi%2C-u8PfT3QVmS1%2COk8PFHaFqYe5%2CUj8PTZaGtt3P%2C6z8PX_fhmaE8%2CAN8PxOhZuzK-%2C0N8P32C~nzbK%2CoQ8PNkmzbcNI%2CBQ8P70VmeSOz%2C0N8PiNmrzY.o%2C0N8P5JYxcZ3Z%2C0N8PcvJGj~YA%2C0N8PAghTJfLr%2C0N8PNwKd5Cer%2C0N8P7ZQJkL5k%2C0N8P1P9s-s8g%2CBy8P8HKsplEp%2C-y8PC8hX52xj%2Cux8PV37i~0Bz%2C8x8P6biPsTC4%2CVx8Pvj2yoMg7%2Cuz8PB9v8U2~o%2Cwz8PkQRStyhT%2C0N8PPFxVCJfI%2Cw97PAN.GCjSP%2C5a8PobQdNG8C%2CZj8PDP9VmazD%2CON8PLiaeNf4n%2C6z8PPERmzORN%2Cpv8Pu3fnl9ib%2CBj8PQVmqVxYI%2CPr8PFA4giQX9%2Cfo8PU5izetbk%2CM_7PeRh-oBjv%2C0h8PZqnkdim4%2C4j8PblhJtVSw%2CuQ8PeQHU0Icd%2CxQ8PWNynGcvq%2CbA8Pz~9cV5Cs%2Cym8PRF9Y6gG7%2Cvr8PzYJ5LtX4%2CBu8PNideLDRC%2CKN8PBxiACflG%2C7N8PCwevxQbp&page=0_0&invitationId=inv_09de1972-142b-4369-9df4-f91eb3f5a949";

const WALKTHROUGH_YOUTUBE_EMBED = "https://www.youtube.com/embed/br_Hdc3yCY0";

const CTA_GRAD_WASH =
  "linear-gradient(135deg, rgba(217,249,157,0.15) 0%, rgba(253,224,71,0.15) 100%)";

/* ── Page ───────────────────────────────────────────────── */
export default function Home() {
  return (
    <div className="min-h-screen bg-surface-white">
      <ScrollProgressBar />

      <ScrollFadeUp order={0}>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="px-8 pt-12 pb-10 max-w-[1200px] mx-auto">

        {/* Headline */}
        <h1 className="text-[42px] font-bold tracking-[-2px] text-foreground-body leading-[1.1] mb-5 max-w-[700px]">
          Contextual Ad Engine
        </h1>
        <p className="text-[17px] text-foreground-subtle leading-relaxed max-w-[640px] mb-8">
          Upload broadcast footage, let TwelveLabs&rsquo; multimodal models identify ideal ad breaks,
          rank ads by viewer affinity and scene fit, and preview ad-injected video — all from a
          single dashboard.
        </p>

        {/* CTA Buttons */}
        <div className="flex items-center gap-3 flex-wrap mb-12">
          <Button
            asChild
            variant="primary"
            size="lg"
          >
            <a
              href="https://docs.twelvelabs.io/docs/introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ApiDocIcon className="size-4" />
              Read the Docs
              <ArrowBoxRightIcon className="size-3 opacity-60" />
            </a>
          </Button>
          <Button
            asChild
            variant="secondary"
            size="lg"
          >
            <a
              href="https://github.com/nathanchess/twelvelabs-context-ad-engine/tree/main"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Source
              <ArrowBoxRightIcon className="size-3 opacity-60" />
            </a>
          </Button>
          <Button
            asChild
            variant="outlined-gray"
            size="lg"
          >
            <a
              href="https://www.twelvelabs.io/contact"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ContactSalesIcon className="size-4" />
              Talk to Sales
              <ArrowBoxRightIcon className="size-3" />
            </a>
          </Button>
        </div>

        {/* Walkthrough (YouTube) */}
        <div className="mb-4">
          <p className="text-[13px] font-medium text-foreground-subtle mb-3">Full application walkthrough</p>
          <div className="relative w-full aspect-video rounded-2xl border border-border-secondary overflow-hidden bg-black shadow-sm">
            <iframe
              className="absolute inset-0 w-full h-full"
              src={WALKTHROUGH_YOUTUBE_EMBED}
              title="Contextual Ad Engine — full application walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>

        {/* Architecture diagram */}
        <div className="rounded-2xl border border-border-secondary bg-surface-body p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Architecture.png"
            alt="Architecture diagram"
            className="w-full h-auto rounded-xl object-contain"
            draggable="false"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <a
            href={ARCHITECTURE_LUCIDCHART_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground-body font-medium transition-colors"
          >
            View full-screen architecture
            <ArrowBoxRightIcon className="size-3" aria-hidden />
          </a>
        </div>
      </section>
      </ScrollFadeUp>

      <ScrollFadeUp order={1}>
      {/* ── Problem Statement ─────────────────────────────── */}
      <section className="px-8 py-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-4">
          The Contextual Ad Gap
        </h2>
        <p className="text-[15px] text-foreground-subtle leading-relaxed max-w-[780px] mb-4">
          Streaming platforms insert ads based on <strong className="text-foreground-body">demographic targeting alone</strong> — a beer ad plays
          during a somber funeral scene; a luxury car ad interrupts a comedic moment. The mismatch erodes
          viewer trust and brand equity.
        </p>
        <p className="text-[15px] text-foreground-subtle leading-relaxed max-w-[780px]">
          TwelveLabs&rsquo; multimodal models unlock a new primitive:{" "}
          <strong className="text-foreground-body">scene-level understanding</strong>. By knowing exactly what is
          happening in every second of video — the emotion, the environment, the objects, the dialogue — we
          can match ads to moments that amplify rather than interrupt the viewer experience.
        </p>
      </section>
      </ScrollFadeUp>

      <ScrollFadeUp order={2}>
      {/* ── Stats row ─────────────────────────────────────── */}
      <section className="px-8 pb-10 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              value: "40+",
              label: "Ads in inventory",
              sub: "",
              icon: <GridIcon className="size-4" />,
            },
            {
              value: "3",
              label: "User Profiles",
              sub: "",
              icon: <ProfileIcon className="size-4" />,
            },
            {
              value: "512",
              label: "Vector Embedding Dimensions",
              sub: "",
              icon: <EmbedIcon className="size-4" />,
            },
            {
              value: "3",
              label: "Safety modes",
              sub: "",
              icon: <ServersIcon className="size-4" />,
            },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-4 rounded-xl border border-border-secondary bg-surface-white p-4">
              <div className={`p-2 rounded-lg shrink-0 ${iconToneClass.brand}`}>
                {s.icon}
              </div>
              <div>
                <p className="text-xl font-bold text-foreground-body leading-none">{s.value}</p>
                <p className="text-xs text-foreground-subtle mt-0.5">{s.label}</p>
                <p className="text-[10px] text-foreground-muted mt-0.5 leading-tight">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      </ScrollFadeUp>

      <Divider />

      <ScrollFadeUp order={3}>
      {/* ── Core Features ─────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-2">Core Features</h2>
        <p className="text-[15px] text-foreground-subtle mb-8">
          Everything needed to go from raw footage to precision-targeted ad placement.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            tone="search"
            icon={<ProfileIcon className="size-5" />}
            title="Real-time profile ad switching"
            description="Switch between the three custom demo personas in the player. Ranked ad recommendations and the injected preview update immediately — no reload — so you can compare how scene fit and user affinity reshape the same break in real time."
          />
          <FeatureCard
            tone="analyze"
            icon={<ServersIcon className="size-5" />}
            title="Databricks contextual lift"
            description="Export Marengo-backed ad metadata and impressions-ready rows to Delta Lake via the Databricks SQL driver. Join TwelveLabs scene IDs with warehouse analytics to measure contextual lift, benchmark campaigns, and operationalize the pipeline beside your existing BI stack."
          />
          <FeatureCard
            tone="search"
            icon={<SearchIcon className="size-5" />}
            title="Semantic Search"
            description="Search video inventory by meaning, not keywords. Describe a scene, emotion, or moment — Marengo embeddings surface the exact timestamp across all indexed content."
          />
          <FeatureCard
            tone="embed"
            icon={<CheckmarkIcon className="size-5" />}
            title="Multiplicative Ad Scoring"
            description="Two-stage formula: scene fit (Marengo vector similarity + environment/tone) multiplied by user affinity. Scene context gates viewer preference — not the reverse."
          />
          <FeatureCard
            tone="analyze"
            icon={<SegmentIcon className="size-5" />}
            title="Cross-Break Diversity"
            description="Ensures no single ad or category dominates a broadcast. Selected ads are hard-excluded from future breaks; category caps prevent over-representation."
          />
          <FeatureCard
            tone="brand"
            icon={<VideoIcon className="size-5" />}
            title="Ad-Injected Preview"
            description="Generate a full broadcast preview with ads injected at computed break points. Ad skip logic, playback controls, and downloadable JSON plan included."
          />
        </div>
      </section>
      </ScrollFadeUp>

      <Divider />

      <ScrollFadeUp order={4}>
      {/* ── How It Works ──────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-2">How It Works</h2>
        <p className="text-[15px] text-foreground-subtle mb-10">
          Four core steps from raw footage to ranked, diverse ad placement.
        </p>

        <div className="flex flex-col gap-12">
          {snippets.map((s) => (
            <div key={s.step}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${iconToneClass.brand}`}>
                  {s.step}
                </span>
                <h3 className="text-[18px] font-semibold text-foreground-body">{s.title}</h3>
              </div>
              <p className="text-[15px] text-foreground-subtle leading-relaxed mb-4 ml-10">{s.description}</p>
              {s.resourceLinks && s.resourceLinks.length > 0 ? (
                <ul className="list-disc pl-14 pr-4 mb-6 text-[14px] text-foreground-subtle space-y-1.5">
                  {s.resourceLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground-body underline decoration-border-secondary underline-offset-2 hover:text-foreground-body"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <OverviewCodeBlock filename={s.filename} language={s.language} code={s.code} />
            </div>
          ))}
        </div>
      </section>
      </ScrollFadeUp>

      <Divider />

      <ScrollFadeUp order={5}>
      {/* ── Why TwelveLabs ────────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-2">Why TwelveLabs?</h2>
        <p className="text-[15px] text-foreground-subtle mb-8">
          TwelveLabs provides the foundational models that power every inference in this engine.
        </p>
        <div className="rounded-2xl border border-border-secondary bg-surface-white overflow-hidden">
          {whyRows.map((row, i) => (
            <div
              key={row.name}
              className={`flex items-start gap-4 px-6 py-5 ${i < whyRows.length - 1 ? "border-b border-border-secondary" : ""}`}
            >
              <div className={`p-2 rounded-xl shrink-0 ${iconToneClass[row.tone]}`}>
                {row.icon}
              </div>
              <div>
                <p className="font-semibold text-foreground-body text-[14px] mb-1">{row.name}</p>
                <p className="text-sm text-foreground-subtle leading-relaxed">{row.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <a
            href="https://www.twelvelabs.io/research"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground-body font-medium transition-colors"
          >
            Read TwelveLabs Research Papers
            <ArrowBoxRightIcon className="size-3" />
          </a>
        </div>
      </section>
      </ScrollFadeUp>

      <Divider />

      <ScrollFadeUp order={6}>
      {/* ── Business Impact ───────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-2">Business Impact</h2>
        <p className="text-[15px] text-foreground-subtle mb-8">
          Contextual placement drives measurable outcomes for publishers, brands, and viewers.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border-secondary p-6 bg-surface-white">
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-1.5 rounded-lg ${iconToneClass.embed}`}>
                <ScalableIcon className="size-4" />
              </div>
              <span className="font-semibold text-foreground-body text-sm">For Publishers</span>
            </div>
            <ul className="space-y-2.5">
              {[
                ["Higher CPMs", "Context-matched inventory commands premium rates over run-of-network."],
                ["Brand Safety at Scale", "Automated GARM classification prevents costly misplacements."],
                ["Viewer Retention", "Relevant ads reduce skip rates and improve completion metrics."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <CheckmarkIcon className="size-4 mt-0.5 shrink-0 text-foreground-embed" />
                  <span className="text-sm text-foreground-subtle"><strong className="text-foreground-body">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border-secondary p-6 bg-surface-white">
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-1.5 rounded-lg ${iconToneClass.analyze}`}>
                <AnalyzeIcon className="size-4" />
              </div>
              <span className="font-semibold text-foreground-body text-sm">For Advertisers</span>
            </div>
            <ul className="space-y-2.5">
              {[
                ["Scene-Fit Verification", "Know exactly which scenes your creative appears in before buying."],
                ["Cross-Break Diversity", "Frequency controls prevent over-exposure and ad fatigue."],
                ["Affinity-Matched Audiences", "Viewer cohort scoring ensures the right person sees the right ad."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <CheckmarkIcon className="size-4 mt-0.5 shrink-0 text-foreground-analyze" />
                  <span className="text-sm text-foreground-subtle"><strong className="text-foreground-body">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      </ScrollFadeUp>

      <Divider />

      <ScrollFadeUp order={7}>
      {/* ── Technology Stack ──────────────────────────────── */}
      <section className="px-8 py-4 pb-12 max-w-[1200px] mx-auto">
        <h2 className="text-[28px] font-bold tracking-[-1px] text-foreground-body mb-8">Technology Stack</h2>
        <div className="rounded-2xl border border-border-secondary bg-surface-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-secondary bg-surface-body">
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">Layer</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">Technology</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground-muted">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-secondary">
              {[
                ["Frontend", "Next.js 15 + React 19", "App Router, SSR, and real-time client computation"],
                ["Video AI", "TwelveLabs API", "Marengo embeddings + Pegasus scene analysis"],
                ["Ad Engine", "TypeScript Pure Functions", "Deterministic scoring with useMemo for instant re-ranking"],
                ["Styling", "Tailwind CSS v4 + @twelvelabs-io/react", "TwelveLabs design system"],
                ["Storage", "Vercel Blob", "Video analysis cache + embedding cache"],
                ["Streaming", "HLS.js + CloudFront CDN", "Adaptive bitrate playback for content + ad videos"],
                ["Data Platform", "Databricks Delta Lake", "Ad metadata + Marengo embedding export for Mosaic AI Vector Search"],
              ].map(([layer, tech, purpose]) => (
                <tr key={layer} className="hover:bg-surface-body transition-colors">
                  <td className="px-6 py-3 font-medium text-foreground-body">{layer}</td>
                  <td className="px-6 py-3 font-tl-mono text-xs font-medium text-foreground-embed">{tech}</td>
                  <td className="px-6 py-3 text-foreground-subtle text-xs">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </ScrollFadeUp>

      <ScrollFadeUp order={8}>
      {/* ── CTA Banner ────────────────────────────────────── */}
      <section className="px-8 pb-16 max-w-[1200px] mx-auto">
        <div
          className="rounded-2xl px-8 py-10 text-center"
          style={{ background: CTA_GRAD_WASH, border: "1px solid rgba(217,249,157,0.6)" }}
        >
          <h3 className="text-[22px] font-bold tracking-tight text-foreground-body mb-2">
            Ready to see contextual ad placement in action?
          </h3>
          <p className="text-[15px] text-foreground-subtle mb-6 max-w-[500px] mx-auto">
            Upload a video, explore the ad inventory, and watch the engine rank ads in real time as you switch viewer profiles.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button asChild variant="primary" size="regular">
              <a
                href="https://docs.twelvelabs.io/docs/introduction"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ApiDocIcon className="size-4" />
                API Documentation
              </a>
            </Button>
            <Button asChild variant="secondary" size="regular">
              <a
                href="https://www.twelvelabs.io/research"
                target="_blank"
                rel="noopener noreferrer"
              >
                Research Papers
                <ArrowBoxRightIcon className="size-3 opacity-60" />
              </a>
            </Button>
            <Button asChild variant="outlined-gray" size="regular">
              <a
                href="https://www.twelvelabs.io/contact"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ContactSalesIcon className="size-4" />
                Talk to Sales
                <ArrowBoxRightIcon className="size-3" />
              </a>
            </Button>
          </div>
        </div>
      </section>
      </ScrollFadeUp>

      <ScrollFadeUp order={9}>
      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-border-secondary px-8 py-6 text-center">
        <p className="text-[12px] text-foreground-muted">
          Built by Nathan Che &nbsp;•&nbsp; Powered by{" "}
          <a
            href="https://www.twelvelabs.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground-subtle hover:text-foreground-body transition-colors font-medium"
          >
            TwelveLabs
          </a>
        </p>
      </footer>
      </ScrollFadeUp>
    </div>
  );
}
