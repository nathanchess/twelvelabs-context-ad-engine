import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { listAllBlobs } from "../../lib/blobList";
import { getIndexId, getTwelveLabsClient } from "../../lib/twelvelabs";
import { resolveAsyncAnalyzeVideo } from "../../lib/adInventorySemanticResolve";

export const maxDuration = 600;

const CACHE_VERSION = "v1";
const INVENTORY_INDEX_NAME = "tl-context-engine-videos";

/** Pegasus 1.5 segment_definitions — mirrors prompt_pegasus_test.js (flat fields → normalized to legacy nested shape in code). */
const PEGASUS_SEGMENT_DEFINITIONS = [
    {
        id: "scene",
        description:
            "A narratively or thematically cohesive segment suitable for CTV ad break planning. Group consecutive shots into the broadest meaningful unit rather than splitting on every visual change. Intros, recaps, title sequences, and cold opens each constitute a single segment regardless of internal cuts.",
        fields: [
            {
                name: "scene_context",
                type: "string",
                description: "One concise sentence describing the scene, referencing cast by name",
            },
            {
                name: "environment",
                type: "string",
                description: "Environment of the scene",
            },
            {
                name: "cast_present",
                type: "array",
                description: "Names of cast members visible or speaking",
                items: { type: "string" },
            },
            {
                name: "activities",
                type: "array",
                description: "Key activities in the scene. Title case.",
                items: { type: "string" },
            },
            {
                name: "objects_of_interest",
                type: "array",
                description: "Notable objects in the scene. Title case.",
                items: { type: "string" },
            },
            {
                name: "sentiment",
                type: "string",
                description: "Sentiment of the scene",
                enum: ["Positive", "Neutral", "Negative", "Mixed"],
            },
            {
                name: "emotional_intensity",
                type: "number",
                description: "Emotional intensity of the scene",
                minimum: 0,
                maximum: 1,
            },
            {
                name: "tone",
                type: "string",
                description: "Tone of the scene",
                enum: [
                    "Celebratory",
                    "Romantic",
                    "Tense",
                    "Comedic",
                    "Somber",
                    "Inspirational",
                    "Casual",
                    "Dramatic",
                    "Action",
                    "Informational",
                ],
            },
            {
                name: "brand_safety_is_safe",
                type: "boolean",
                description: "Whether the scene is safe for advertising.",
            },
            {
                name: "brand_safety_risk_level",
                type: "string",
                description: "Overall brand-safety risk level for the scene.",
                enum: ["Low", "Medium", "High"],
            },
            {
                name: "brand_safety_garm_flags",
                type: "array",
                description:
                    "GARM issues for this scene. Each entry is one pipe-delimited string: CATEGORY|SEVERITY|EVIDENCE where SEVERITY is one of Floor Violation, High Risk, Medium Risk, Low Risk. Use an empty array if none.",
                items: { type: "string", description: "One flag as CATEGORY|SEVERITY|EVIDENCE" },
            },
            {
                name: "ad_suitable_categories",
                type: "array",
                description: "Product or vertical categories that would suit ads in this scene.",
                items: { type: "string", description: "A suitable category label" },
            },
            {
                name: "ad_unsuitable_categories",
                type: "array",
                description: "Categories that would be a poor or unsafe fit for ads in this scene.",
                items: { type: "string", description: "An unsuitable category label" },
            },
            {
                name: "ad_contextual_themes",
                type: "array",
                description: "Short contextual theme labels for ad targeting (e.g. sports, family, finance).",
                items: { type: "string", description: "A theme label" },
            },
            {
                name: "ad_suitability_confidence",
                type: "number",
                description: "Model confidence (0–1) for the suitability judgments above.",
                minimum: 0,
                maximum: 1,
            },
            {
                name: "ad_break_post_segment_break_quality",
                type: "string",
                description: "Quality of a hypothetical ad break immediately after this segment.",
                enum: ["High", "Medium", "Low"],
            },
            {
                name: "ad_break_break_type",
                type: "string",
                description: "How the scene transitions at the end (relevant to placing an ad break).",
                enum: ["Hard Cut", "Fade", "Narrative Pause", "Topic Shift", "None"],
            },
            {
                name: "ad_break_interruption_risk",
                type: "number",
                description: "How jarring an ad would feel at segment end (0 = seamless, 1 = very disruptive).",
                minimum: 0,
                maximum: 1,
            },
            {
                name: "ad_break_reasoning",
                type: "string",
                description: "Brief reasoning for ad break fitness scores, referencing concrete scene content.",
            },
        ],
    },
];

const LEGACY_ENVIRONMENTS = [
    "Indoor Home",
    "Indoor Office",
    "Indoor Bar Restaurant",
    "Indoor Retail",
    "Indoor Venue",
    "Outdoor Urban",
    "Outdoor Nature",
    "Outdoor Adventure",
    "Outdoor Sports Venue",
    "Vehicle",
    "Studio",
    "Other",
];

const GARM_SEVERITIES = ["Floor Violation", "High Risk", "Medium Risk", "Low Risk"];

function clampUnitInterval(value) {
    const n = typeof value === "number" && !Number.isNaN(value) ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    let x = n;
    if (x > 1) x = x / 10;
    if (x > 1) x = 1;
    if (x < 0) x = 0;
    return x;
}

function snapEnvironment(raw) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) return "Other";
    const exact = LEGACY_ENVIRONMENTS.find((e) => e.toLowerCase() === s.toLowerCase());
    if (exact) return exact;
    const lower = s.toLowerCase();
    if (lower.includes("studio")) return "Studio";
    if (lower.includes("vehicle") || lower.includes("car")) return "Vehicle";
    if (lower.includes("arena") || lower.includes("stadium") || lower.includes("sports")) return "Outdoor Sports Venue";
    if (lower.includes("beach") || lower.includes("ocean") || lower.includes("jungle") || lower.includes("island") || lower.includes("camp"))
        return "Outdoor Nature";
    if (lower.includes("challenge") || lower.includes("outdoor")) return "Outdoor Adventure";
    if (lower.includes("urban") || lower.includes("city")) return "Outdoor Urban";
    if (lower.includes("office")) return "Indoor Office";
    if (lower.includes("restaurant") || lower.includes("bar")) return "Indoor Bar Restaurant";
    if (lower.includes("retail") || lower.includes("shop")) return "Indoor Retail";
    if (lower.includes("venue") || lower.includes("tribal") || lower.includes("council")) return "Indoor Venue";
    if (lower.includes("home")) return "Indoor Home";
    return "Other";
}

function normalizeGarmSeverity(s) {
    const t = typeof s === "string" ? s.trim() : "";
    if (GARM_SEVERITIES.includes(t)) return t;
    const lower = t.toLowerCase();
    if (lower.includes("floor")) return "Floor Violation";
    if (lower.includes("high")) return "High Risk";
    if (lower.includes("medium")) return "Medium Risk";
    if (lower.includes("low")) return "Low Risk";
    return "Low Risk";
}

function parseGarmPipeStrings(items) {
    if (!Array.isArray(items)) return [];
    const out = [];
    for (const row of items) {
        if (typeof row !== "string" || !row.trim()) continue;
        const parts = row.split("|").map((p) => p.trim());
        if (parts.length < 3) continue;
        const category = parts[0] || "Unknown";
        const severity = normalizeGarmSeverity(parts[1]);
        const evidence = parts.slice(2).join("| ").trim() || "";
        out.push({ category, severity, evidence });
    }
    return out;
}

function pegasusRowToLegacySegment(row) {
    const md = row && typeof row === "object" && row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const start = row?.start_time ?? row?.startTime;
    const end = row?.end_time ?? row?.endTime;

    const brand_safety = {
        is_safe: Boolean(md.brand_safety_is_safe),
        risk_level: ["Low", "Medium", "High"].includes(md.brand_safety_risk_level) ? md.brand_safety_risk_level : "Low",
        garm_flags: parseGarmPipeStrings(md.brand_safety_garm_flags),
    };

    const ad_suitability = {
        suitable_categories: Array.isArray(md.ad_suitable_categories) ? md.ad_suitable_categories : [],
        unsuitable_categories: Array.isArray(md.ad_unsuitable_categories) ? md.ad_unsuitable_categories : [],
        contextual_themes: Array.isArray(md.ad_contextual_themes) ? md.ad_contextual_themes : [],
        confidence: clampUnitInterval(md.ad_suitability_confidence),
    };

    const ad_break_fitness = {
        post_segment_break_quality: ["High", "Medium", "Low"].includes(md.ad_break_post_segment_break_quality)
            ? md.ad_break_post_segment_break_quality
            : "Medium",
        break_type: ["Hard Cut", "Fade", "Narrative Pause", "Topic Shift", "None"].includes(md.ad_break_break_type)
            ? md.ad_break_break_type
            : "None",
        interruption_risk: clampUnitInterval(md.ad_break_interruption_risk),
        reasoning: typeof md.ad_break_reasoning === "string" ? md.ad_break_reasoning : "",
    };

    const toneSet = new Set([
        "Celebratory",
        "Romantic",
        "Tense",
        "Comedic",
        "Somber",
        "Inspirational",
        "Casual",
        "Dramatic",
        "Action",
        "Informational",
    ]);
    const sentimentSet = new Set(["Positive", "Neutral", "Negative", "Mixed"]);

    return {
        start_time: typeof start === "number" ? start : Number(start) || 0,
        end_time: typeof end === "number" ? end : Number(end) || 0,
        scene_context: typeof md.scene_context === "string" ? md.scene_context : "",
        environment: snapEnvironment(md.environment),
        cast_present: Array.isArray(md.cast_present) ? md.cast_present : [],
        activities: Array.isArray(md.activities) ? md.activities : [],
        objects_of_interest: Array.isArray(md.objects_of_interest) ? md.objects_of_interest : [],
        sentiment: sentimentSet.has(md.sentiment) ? md.sentiment : "Neutral",
        emotional_intensity: clampUnitInterval(md.emotional_intensity),
        tone: toneSet.has(md.tone) ? md.tone : "Informational",
        brand_safety,
        ad_suitability,
        ad_break_fitness,
    };
}

function deriveCastFromSegments(segments) {
    const names = new Set();
    for (const seg of segments) {
        const cp = seg?.cast_present;
        if (!Array.isArray(cp)) continue;
        for (const n of cp) {
            if (typeof n === "string" && n.trim()) names.add(n.trim());
        }
    }
    return [...names].map((name) => ({
        name,
        description: "Identified from Pegasus scene timeline.",
    }));
}

function parsePegasusTaskData(rawData) {
    if (rawData == null) return [];
    let obj = rawData;
    if (typeof obj === "string") {
        try {
            obj = JSON.parse(obj);
        } catch {
            return [];
        }
    }
    const scene = obj?.scene ?? obj?.scenes;
    return Array.isArray(scene) ? scene : [];
}

function unwrapMaybeData(res) {
    if (res && typeof res === "object" && res.data != null) {
        return res.data;
    }
    return res;
}

/**
 * New / cache-miss path: Pegasus 1.5 async time_based_metadata (same contract as prompt_pegasus_test.js).
 * Video must be `{ type: "asset_id", assetId }` for indexed TwelveLabs assets (HLS .m3u8 URLs are not valid `url` input).
 */
async function runPegasusInventoryAdPlan(tlClient, video) {
    const createRes = await tlClient.analyzeAsync.tasks.create(
        {
            modelName: "pegasus1.5",
            video,
            analysisMode: "time_based_metadata",
            responseFormat: {
                type: "segment_definitions",
                segmentDefinitions: PEGASUS_SEGMENT_DEFINITIONS,
            },
            maxTokens: 65536,
        },
        { timeoutInSeconds: 120 },
    );

    const created = unwrapMaybeData(createRes);
    const taskId = created?.taskId;
    if (!taskId) {
        throw new Error("TwelveLabs analyzeAsync did not return a task id");
    }

    const pollStart = Date.now();
    const maxWaitMs = Math.max(120000, (Number(process.env.GENERATE_AD_PLAN_PEGASUS_MAX_MS) || 540000));

    while (Date.now() - pollStart < maxWaitMs) {
        const pollRes = await tlClient.analyzeAsync.tasks.retrieve(taskId, { timeoutInSeconds: 90 });
        const task = unwrapMaybeData(pollRes);
        const status = task?.status;

        if (status === "ready") {
            const rawData = task?.result?.data;
            const rows = parsePegasusTaskData(rawData);
            const segments = rows.map(pegasusRowToLegacySegment).sort((a, b) => a.start_time - b.start_time);
            const cast = deriveCastFromSegments(segments);
            return { cast, segments };
        }
        if (status === "failed") {
            const msg = task?.error?.message || `Pegasus task ${taskId} failed`;
            throw new Error(msg);
        }
        await new Promise((r) => setTimeout(r, 5000));
    }

    throw new Error("Pegasus analysis timed out while waiting for task completion");
}

export async function POST(request) {
    const tl_client = getTwelveLabsClient();
    const { videoId } = await request.json();

    if (!videoId) {
        return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const blobName = `ad_plan_timeline_${CACHE_VERSION}_${videoId}.json`;

    try {
        /* ── Cache hit: unchanged legacy JSON (old videos) ─────────────────── */
        const blobs = await listAllBlobs(blobName);
        if (blobs.length > 0) {
            console.log(`[generateAdPlan] Cache HIT for ${videoId}`);
            const best = blobs.reduce((a, b) =>
                new Date(a.uploadedAt).getTime() > new Date(b.uploadedAt).getTime() ? a : b
            );
            const cachedRes = await fetch(best.url);
            if (cachedRes.ok) {
                const cachedData = await cachedRes.json();
                if (cachedData?.segments?.length > 0) {
                    return NextResponse.json(cachedData, { status: 200 });
                }
                console.log(`[generateAdPlan] Cached data has 0 segments, regenerating`);
            }
        }

        /* ── Cache miss: Pegasus 1.5 (new videos) ───────────────────────────── */
        console.log(`[generateAdPlan] Cache MISS for ${videoId} — running Pegasus 1.5 analyzeAsync`);

        const indexId = await getIndexId(INVENTORY_INDEX_NAME);
        const videoData = await tl_client.indexes.videos.retrieve(indexId, videoId);
        const hlsData = videoData?.hls || {};
        const videoUrl = hlsData.videoUrl || hlsData.video_url || null;
        const apiAssetId =
            typeof videoData?.assetId === "string" && /^[a-f0-9]{24}$/i.test(videoData.assetId.trim())
                ? videoData.assetId.trim()
                : typeof videoData?.asset_id === "string" && /^[a-f0-9]{24}$/i.test(videoData.asset_id.trim())
                  ? videoData.asset_id.trim()
                  : null;

        const resolved = resolveAsyncAnalyzeVideo({
            assetId: apiAssetId || undefined,
            videoUrl: typeof videoUrl === "string" ? videoUrl : "",
            videoId,
        });

        if (!resolved?.video) {
            return NextResponse.json(
                {
                    error:
                        "Could not resolve a TwelveLabs asset id for Pegasus. Use a 24-char hex video id, or wait until the playback URL includes /assets/{id}/.",
                },
                { status: 400 },
            );
        }

        console.log(`[generateAdPlan] Pegasus video input: ${resolved.source} (${resolved.video.type})`);

        const { cast, segments } = await runPegasusInventoryAdPlan(tl_client, resolved.video);

        console.log(
            `[generateAdPlan] Pegasus complete for ${videoId}: ${cast.length} cast (derived), ${segments.length} segments`,
        );

        if (segments.length === 0) {
            console.error(`[generateAdPlan] No segments produced for ${videoId}`);
            return NextResponse.json({ error: "Analysis produced no segments" }, { status: 500 });
        }

        const finalPayload = { cast, segments };

        try {
            await put(blobName, JSON.stringify(finalPayload), {
                access: "public",
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: "application/json",
            });
            console.log(`[generateAdPlan] Cached final result: ${cast.length} cast, ${segments.length} segments → ${blobName}`);
        } catch (blobErr) {
            console.error(`[generateAdPlan] Blob cache write failed:`, blobErr);
        }

        return NextResponse.json(finalPayload, { status: 200 });
    } catch (error) {
        console.error("[generateAdPlan] Fatal error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate ad plan timeline" },
            { status: 500 },
        );
    }
}
