# Contextual Ad Engine

> **Powered by TwelveLabs + Databricks** — Marengo multimodal embeddings · Pegasus generative scene analysis · Databricks Delta Lake export

A full-stack contextual ad placement engine for broadcast and streaming content. Upload video footage, let TwelveLabs' AI models analyze every scene, and watch the engine intelligently rank ads by scene fit, viewer affinity, and brand safety — all in real time. Ad metadata and Marengo multimodal embeddings can be exported directly to Databricks Delta tables for downstream Mosaic AI Vector Search indexing.

**Live Demo Application:** [https://twelvelabs-contextual-ads.vercel.app/]

---

## Architecture Overview

![Architecture Diagram](./public/Architecture.png)

[View architecture in full screen (Lucidchart)](https://lucid.app/lucidchart/ef8d11e1-3f00-4bf0-b411-ab8e3bb3606b/edit?view_items=o97PhyrSgvaW%2Cyc8PiHljiUJe%2CD_7PDd.qF_w~%2CUh8PfmArC9R3%2Cgr8PjOz-iagi%2C-u8PfT3QVmS1%2COk8PFHaFqYe5%2CUj8PTZaGtt3P%2C6z8PX_fhmaE8%2CAN8PxOhZuzK-%2C0N8P32C~nzbK%2CoQ8PNkmzbcNI%2CBQ8P70VmeSOz%2C0N8PiNmrzY.o%2C0N8P5JYxcZ3Z%2C0N8PcvJGj~YA%2C0N8PAghTJfLr%2C0N8PNwKd5Cer%2C0N8P7ZQJkL5k%2C0N8P1P9s-s8g%2CBy8P8HKsplEp%2C-y8PC8hX52xj%2Cux8PV37i~0Bz%2C8x8P6biPsTC4%2CVx8Pvj2yoMg7%2Cuz8PB9v8U2~o%2Cwz8PkQRStyhT%2C0N8PPFxVCJfI%2Cw97PAN.GCjSP%2C5a8PobQdNG8C%2CZj8PDP9VmazD%2CON8PLiaeNf4n%2C6z8PPERmzORN%2Cpv8Pu3fnl9ib%2CBj8PQVmqVxYI%2CPr8PFA4giQX9%2Cfo8PU5izetbk%2CM_7PeRh-oBjv%2C0h8PZqnkdim4%2C4j8PblhJtVSw%2CuQ8PeQHU0Icd%2CxQ8PWNynGcvq%2CbA8Pz~9cV5Cs%2Cym8PRF9Y6gG7%2Cvr8PzYJ5LtX4%2CBu8PNideLDRC%2CKN8PBxiACflG%2C7N8PCwevxQbp&page=0_0&invitationId=inv_09de1972-142b-4369-9df4-f91eb3f5a949)

---

## What It Does

| Feature | Description |
|---|---|
| **Scene Analysis** | Pegasus generates time-stamped metadata per segment — sentiment, tone, environment, suitable ad categories, GARM brand-safety flags |
| **Vector Matching** | Marengo 512-dim embeddings power cosine similarity between ad creatives and video scenes |
| **Two-Stage Scoring** | `totalScore = adAffinity × sceneFit` — scene context gates viewer affinity, not the reverse |
| **Cross-Break Diversity** | No ad wins twice; category caps = `ceil(totalBreaks / 2)` |
| **Semantic Video Search** | Natural-language search across all indexed content — surfaces matched timestamp clips |
| **Ad-Injected Preview** | Full broadcast preview with ads injected at computed breaks, skip logic, and downloadable ad plan |
| **Databricks Export** | One-click export of ad metadata + Marengo clip embeddings to a Databricks Delta table for Mosaic AI Vector Search |

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **npm**, yarn, or pnpm
- A [TwelveLabs account](https://playground.twelvelabs.io/) (free tier works)
- A [Vercel account](https://vercel.com/) for Blob storage (free tier works)
- *(Optional)* A [Databricks workspace](https://databricks.com/) with a running SQL warehouse for Delta Lake export

### 1. Clone & Install

```bash
git clone https://github.com/nathanchess/twelvelabs-context-ad-engine.git
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

# ── Databricks (optional — required only for Delta Lake export) ──
# Personal access token from Databricks: User Settings → Developer → Access Tokens
DATABRICKS_TOKEN=dapi...

# Your Databricks workspace hostname (no https://)
DATABRICKS_HOST=<workspace-id>.cloud.databricks.com

# HTTP path to your SQL warehouse: Compute → <warehouse> → Connection details
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/<warehouse-id>

# Optional: Unity Catalog name (e.g. "main"). Leave empty to use the warehouse default catalog.
DATABRICKS_CATALOG=

# Optional: Target schema within the catalog. Defaults to "default".
DATABRICKS_SCHEMA=default
```

> **Note:** All analysis results are cached to Vercel Blob so subsequent page loads are instant. The engine never re-analyzes a video it has already seen.

> **Databricks:** The `DATABRICKS_*` variables are optional. The Databricks export button (`GET /api/databricks` status check) is always available in the UI, but running the SQL statement requires a configured warehouse.

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
│   ├── analyses/route.js             # Batch analysis map from Vercel Blob
│   ├── search/route.js               # Marengo semantic search
│   ├── videos/route.js               # Video index fetching + caching
│   ├── upload/route.js               # Client-side upload token (Vercel Blob)
│   ├── embeddings/route.js           # Marengo segment embeddings (cached)
│   ├── adInventory/route.js          # Ad inventory with vectors
│   ├── affinityMatching/route.js     # User → ad affinity scoring
│   ├── generateAdPlan/route.js       # Two-pass cast + scene analysis
│   ├── generateVideoSummary/route.js # Quick Pegasus ad summary
│   ├── hls-proxy/route.js            # Same-origin HLS proxy for CloudFront
│   └── databricks/
│       ├── route.js                  # GET — checks Databricks config status
│       ├── export/route.js           # POST — runs SQL export to Delta table
│       └── _lib/runSql.js            # @databricks/sql session helper
│
├── lib/
│   ├── adPlacementEngine.ts          # Core scoring engine (pure functions)
│   ├── databricksExportSql.ts        # SQL builder for ad_metadata_* Delta tables
│   ├── marengoAdEmbedding.ts         # Clip-avg Marengo vector helpers
│   ├── types.ts                      # Shared TypeScript interfaces
│   ├── videoCache.ts                 # localStorage video cache hook
│   ├── hlsClientConfig.ts            # HLS.js config for proxy + CloudFront
│   └── adInventoryStore.ts           # Ad category store (client-side)
│
└── components/
    ├── VideoCard.tsx                 # Video card with hover preview + search match
    ├── SegmentTimeline.tsx           # Scene segment timeline visualization
    ├── EmbeddingsView.tsx            # PCA scatter + Databricks metadata table
    ├── DatabricksExportModal.tsx     # Export modal — SQL preview + run status
    ├── AddCategoryModal.tsx          # Category/video upload modal
    ├── Sidebar.tsx                   # App navigation
    ├── SettingsModal.tsx             # Global settings
    └── VideoInventoryUploadModal.tsx # Upload modal (video inventory)
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
| Data Platform | Databricks Delta Lake + Mosaic AI Vector Search |
| SQL Driver | `@databricks/sql` (Databricks Node.js SDK) |

---

## Databricks Setup Guide

### How to Get Your Databricks Credentials

#### Personal Access Token (`DATABRICKS_TOKEN`)
1. In your Databricks workspace, go to **User Settings → Developer → Access Tokens**
2. Click **Generate new token**
3. Copy the token — it starts with `dapi`

#### Workspace Host (`DATABRICKS_HOST`)
- Found in the browser URL of your workspace: `https://<workspace-id>.cloud.databricks.com`
- Set `DATABRICKS_HOST` to the hostname only (no `https://`)

#### SQL Warehouse HTTP Path (`DATABRICKS_HTTP_PATH`)
1. Go to **Compute → SQL Warehouses**
2. Select your warehouse → **Connection details**
3. Copy the **HTTP path** (e.g. `/sql/1.0/warehouses/abc123`)

#### Catalog & Schema (`DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`)
- Open **Data Explorer** in your workspace
- Find a catalog and schema your user has `USE CATALOG`, `USE SCHEMA`, and `CREATE TABLE` permissions on
- Leave `DATABRICKS_CATALOG` empty to use the warehouse's default catalog (Unity Catalog)
- Set `DATABRICKS_SCHEMA` to the target schema name (default: `default`)

### What Gets Exported

For each ad category, the export creates/replaces a Delta table named:
```
<catalog>.<schema>.ad_metadata_<category_slug>
```

Delta table schema:

| Column | Type | Source |
|---|---|---|
| `creative_id` | STRING | Filename or TwelveLabs video ID |
| `campaign_name` | STRING | Pegasus proposed title |
| `duration_sec` | INT | Video duration in seconds |
| `extracted_visual_contexts` | STRING | Pegasus recommended contexts (JSON array) |
| `target_demographics` | STRING | Pegasus demographics (JSON array) |
| `negative_demographics` | STRING | Pegasus negative demographics (JSON array) |
| `target_audience_affinity` | STRING | Pegasus audience tiers (JSON object) |
| `negative_campaign_contexts` | STRING | Pegasus exclusions (JSON array) |
| `brand_safety_garm` | STRING | GARM flags (JSON array) |
| `marengo_embedding_json` | STRING | Clip-averaged Marengo vector (JSON float array) |
| `embedding_dim` | INT | Vector dimension (typically 512) |
| `embedding_model` | STRING | `twelvelabs_marengo` |
| `vector_sync_status` | STRING | `embedded_marengo_clip_avg` or `pending_no_marengo_segments` |

### Using Marengo Vectors in Mosaic AI Vector Search

```sql
-- Create embedding view for Mosaic AI Vector Search indexing
CREATE OR REPLACE VIEW ad_metadata_premium_spirits_vec AS
SELECT
  creative_id,
  campaign_name,
  from_json(marengo_embedding_json, 'array<double>') AS embedding
FROM main.default.ad_metadata_premium_spirits
WHERE vector_sync_status = 'embedded_marengo_clip_avg';
```

---

## Running in Production

```bash
npm run build
npm start
```

Or deploy to Vercel — all environment variables (including `DATABRICKS_*`) need to be set in the Vercel project settings.

---

## Contributing

1. Do not modify `strand/` — it's the canonical TwelveLabs design system
2. All new UI components should follow `docs/STRANDS_AGENT_RULES.md`
3. Run `npm run build` before committing to catch TypeScript errors

---

*Built by Nathan Che · Powered by [TwelveLabs](https://www.twelvelabs.io)*
