#!/usr/bin/env node
/**
 * Rename TwelveLabs indexed assets in the ad + video inventory indexes.
 *
 * TwelveLabs v1.3 does not allow changing systemMetadata.filename after upload.
 * This script writes canonical display names into user_metadata (merged with existing
 * fields) on both the indexed video and the underlying asset, and updates
 * src/app/lib/videoDisplayNames.json for the app UI.
 *
 * Usage:
 *   node scripts/rename-tl-assets.js              # apply renames
 *   node scripts/rename-tl-assets.js --dry-run      # preview only
 *   node scripts/rename-tl-assets.js --skip-analyze # skip Pegasus for unknown inventory clips
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { TwelvelabsApiClient, TwelveLabs } = require("twelvelabs-js");
const { list } = require("@vercel/blob");

const TL_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_ADS = "tl-context-engine-ads";
const INDEX_VIDEOS = "tl-context-engine-videos";

const SLUG_BRANDS = {
    "premium-spirits": ["Macallan", "Grey Goose", "Johnnie Walker", "Patrón"],
    "automotive-truck": ["Ford F-150", "RAM", "Chevrolet Silverado", "GMC Sierra"],
    "automotive-luxury": ["BMW", "Mercedes-Benz", "Audi", "Porsche"],
    "cpg-snacks": ["Doritos", "Oreo", "Lay's", "Cheetos"],
    "financial-services": ["Fidelity", "Charles Schwab", "Vanguard", "Morgan Stanley"],
};

const AD_CAMPAIGN_NAMES = [
    "Hero Spot",
    "Brand Story",
    "Product Feature",
    "Lifestyle Moment",
    "Campaign Highlight",
    "Seasonal Push",
];

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const SKIP_ANALYZE = args.has("--skip-analyze");
const DISPLAY_NAMES_JSON = path.join(__dirname, "..", "src", "app", "lib", "videoDisplayNames.json");
const displayNameMapping = {};

if (!process.env.TL_API_KEY) {
    console.error("Missing TL_API_KEY in .env");
    process.exit(1);
}

const api = new TwelvelabsApiClient({ apiKey: process.env.TL_API_KEY });
const analyzeClient = new TwelveLabs({ apiKey: process.env.TL_API_KEY });

const slugBrandCounters = new Map();
const analyzeCache = new Map();

function sanitizeDisplayName(value) {
    return String(value || "")
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function stripExtension(filename) {
    return String(filename || "").replace(/\.[^.]+$/, "").trim();
}

function parseAnalysisPayload(raw) {
    if (!raw) return null;
    let data = raw.data ?? raw;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            const match = data.match(/\{[\s\S]*\}/);
            if (!match) return null;
            try {
                data = JSON.parse(match[0]);
            } catch {
                return null;
            }
        }
    }
    return data && typeof data === "object" ? data : null;
}

async function loadAnalysisMap() {
    const map = new Map();
    let cursor;
    do {
        const res = await list({ prefix: "analysis_v5_", limit: 1000, cursor });
        for (const blob of res.blobs) {
            const match = blob.pathname.match(/^analysis_v5_([^_]+)_/);
            if (!match) continue;
            const videoId = match[1];
            const prior = map.get(videoId);
            if (!prior || new Date(blob.uploadedAt) > new Date(prior.uploadedAt)) {
                map.set(videoId, blob);
            }
        }
        cursor = res.cursor;
    } while (cursor);

    const parsed = new Map();
    for (const [videoId, blob] of map.entries()) {
        try {
            const res = await fetch(blob.url);
            if (!res.ok) continue;
            const raw = await res.json();
            const data = parseAnalysisPayload(raw);
            if (data) parsed.set(videoId, data);
        } catch {
            /* skip corrupt blob */
        }
    }
    return parsed;
}

async function getIndexId(indexName) {
    for await (const index of await api.indexes.list()) {
        if (index.indexName === indexName) return index.id;
    }
    throw new Error(`Index not found: ${indexName}`);
}

async function listAllVideos(indexId) {
    const videos = [];
    const pager = await api.indexes.videos.list(indexId, { pageLimit: 50 });
    for await (const video of pager) {
        const full = await api.indexes.videos.retrieve(indexId, video.id);
        videos.push(full);
    }
    return videos;
}

function nextBrandForSlug(slug) {
    const brands = SLUG_BRANDS[slug] || ["Brand"];
    const count = slugBrandCounters.get(slug) || 0;
    slugBrandCounters.set(slug, count + 1);
    return brands[count % brands.length];
}

function buildAdDisplayName(video, analysis) {
    const meta = video.userMetadata && typeof video.userMetadata === "object" ? video.userMetadata : {};
    const slug = meta.slug || "campaign";
    const company = sanitizeDisplayName(
        analysis?.company ||
            meta.company ||
            nextBrandForSlug(slug),
    );
    const campaign = sanitizeDisplayName(
        analysis?.proposedTitle ||
            meta.adTitle ||
            meta.title ||
            AD_CAMPAIGN_NAMES[(slugBrandCounters.get(slug) || 0) % AD_CAMPAIGN_NAMES.length],
    );

    let display = campaign;
    if (company && !campaign.toLowerCase().includes(company.toLowerCase())) {
        display = `${company} - ${campaign}`;
    }

    return {
        displayName: display,
        company,
        adTitle: campaign,
    };
}

function parseInventoryFromFilename(filename) {
    const base = stripExtension(filename);
    if (!base) return null;

    // Show - Episode (Let's Make a Deal - Mulled Wine)
    const dashMatch = base.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (dashMatch) {
        return {
            showName: sanitizeDisplayName(dashMatch[1]),
            episodeTitle: sanitizeDisplayName(dashMatch[2]),
        };
    }

    // Show： Clip (Season N Clip) ｜ Network
    const pipeMatch = base.match(/^(.+?)[：:]\s*(.+?)(?:\s[｜|]\s.+)?$/);
    if (pipeMatch) {
        return {
            showName: sanitizeDisplayName(pipeMatch[1]),
            episodeTitle: sanitizeDisplayName(pipeMatch[2]),
        };
    }

    // episode3, kitchen_nightmares, joey
    const episodeNum = base.match(/^episode(\d+)$/i);
    if (episodeNum) {
        return {
            showName: "Kitchen Nightmares",
            episodeTitle: `Episode ${episodeNum[1]}`,
        };
    }

    if (/^kitchen[_\s-]?nightmares$/i.test(base)) {
        return { showName: "Kitchen Nightmares", episodeTitle: "Service Meltdown" };
    }

    if (/^joey$/i.test(base)) {
        return { showName: "Friends", episodeTitle: "Joey's Bad Birthday Gift" };
    }

    if (/^most-viewed family feud rounds of april/i.test(base)) {
        return { showName: "Family Feud", episodeTitle: "April 2026 Highlights" };
    }

    if (/^nab demo video$/i.test(base)) {
        return { showName: "NAB Demo", episodeTitle: "Sample Clip" };
    }

    if (/^videoplayback/i.test(base)) {
        return null;
    }

    // Single token filename -> treat as episode under title-cased show guess
    if (/^[a-z0-9_ -]+$/i.test(base) && !base.includes(" ")) {
        const showName = sanitizeDisplayName(base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
        return { showName, episodeTitle: "Featured Clip" };
    }

    return { showName: sanitizeDisplayName(base), episodeTitle: "Featured Clip" };
}

async function analyzeInventoryNames(videoId) {
    if (analyzeCache.has(videoId)) return analyzeCache.get(videoId);

    const prompt = `You are labeling TV inventory for a CTV ad platform.
Watch this video and return ONLY valid JSON with exactly these keys:
{
  "showName": "Primary series or program name",
  "episodeTitle": "Specific episode, segment, or descriptive clip title"
}
Use concise, broadcast-style titles. Do not wrap in markdown.`;

    try {
        const result = await analyzeClient.analyze(
            { videoId, prompt, temperature: 0.2 },
            { timeoutInSeconds: 120 },
        );
        const parsed = parseAnalysisPayload(result);
        const names = {
            showName: sanitizeDisplayName(parsed?.showName || parsed?.proposedTitle || "Unknown Show"),
            episodeTitle: sanitizeDisplayName(parsed?.episodeTitle || parsed?.summary?.slice(0, 80) || "Featured Clip"),
        };
        analyzeCache.set(videoId, names);
        return names;
    } catch (err) {
        console.warn(`  analyze failed for ${videoId}: ${err.message}`);
        const fallback = { showName: "Unknown Show", episodeTitle: "Featured Clip" };
        analyzeCache.set(videoId, fallback);
        return fallback;
    }
}

async function buildInventoryDisplayName(video) {
    const filename = video.systemMetadata?.filename || "";
    let parsed = parseInventoryFromFilename(filename);

    if (!parsed && !SKIP_ANALYZE) {
        console.log(`  analyzing ${video.id} (${filename})…`);
        parsed = await analyzeInventoryNames(video.id);
    }

    if (!parsed) {
        parsed = { showName: "Unknown Show", episodeTitle: stripExtension(filename) || "Featured Clip" };
    }

    const displayName = `${parsed.showName} - ${parsed.episodeTitle}`;
    return {
        displayName: sanitizeDisplayName(displayName),
        showName: parsed.showName,
        episodeTitle: parsed.episodeTitle,
    };
}

async function patchJson(url, body) {
    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            "x-api-key": process.env.TL_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${url} -> ${res.status} ${text}`);
    }
}

async function applyDisplayName(indexId, video, names, indexKind) {
    const existing =
        video.userMetadata && typeof video.userMetadata === "object" ? { ...video.userMetadata } : {};

    const merged = {
        ...existing,
        displayName: names.displayName,
        assetName: names.displayName,
        ...(indexKind === "ads"
            ? { company: names.company, adTitle: names.adTitle }
            : { showName: names.showName, episodeTitle: names.episodeTitle }),
    };

    if (DRY_RUN) {
        console.log(`  [dry-run] ${video.id}: "${existing.displayName || stripExtension(video.systemMetadata?.filename)}" -> "${names.displayName}"`);
        displayNameMapping[video.id] = names.displayName;
        return;
    }

    await patchJson(`${TL_BASE}/indexes/${indexId}/videos/${video.id}`, {
        user_metadata: merged,
    });

    const assetId = video.id;
    try {
        await patchJson(`${TL_BASE}/assets/${assetId}/user-metadata`, {
            user_metadata: {
                displayName: names.displayName,
                assetName: names.displayName,
            },
        });
    } catch (err) {
        console.warn(`  asset user-metadata skipped for ${video.id}: ${err.message}`);
    }

    console.log(`  updated ${video.id}: "${names.displayName}"`);
    displayNameMapping[video.id] = names.displayName;
}

async function processIndex(indexName, indexKind, analysisMap) {
    console.log(`\n=== ${indexName} (${indexKind}) ===`);
    const indexId = await getIndexId(indexName);
    const videos = await listAllVideos(indexId);
    console.log(`Found ${videos.length} indexed videos`);

    for (const video of videos) {
        const meta = video.userMetadata && typeof video.userMetadata === "object" ? video.userMetadata : {};

        if (indexKind === "ads") {
            if (meta.type !== "ad" && !meta.slug) continue;
            const analysis = analysisMap.get(video.id);
            const names = buildAdDisplayName(video, analysis);
            await applyDisplayName(indexId, video, names, indexKind);
            continue;
        }

        if (meta.type !== "inventory_video" && indexName === INDEX_VIDEOS) {
            // Still rename inventory index entries even if type missing
        }

        const names = await buildInventoryDisplayName(video);
        await applyDisplayName(indexId, video, names, indexKind);
    }
}

(async () => {
    console.log(DRY_RUN ? "DRY RUN — no writes" : "Applying renames…");
    if (SKIP_ANALYZE) console.log("Skipping Pegasus analyze for unknown inventory clips");

    const analysisMap = await loadAnalysisMap();
    console.log(`Loaded ${analysisMap.size} analysis blobs`);

    slugBrandCounters.clear();
    await processIndex(INDEX_ADS, "ads", analysisMap);

    slugBrandCounters.clear();
    await processIndex(INDEX_VIDEOS, "videos", analysisMap);

    const fs = require("fs");
    fs.writeFileSync(DISPLAY_NAMES_JSON, `${JSON.stringify(displayNameMapping, null, 2)}\n`);
    console.log(`\nWrote ${Object.keys(displayNameMapping).length} names to ${DISPLAY_NAMES_JSON}`);

    console.log("\nDone.");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
