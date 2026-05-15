import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { listAllBlobs } from "../../lib/blobList";
import { VIDEO_LIST_BLOB_READ_PREFIXES } from "../../lib/videoListBlobPrefix";
import { getIndexId, getTwelveLabsClient } from "../../lib/twelvelabs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_VERSION = "v1";

/**
 * Average an array of equal-length float vectors into a single vector.
 * Returns null if the input is empty or malformed.
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

/**
 * GET /api/embeddings?videoId=xxx
 *
 * Returns TwelveLabs Marengo embedding vectors averaged per scene segment.
 *
 * Flow:
 *  1. Check Vercel Blob for cached result (segment_embeddings_v1_{id}.json)
 *  2. Search all api_video_cache_v2_*.json blobs for the matching videoId
 *     (the videos/route.js already caches embedding_segments with vectors)
 *  3. Load the cached scene segment plan (ad_plan_timeline_v1_{id}.json)
 *  4. For each scene segment, find TwelveLabs clip embeddings whose midpoint
 *     falls within the segment's [start_time, end_time) and average them
 *  5. Cache and return { segments: { [sceneIndex]: number[] } }
 *
 * Gracefully returns { segments: {} } when data is missing rather than erroring.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  const cacheKey = `segment_embeddings_${CACHE_VERSION}_${videoId}.json`;

  // ── 1. Check cache ────────────────────────────────────────
  try {
    const blobs = await listAllBlobs(cacheKey);
    if (blobs.length > 0) {
      const best = blobs.reduce((a, b) =>
        new Date(a.uploadedAt).getTime() > new Date(b.uploadedAt).getTime() ? a : b
      );
      const res = await fetch(best.url);
      if (res.ok) {
        const data = await res.json();
        if (data?.segments && Object.keys(data.segments).length > 0) {
          console.log(`[embeddings] Cache HIT for ${videoId}`);
          return NextResponse.json(data);
        }
      }
    }
  } catch {
    // Cache miss — continue
  }

  // ── 2. Find video embedding_segments in the video cache ──
  let clipEmbeddings = null; // [{ startOffsetSec, endOffsetSec, vector }]

  try {
    const videoBlobs = [];
    for (const p of VIDEO_LIST_BLOB_READ_PREFIXES) {
      videoBlobs.push(...(await listAllBlobs(p)));
    }
    videoBlobs.sort((a, b) => {
      const rank = (pathname) =>
        String(pathname || "").includes("api_video_cache_v4_") ? 1 : 0;
      return rank(b.pathname) - rank(a.pathname);
    });

    for (const blob of videoBlobs) {
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        const videos = await res.json();
        if (!Array.isArray(videos)) continue;

        const match = videos.find((v) => v.id === videoId);
        if (match?.embedding_segments?.length > 0) {
          clipEmbeddings = match.embedding_segments;
          console.log(`[embeddings] Found ${clipEmbeddings.length} clip embeddings for ${videoId}`);
          break;
        }
      } catch {
        // Skip malformed blobs
      }
    }
  } catch (err) {
    console.error("[embeddings] Error searching video cache:", err);
  }

  if (!clipEmbeddings) {
    // Metadata-only /api/videos responses intentionally omit embeddings.
    // Fall back to a direct single-video fetch so detail pages can still load vectors on demand.
    const client = getTwelveLabsClient();
    const candidateIndexes = ["tl-context-engine-videos", "tl-context-engine-ads"];

    for (const indexName of candidateIndexes) {
      try {
        const indexId = await getIndexId(indexName);
        const videoData = await client.indexes.videos.retrieve(indexId, videoId, {
          embeddingOption: ["visual", "audio", "transcription"],
        });
        const segments = videoData?.embedding?.videoEmbedding?.segments || [];
        if (segments.length > 0) {
          clipEmbeddings = segments.map((seg) => ({
            startOffsetSec: seg.startOffsetSec,
            endOffsetSec: seg.endOffsetSec,
            vector: seg.float,
          }));
          console.log(`[embeddings] Direct fetch recovered ${clipEmbeddings.length} clip embeddings for ${videoId}`);
          break;
        }
      } catch {
        // Ignore index misses and try next index.
      }
    }
  }

  if (!clipEmbeddings) {
    console.warn(`[embeddings] No embedding data found for ${videoId}.`);
    return NextResponse.json({ segments: {}, message: "No embedding data available for this video." });
  }

  // ── 3. Load scene segment plan ───────────────────────────
  let sceneSegments = null;

  try {
    const planKey = `ad_plan_timeline_v1_${videoId}.json`;
    const planBlobs = await listAllBlobs(planKey);
    if (planBlobs.length > 0) {
      const bestPlan = planBlobs.reduce((a, b) =>
        new Date(a.uploadedAt).getTime() > new Date(b.uploadedAt).getTime() ? a : b
      );
      const res = await fetch(bestPlan.url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.segments) && data.segments.length > 0) {
          sceneSegments = data.segments;
        }
      }
    }
  } catch (err) {
    console.error("[embeddings] Error loading scene plan:", err);
  }

  if (!sceneSegments) {
    return NextResponse.json({
      segments: {},
      message: "Scene plan not found. Run generateAdPlan first.",
    });
  }

  // ── 4. Map clip embeddings → scene segments ──────────────
  // For each scene segment, collect clip embeddings whose midpoint falls
  // within [start_time, end_time). Average them into one scene-level vector.
  const result = {};

  for (let i = 0; i < sceneSegments.length; i++) {
    const { start_time, end_time } = sceneSegments[i];

    const overlapping = clipEmbeddings.filter((clip) => {
      if (!Array.isArray(clip.vector) || clip.vector.length === 0) return false;
      const mid = (clip.startOffsetSec + clip.endOffsetSec) / 2;
      return mid >= start_time && mid < end_time;
    });

    if (overlapping.length > 0) {
      const avg = averageVectors(overlapping.map((c) => c.vector));
      if (avg) result[i] = avg;
    } else {
      // Fallback: use the clip whose midpoint is closest to this segment's midpoint
      const sceneMid = (start_time + end_time) / 2;
      const validClips = clipEmbeddings.filter(
        (c) => Array.isArray(c.vector) && c.vector.length > 0
      );
      if (validClips.length > 0) {
        const closest = validClips.reduce((best, clip) => {
          const clipMid = (clip.startOffsetSec + clip.endOffsetSec) / 2;
          const bestMid = (best.startOffsetSec + best.endOffsetSec) / 2;
          return Math.abs(clipMid - sceneMid) < Math.abs(bestMid - sceneMid) ? clip : best;
        }, validClips[0]);
        result[i] = closest.vector;
      }
    }
  }

  console.log(
    `[embeddings] Mapped ${Object.keys(result).length}/${sceneSegments.length} segments for ${videoId}`
  );

  const payload = {
    segments: result,
    segmentCount: sceneSegments.length,
    clipCount: clipEmbeddings.length,
    vectorDim: Object.values(result)[0]?.length ?? 0,
  };

  // ── 5. Cache the result ───────────────────────────────────
  try {
    await put(cacheKey, JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error("[embeddings] Cache write failed (non-fatal):", err);
  }

  return NextResponse.json(payload);
}
