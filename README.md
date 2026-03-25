# Contextual Ad Engine

> **Powered by TwelveLabs** — Marengo multimodal embeddings + Pegasus generative scene analysis

A full-stack contextual ad placement engine for broadcast and streaming content. Upload video footage, let TwelveLabs' AI models analyze every scene, and watch the engine intelligently rank ads by scene fit, viewer affinity, and brand safety — all in real time.

---

## What It Does

| Feature | Description |
|---|---|
| **Scene Analysis** | Pegasus generates time-stamped metadata per segment — sentiment, tone, environment, suitable ad categories, GARM brand-safety flags |
| **Vector Matching** | Marengo 1024-dim embeddings power cosine similarity between ad creatives and video scenes |
| **Two-Stage Scoring** | `totalScore = adAffinity × sceneFit` — scene context gates viewer affinity, not the reverse |
| **Cross-Break Diversity** | No ad wins twice; category caps = `ceil(totalBreaks / 2)` |
| **Semantic Video Search** | Natural-language search across all indexed content — surfaces matched timestamp clips |
| **Ad-Injected Preview** | Full broadcast preview with ads injected at computed breaks, skip logic, and downloadable ad plan |

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **npm**, yarn, or pnpm
- A [TwelveLabs account](https://playground.twelvelabs.io/) (free tier works)
- A [Vercel account](https://vercel.com/) for Blob storage (free tier works)

### 1. Clone & Install

```bash
git clone https://github.com/nathanchess/paramount-context-ad-engine.git
cd contextual-ad-engine
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Then fill in the values (see [Environment Variables](#environment-variables) below).

### 3. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

---

## Environment Variables

Create `.env.local` with the following keys:

```env
# ── TwelveLabs ──────────────────────────────────────────────
# Your TwelveLabs API key — get it at https://playground.twelvelabs.io/
TL_API_KEY=tlk_...

# The TwelveLabs index ID for your content (broadcast) videos
# Create one at: https://api.twelvelabs.io/v1.3/indexes
TL_INDEX_ID=...

# The TwelveLabs index ID for your ad creative videos (separate index)
TL_AD_INDEX_ID=...

# ── Vercel Blob ──────────────────────────────────────────────
# Read/write token for Vercel Blob (stores analysis + embedding caches)
# Get it from: https://vercel.com/dashboard → Storage → Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

> **Note:** All analysis results are cached to Vercel Blob so subsequent page loads are instant. The engine never re-analyzes a video it has already seen.

---

## How to Get Your API Keys

### TwelveLabs API Key (`TL_API_KEY`)

1. Go to [playground.twelvelabs.io](https://playground.twelvelabs.io/)
2. Sign up or log in
3. Navigate to **API Keys** in your account settings
4. Create a new key and copy it

### TwelveLabs Index IDs (`TL_INDEX_ID`, `TL_AD_INDEX_ID`)

1. In the TwelveLabs dashboard, go to **Indexes**
2. Create two indexes:
   - One for **content videos** (your broadcast footage) — this is `TL_INDEX_ID`
   - One for **ad creatives** (your ad inventory videos) — this is `TL_AD_INDEX_ID`
3. Make sure both indexes have the **Marengo** engine enabled (for embeddings) and **Pegasus** enabled (for analysis)

### Vercel Blob Token (`BLOB_READ_WRITE_TOKEN`)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** → **Blob**
3. Create a new Blob store
4. Copy the `BLOB_READ_WRITE_TOKEN` from the store's settings

---

## Project Structure

```
src/app/
├── page.tsx                          # Overview landing page
├── layout.tsx                        # Root layout (nav, fonts)
├── globals.css                       # Tailwind v4 + Strand design tokens
│
├── video-inventory/
│   ├── page.tsx                      # Video library with semantic search
│   └── [videoId]/
│       ├── page.tsx                  # Video detail — ad placement engine UI
│       └── generate/
│           └── page.tsx              # Ad-injected preview page
│
├── ad-inventory/
│   ├── page.tsx                      # Ad category listing
│   └── [slug]/
│       ├── page.tsx                  # Ad category detail + semantic search
│       └── [videoId]/
│           └── page.tsx              # Individual ad creative analysis
│
├── api/
│   ├── analyze/route.js              # Pegasus scene analysis (cached)
│   ├── search/route.js               # Marengo semantic search
│   ├── videos/route.js               # Video index fetching + caching
│   ├── upload/route.js               # Video upload to TwelveLabs
│   ├── embeddings/route.js           # Marengo segment embeddings (cached)
│   ├── adInventory/route.js          # Ad inventory with vectors
│   ├── affinityMatching/route.js     # User → ad affinity scoring
│   └── generateAdPlan/route.js       # Ad placement plan generation
│
├── lib/
│   ├── adPlacementEngine.ts          # Core scoring engine (pure functions)
│   ├── types.ts                      # Shared TypeScript interfaces
│   ├── videoCache.ts                 # localStorage video cache hook
│   └── adInventoryStore.ts           # Ad category store (client-side)
│
└── components/
    ├── VideoCard.tsx                 # Video card with hover preview + search match
    ├── SegmentTimeline.tsx           # Scene segment timeline visualization
    ├── VideoInventoryUploadModal.tsx # Upload modal
    └── RecommendedAdsPlaceholder.tsx # Ad recommendation placeholder
```

---

## Architecture Overview

```
Raw Video Footage
      │
      ▼
TwelveLabs Index (Marengo + Pegasus)
      │
      ├─ Marengo → 512-dim embeddings per segment (stored in Vercel Blob)
      └─ Pegasus → Scene metadata: sentiment, tone, environment, GARM, ad categories
                             │
                             ▼
              Ad Placement Engine (client-side, deterministic)
                             │
              ┌──────────────┴──────────────┐
              │                             │
         identifyAdBreaks              rankAdsForBreak
         (weighted scoring             (adAffinity × sceneFit)
          + greedy spacing)                 │
              │                             │
              └──────────────┬──────────────┘
                             │
                    selectAdsWithDiversity
                    (cross-break exclusions
                     + category caps)
                             │
                             ▼
                    Ad-Injected Preview
                    (HLS player + ad overlay)
```

---

## The Scoring Formula

```
totalScore = adAffinity × sceneFit

adAffinity = user.ad_category_affinities[ad.category_key]
             (pre-computed from /ad-inventory eligibility cache)

sceneFit =
  suitableMatch  × 0.15   # Pegasus suitable_categories overlap
  environmentFit × 0.15   # Environment × category affinity lookup
  toneCompat     × 0.10   # Emotional tone compatibility
  contextMatch   × 0.60   # Marengo cosine similarity (dominant signal)
```

The cosine similarity is stretched from the expected raw range `[0.35, 0.75]` to `[0, 1]` and raised to the power of `1.5` to exaggerate meaningful differences.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 (App Router) |
| Video AI | TwelveLabs API (Marengo + Pegasus) |
| Ad Engine | TypeScript pure functions + `useMemo` |
| Styling | Tailwind CSS v4 + Strand Design System |
| Storage | Vercel Blob (analysis + embedding cache) |
| Streaming | HLS.js + CloudFront CDN |

---

## Running in Production

```bash
npm run build
npm start
```

Or deploy to Vercel — all environment variables need to be set in the Vercel project settings.

---

## Contributing

1. Do not modify `strand/` — it's the canonical TwelveLabs design system
2. All new UI components should follow `docs/STRANDS_AGENT_RULES.md`
3. Run `npm run build` before committing to catch TypeScript errors

---

## License



---

*Built by Nathan Che · Powered by [TwelveLabs](https://www.twelvelabs.io)*
