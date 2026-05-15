import { NextResponse } from "next/server";
import { listAllBlobs } from "../../lib/blobList";
import { VIDEO_LIST_BLOB_READ_PREFIXES, pickFresherCachedVideo } from "../../lib/videoListBlobPrefix";
import {
  finalizeSemanticTaxonomyIab,
  isSemanticDirectTaxonomyPayload,
  normalizeIabItemsFromUnknown,
  normalizeIabWithPolicy,
} from "../../lib/iabTaxonomy";
import { buildOpenRtbMappedView } from "../../lib/openRtbMapping";

export const dynamic = "force-dynamic";

function toSnakeCaseTag(input = "") {
  return String(input)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function getCategoryKeyFromSlug(slug) {
  const slugToCategoryKey = {
    "premium-spirits": "alcohol_premium",
    "automotive-truck": "automotive_truck",
    "cpg-snacks": "cpg_snacks",
    "financial-services": "financial_services",
  };
  return slugToCategoryKey[slug] ?? toSnakeCaseTag(slug);
}

function parseAnalysis(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === "string" || raw.data || raw.text) {
    const rawStr = typeof raw === "string" ? raw : (raw.data || raw.text || JSON.stringify(raw));
    const match = rawStr.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { return null; }
    }
  }
  return (parsed && typeof parsed === "object") ? parsed : null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    const videoBlobs = [];
    for (const p of VIDEO_LIST_BLOB_READ_PREFIXES) {
      videoBlobs.push(...(await listAllBlobs(p)));
    }
    const byVideoId = new Map();
    for (const blob of videoBlobs) {
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        const arr = await res.json();
        if (!Array.isArray(arr)) continue;
        for (const video of arr) {
          if (!video?.id) continue;
          const prev = byVideoId.get(video.id);
          byVideoId.set(video.id, pickFresherCachedVideo(prev, video));
        }
      } catch {
        // ignore malformed blob payloads
      }
    }

    const videosForSlug = [...byVideoId.values()].filter((video) => {
      try {
        const meta = JSON.parse(video.userMetadata || "{}");
        return meta.slug === slug;
      } catch {
        return false;
      }
    });

    const analysisBlobs = await listAllBlobs("analysis_v5_");
    const analysesByVideoId = new Map();
    for (const blob of analysisBlobs) {
      const match = blob.pathname.match(/^analysis_v5_([^_]+)_/);
      const videoId = match?.[1];
      if (!videoId) continue;
      const prior = analysesByVideoId.get(videoId);
      if (!prior || new Date(blob.uploadedAt).getTime() > new Date(prior.uploadedAt).getTime()) {
        analysesByVideoId.set(videoId, blob);
      }
    }

    const categoryKey = getCategoryKeyFromSlug(slug);
    const items = [];

    for (const video of videosForSlug) {
      const blob = analysesByVideoId.get(video.id);
      if (!blob) continue;

      let parsed = null;
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        parsed = parseAnalysis(await res.json());
      } catch {
        continue;
      }
      if (!parsed) continue;

      const rawIab = normalizeIabItemsFromUnknown(parsed.iab);
      const policy = isSemanticDirectTaxonomyPayload(rawIab)
        ? finalizeSemanticTaxonomyIab(rawIab)
        : normalizeIabWithPolicy(rawIab, categoryKey);
      const recommendedContexts = Array.isArray(parsed.recommendedContexts) ? parsed.recommendedContexts : [];
      const negativeCampaignContexts = Array.isArray(parsed.negativeCampaignContexts) ? parsed.negativeCampaignContexts : [];
      const brandSafety = Array.isArray(parsed.brandSafetyGARM) ? parsed.brandSafetyGARM : [];
      let meta = {};
      try { meta = JSON.parse(video.userMetadata || "{}"); } catch { meta = {}; }
      const duration = Math.round(video.systemMetadata?.duration || 0);

      const freewheelPayload = {
        ad_server: "Freewheel",
        endpoint: "https://ads.freewheel.tv/ad/p/1",
        generated_kvps: {
          vw_brand: String(parsed.company || "unknown").toLowerCase().replace(/\s+/g, "_"),
          vw_ctx_inc: [
            ...(String(meta.targetContexts || "").split(", ").filter(Boolean)),
            ...recommendedContexts,
          ].map((x) => String(x).toLowerCase().replace(/\s+/g, "_")).join(","),
          vw_ctx_exc: [
            ...(String(meta.exclusions || "").split(", ").filter(Boolean)),
            ...negativeCampaignContexts,
            ...brandSafety,
          ].map((x) => String(x).toLowerCase().replace(/\s+/g, "_")).join(","),
          vw_garm_floor: "strict",
          vw_duration: String(duration),
          vw_ad_title: parsed.proposedTitle || "untitled",
          vw_iab_t1: policy.effectiveTier1.join(","),
          vw_iab_t2: policy.effectiveTier2.join(","),
          vw_iab_t3: policy.effectiveTier3.join(","),
          vw_iab_t4: policy.effectiveTier4.join(","),
          vw_iab_codes: policy.effectiveCodes.join(","),
          vw_iab_conf: policy.averageConfidence.toFixed(3),
        },
      };

      const openRtbPayload = buildOpenRtbMappedView({
        freewheelPayload,
        categorySlug: slug,
        contentTitle: parsed.proposedTitle || video.systemMetadata?.filename || video.id,
        fallbackApplied: policy.fallbackApplied,
        fallbackReason: policy.fallbackReason,
      });

      items.push({
        videoId: video.id,
        filename: video.systemMetadata?.filename || "",
        normalizedIab: policy.normalizedItems,
        effectiveIab: {
          tier1: policy.effectiveTier1,
          tier2: policy.effectiveTier2,
          tier3: policy.effectiveTier3,
          codes: policy.effectiveCodes,
          averageConfidence: policy.averageConfidence.toFixed(3),
          fallbackApplied: policy.fallbackApplied,
          fallbackReason: policy.fallbackReason,
        },
        freewheelPayload,
        openRtbMapped: openRtbPayload,
      });
    }

    return NextResponse.json({
      slug,
      categoryKey,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    });
  } catch (error) {
    console.error("[adInventoryIabExport] Error:", error);
    return NextResponse.json({ error: "Failed to build IAB export artifact." }, { status: 500 });
  }
}
