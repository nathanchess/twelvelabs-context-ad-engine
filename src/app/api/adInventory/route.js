import { NextResponse } from "next/server";
import { listAllBlobs } from "../../lib/blobList";
import { VIDEO_LIST_BLOB_READ_PREFIXES, pickFresherCachedVideo } from "../../lib/videoListBlobPrefix";

export const dynamic = "force-dynamic";

/** Matches analysis_v5_<videoId>_<contractHash>.json */
const V5_VIDEO_ID_RE = /^analysis_v5_([^_]+)_/;

const SLUG_TO_CATEGORY_KEY = {
  "premium-spirits": "alcohol_premium",
  "automotive-truck": "automotive_truck",
  "automotive-luxury": "automotive_luxury",
  "cpg-snacks": "cpg_snacks",
  "financial-services": "financial_services",
};

const CATEGORY_COHORT_TAGS = {
  alcohol_premium: [
    "premium_spirits", "luxury_goods", "fine_dining",
    "celebration", "upscale_social", "travel_luxury",
  ],
  automotive_truck: [
    "outdoor_adventure", "diy", "home_improvement",
    "utility_vehicle", "construction", "sports_enthusiasts",
  ],
  automotive_luxury: [
    "sports_car", "performance_auto", "luxury_goods",
    "premium_lifestyle", "car_enthusiast",
  ],
  cpg_snacks: [
    "snacking", "value_shopper", "family_friendly",
    "sports_viewing", "gaming",
  ],
  financial_services: [
    "planning", "investing", "retirement",
    "future_focused", "high_hhi",
  ],
};

/**
 * Average an array of equal-length float vectors into one vector.
 * Returns null if input is empty or malformed.
 */
function averageVectors(vectors) {
  const valid = vectors.filter((v) => Array.isArray(v) && v.length > 0);
  if (valid.length === 0) return null;
  const dim = valid[0].length;
  const avg = new Array(dim).fill(0);
  for (const vec of valid) {
    for (let i = 0; i < dim; i++) avg[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) avg[i] /= valid.length;
  return avg;
}

function toSnakeCaseTag(input) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function deriveVideoCohortTags(summary, contexts) {
  const corpus = `${summary || ""}\n${(contexts || []).join("\n")}`.toLowerCase();
  const KEYWORD_TO_TAGS = [
    { re: /\b(healthy|health\s*&\s*wellness|wellness|clean label|high[-\s]?protein|protein)\b/i, tags: ["health_wellness", "fitness_wellness", "clean_label", "high_protein"] },
    { re: /\b(snack|snacking|on[-\s]?the[-\s]?go|convenien)/i, tags: ["snacking", "convenience"] },
    { re: /\b(sports car|performance|horsepower|turbo|premium interior)\b/i, tags: ["sports_car", "performance_auto", "car_enthusiast"] },
    { re: /\b(truck|pickup|towing|off[-\s]?road|construction|outdoor|adventure)\b/i, tags: ["utility_vehicle", "outdoor_adventure"] },
    { re: /\b(whiskey|bourbon|scotch|vodka|cocktail|bar|celebration|luxury|premium)\b/i, tags: ["premium_spirits", "celebration", "upscale_social", "premium_lifestyle"] },
    { re: /\b(investing|retirement|portfolio|savings|financial)\b/i, tags: ["planning", "investing", "retirement"] },
    { re: /\b(gen[-\s]?z|college|campus|gaming|esports)\b/i, tags: ["gen_z", "gaming"] },
  ];
  const derived = [];
  for (const rule of KEYWORD_TO_TAGS) {
    if (rule.re.test(corpus)) derived.push(...rule.tags);
  }
  return [...new Set(derived)];
}

function parseAnalysis(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === "string" || raw.data || raw.text) {
    const rawStr = typeof raw === "string" ? raw : (raw.data || raw.text || JSON.stringify(raw));
    const jsonMatch = rawStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { return null; }
    }
  }
  return parsed && typeof parsed === "object" ? parsed : null;
}

/**
 * GET /api/adInventory
 * Returns the full ad inventory as AdInventoryItem[] by merging:
 * - Video metadata from Vercel Blob cache
 * - Analysis data from Vercel Blob cache
 */
export async function GET() {
  try {
    // 1. Fetch cached video list for the ads index
    const videoBlobs = [];
    for (const p of VIDEO_LIST_BLOB_READ_PREFIXES) {
      videoBlobs.push(...(await listAllBlobs(p)));
    }

    let allVideos = [];
    for (const blob of videoBlobs) {
      try {
        const res = await fetch(blob.url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) allVideos.push(...data);
        }
      } catch { /* skip */ }
    }

    const deduped = [];
    const byId = new Map();
    for (const v of allVideos) {
      if (!v?.id) continue;
      const prev = byId.get(v.id);
      byId.set(v.id, pickFresherCachedVideo(prev, v));
    }
    for (const v of byId.values()) deduped.push(v);
    allVideos = deduped;

    // Filter to only ad-index videos (those with userMetadata containing a slug)
    const adVideos = allVideos.filter((v) => {
      try {
        const meta = JSON.parse(v.userMetadata || "{}");
        return !!meta.slug;
      } catch {
        return false;
      }
    });

    // 2. Newest analysis_v5 blob per videoId (same rule as /api/analyses, IAB export; video list blobs: videoListBlobPrefix.js)
    const analysisBlobs = await listAllBlobs("analysis_v5_");
    const analysesByVideoId = new Map();
    for (const blob of analysisBlobs) {
      const match = blob.pathname.match(V5_VIDEO_ID_RE);
      const videoId = match?.[1];
      if (!videoId) continue;
      const prior = analysesByVideoId.get(videoId);
      if (
        !prior ||
        new Date(blob.uploadedAt).getTime() > new Date(prior.uploadedAt).getTime()
      ) {
        analysesByVideoId.set(videoId, blob);
      }
    }

    const analysisMap = {};
    await Promise.all(
      [...analysesByVideoId.values()].map(async (blob) => {
        const match = blob.pathname.match(V5_VIDEO_ID_RE);
        const videoId = match?.[1];
        if (!videoId) return;
        try {
          const res = await fetch(blob.url);
          if (res.ok) {
            const raw = await res.json();
            const parsed = parseAnalysis(raw);
            if (parsed) analysisMap[videoId] = parsed;
          }
        } catch { /* skip */ }
      })
    );

    // 3. Build AdInventoryItem[] by merging video + analysis + category
    const inventory = adVideos.map((video) => {
      let meta = {};
      try {
        meta = JSON.parse(video.userMetadata || "{}");
      } catch { /* empty */ }

      const slug = meta.slug || "";
      const category_key = SLUG_TO_CATEGORY_KEY[slug] || toSnakeCaseTag(slug);
      const analysis = analysisMap[video.id] || null;

      const targetAudience = analysis?.targetAudience;
      const targetAudienceTags = targetAudience
        ? Array.from(new Set(
            typeof targetAudience === "string"
              ? targetAudience.split(",").map((s) => toSnakeCaseTag(s.trim())).filter(Boolean)
              : [
                  ...(targetAudience.highPriority ?? []).map(toSnakeCaseTag),
                  ...(targetAudience.mediumPriority ?? []).map(toSnakeCaseTag),
                  ...(targetAudience.lowPriority ?? []).map(toSnakeCaseTag),
                ]
          ))
        : [];

      const categoryTags = CATEGORY_COHORT_TAGS[category_key] ?? [];
      const videoDerivedTags = analysis
        ? deriveVideoCohortTags(analysis.summary || "", analysis.recommendedContexts || [])
        : [];

      const cohort_affinities = [
        ...new Set([...categoryTags, ...videoDerivedTags, ...targetAudienceTags]),
      ];

      // Average all TwelveLabs clip embeddings into a single ad-level vector.
      // embedding_segments is populated by /api/videos (videos/route.js).
      const adVector = averageVectors(
        (video.embedding_segments ?? []).map((s) => s.vector).filter(Boolean)
      );

      return {
        id: video.id,
        brand: analysis?.company || meta.brand || "Unknown",
        category_key,
        slug,
        asset_url: video.hls?.videoUrl || "",
        thumbnailUrl: video.hls?.thumbnailUrls?.[0] || "",
        targetContexts: analysis?.recommendedContexts || meta.targetContexts?.split(", ").filter(Boolean) || [],
        negativeCampaignContexts: analysis?.negativeCampaignContexts || [],
        targetDemographics: analysis?.targetDemographics || [],
        negativeDemographics: analysis?.negativeDemographics || [],
        cohort_affinities,
        brandSafetyGARM: analysis?.brandSafetyGARM || [],
        priority: 1,
        summary: analysis?.summary || "",
        proposedTitle: analysis?.proposedTitle || meta.title || "",
        vector: adVector ?? undefined,
      };
    });

    return NextResponse.json(inventory, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[adInventory] Error:", error);
    return NextResponse.json(
      { error: "Failed to build ad inventory" },
      { status: 500 }
    );
  }
}
