import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { listAllBlobs } from "../../lib/blobList";
import { getIndexId, getTwelveLabsClient } from "../../lib/twelvelabs";
import { resolveAsyncAnalyzeVideo } from "../../lib/adInventorySemanticResolve";

export const maxDuration = 600;

const CACHE_VERSION = "v1";
const INVENTORY_INDEX_NAME = "tl-context-engine-videos";

/** Pegasus 1.5 segment_definitions — same contract as prompt_pegasus_test.js */
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

function taskBody(response) {
    return response?.data ?? response;
}

function asString(value) {
    return typeof value === "string" ? value : "";
}

function asStringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

/** Pegasus returns GARM flags as CATEGORY|SEVERITY|EVIDENCE strings per segment_definitions. */
function parseGarmFlags(items) {
    if (!Array.isArray(items)) return [];
    const flags = [];
    for (const row of items) {
        if (typeof row !== "string" || !row.trim()) continue;
        const parts = row.split("|").map((part) => part.trim());
        if (parts.length < 3) continue;
        flags.push({
            category: parts[0],
            severity: parts[1],
            evidence: parts.slice(2).join("| ").trim(),
        });
    }
    return flags;
}

/**
 * Pegasus segment_definitions only allow flat primitives; the app expects nested
 * brand_safety / ad_suitability / ad_break_fitness objects for the UI.
 */
function mapPegasusSegment(row) {
    const md = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};

    return {
        start_time: asNumber(row?.start_time ?? row?.startTime),
        end_time: asNumber(row?.end_time ?? row?.endTime),
        scene_context: asString(md.scene_context),
        environment: asString(md.environment),
        cast_present: asStringArray(md.cast_present),
        activities: asStringArray(md.activities),
        objects_of_interest: asStringArray(md.objects_of_interest),
        sentiment: asString(md.sentiment),
        emotional_intensity: clamp01(asNumber(md.emotional_intensity)),
        tone: asString(md.tone),
        brand_safety: {
            is_safe: Boolean(md.brand_safety_is_safe),
            risk_level: asString(md.brand_safety_risk_level),
            garm_flags: parseGarmFlags(md.brand_safety_garm_flags),
        },
        ad_suitability: {
            suitable_categories: asStringArray(md.ad_suitable_categories),
            unsuitable_categories: asStringArray(md.ad_unsuitable_categories),
            contextual_themes: asStringArray(md.ad_contextual_themes),
            confidence: clamp01(asNumber(md.ad_suitability_confidence)),
        },
        ad_break_fitness: {
            post_segment_break_quality: asString(md.ad_break_post_segment_break_quality),
            break_type: asString(md.ad_break_break_type),
            interruption_risk: clamp01(asNumber(md.ad_break_interruption_risk)),
            reasoning: asString(md.ad_break_reasoning),
        },
    };
}

function parsePegasusSceneRows(resultData) {
    if (resultData == null) return [];
    let parsed = resultData;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }
    const rows = parsed?.scene ?? parsed?.scenes;
    return Array.isArray(rows) ? rows : [];
}

function deriveCastFromSegments(segments) {
    const names = new Set();
    for (const segment of segments) {
        for (const name of segment.cast_present ?? []) {
            if (name.trim()) names.add(name.trim());
        }
    }
    return [...names].map((name) => ({
        name,
        description: "Identified from Pegasus scene timeline.",
    }));
}

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

    const taskId = taskBody(createRes)?.taskId;
    if (!taskId) {
        throw new Error("TwelveLabs analyzeAsync did not return a task id");
    }

    const pollStart = Date.now();
    const maxWaitMs = Math.max(120000, Number(process.env.GENERATE_AD_PLAN_PEGASUS_MAX_MS) || 540000);

    while (Date.now() - pollStart < maxWaitMs) {
        const pollRes = await tlClient.analyzeAsync.tasks.retrieve(taskId, { timeoutInSeconds: 90 });
        const task = taskBody(pollRes);
        const status = task?.status;

        if (status === "ready") {
            const rows = parsePegasusSceneRows(task?.result?.data);
            const segments = rows.map(mapPegasusSegment).sort((a, b) => a.start_time - b.start_time);
            return { cast: deriveCastFromSegments(segments), segments };
        }
        if (status === "failed") {
            throw new Error(task?.error?.message || `Pegasus task ${taskId} failed`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("Pegasus analysis timed out while waiting for task completion");
}

export async function POST(request) {
    const tlClient = getTwelveLabsClient();
    const { videoId } = await request.json();

    if (!videoId) {
        return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const blobName = `ad_plan_timeline_${CACHE_VERSION}_${videoId}.json`;

    try {
        const blobs = await listAllBlobs(blobName);
        if (blobs.length > 0) {
            console.log(`[generateAdPlan] Cache HIT for ${videoId}`);
            const best = blobs.reduce((a, b) =>
                new Date(a.uploadedAt).getTime() > new Date(b.uploadedAt).getTime() ? a : b,
            );
            const cachedRes = await fetch(best.url);
            if (cachedRes.ok) {
                const cached = await cachedRes.json();
                if (cached?.segments?.length > 0) {
                    return NextResponse.json(cached, { status: 200 });
                }
                console.log(`[generateAdPlan] Cached data has 0 segments, regenerating`);
            }
        }

        console.log(`[generateAdPlan] Cache MISS for ${videoId} — running Pegasus 1.5`);

        const indexId = await getIndexId(INVENTORY_INDEX_NAME);
        const videoData = await tlClient.indexes.videos.retrieve(indexId, videoId);
        const hls = videoData?.hls || {};
        const videoUrl = hls.videoUrl || hls.video_url || null;
        const assetId =
            typeof videoData?.assetId === "string" && /^[a-f0-9]{24}$/i.test(videoData.assetId.trim())
                ? videoData.assetId.trim()
                : typeof videoData?.asset_id === "string" && /^[a-f0-9]{24}$/i.test(videoData.asset_id.trim())
                  ? videoData.asset_id.trim()
                  : null;

        const resolved = resolveAsyncAnalyzeVideo({
            assetId: assetId || undefined,
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

        console.log(`[generateAdPlan] Pegasus input: ${resolved.source} (${resolved.video.type})`);

        const { cast, segments } = await runPegasusInventoryAdPlan(tlClient, resolved.video);

        console.log(`[generateAdPlan] Pegasus done: ${cast.length} cast, ${segments.length} segments`);

        if (segments.length === 0) {
            return NextResponse.json({ error: "Analysis produced no segments" }, { status: 500 });
        }

        const payload = { cast, segments };

        try {
            await put(blobName, JSON.stringify(payload), {
                access: "public",
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: "application/json",
            });
        } catch (blobErr) {
            console.error("[generateAdPlan] Blob cache write failed:", blobErr);
        }

        return NextResponse.json(payload, { status: 200 });
    } catch (error) {
        console.error("[generateAdPlan] Fatal error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate ad plan timeline" },
            { status: 500 },
        );
    }
}
