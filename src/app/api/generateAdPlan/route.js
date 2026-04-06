import { TwelveLabs } from "twelvelabs-js";
import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

export const maxDuration = 600;

const CHUNK_DURATION = 600; // 5 minutes per chunk
const CACHE_VERSION = "v1";

/* ═══════════════════════════════════════════════════════════
   STEP A — Cast-Only Prompt & Schema
   A single, lightweight call to identify every person in
   the video before we start segmenting.
   ═══════════════════════════════════════════════════════════ */

const cast_prompt = `
You are a broadcast ad-ops analyst for a premium CTV platform.

Watch this entire video and identify every on-screen person.

For each person provide:
- "name": Their real name if it can be determined from dialogue, chyrons, credits, or well-known public identity. Otherwise use a descriptive label (e.g. "Woman in red dress").
- "description": A brief physical or contextual descriptor so they can be tracked across scenes (e.g. "Tall brunette woman with hoop earrings, central to most confrontations").

Only include the main cast, no need to include background characters, narrators, or hosts.

Return ONLY the JSON. No markdown fences.
`;

const cast_response_format = {
    type: "object",
    properties: {
        cast: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    description: { type: "string" }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["cast"]
};

/* ═══════════════════════════════════════════════════════════
   STEP B — Segment Chunk Prompt Builder & Schema
   Called once per 10-minute window. The cast list from Step A
   is injected so the model knows who is who.
   ═══════════════════════════════════════════════════════════ */

function buildChunkPrompt(castList, startSec, endSec, isFirstChunk) {
    const castBlock = castList.map(c => `  - ${c.name}: ${c.description}`).join("\n");

    return `
    You are a broadcast ad-ops analyst for a premium CTV platform.

    KNOWN CAST (identified from a prior full-video pass):
    ${castBlock}

    YOUR TASK: Analyze ONLY the portion of this video from second ${startSec} to second ${endSec}.

    Your analysis MUST start exactly at second ${startSec} — this is a continuation from a prior chunk that ended at this timestamp.

    Segment this window into major scenes (typically 2-6 per 10-minute window). 

    CRITICAL SEGMENTATION RULES:
    - DO NOT summarize this entire window into a single massive segment.
    - Must return at least one segment / scene.
    - DO NOT create a new segment for every minor camera cut, reaction shot, or brief pause in dialogue.
    - Group rapid micro-interactions into larger, cohesive thematic scenes.
    - HARD LIMIT: You MUST return a MAXIMUM of 6 segments for this chunk. If there is constant cutting, you MUST merge them into a single, broader narrative block.
    - You must create a new segment boundary ONLY when there is a major change in physical location, or a complete, sustained shift in the broader conversation topic.
    

    For EACH segment provide ALL of the following:

    1. TIMESTAMPS: Accurate start_time and end_time in seconds within this window.
      - The FIRST segment's start_time must be ${startSec}
      - The LAST segment's end_time should be the point where the last scene naturally ends (at or before ${endSec}).
      - There must be NO GAPS between segments: each segment's end_time equals the next segment's start_time.

    2. SCENE CONTEXT: One concise sentence (max 25 words) describing the scene. Reference cast members by name.

    3. ENVIRONMENT: Strictly one of: "Indoor Home", "Indoor Office", "Indoor Bar Restaurant", "Indoor Retail", "Indoor Venue", "Outdoor Urban", "Outdoor Nature", "Outdoor Adventure", "Outdoor Sports Venue", "Vehicle", "Studio", "Other".

    4. CAST PRESENT: Names of cast members visible or speaking.

    5. DETAILS: List key "activities" and notable "objects_of_interest".

    6. EMOTIONAL CONTEXT:
      - "sentiment": Positive, Neutral, Negative, or Mixed.
      - "emotional_intensity": 0.0 to 1.0.
      - "tone": Strictly one of: Celebratory, Romantic, Tense, Comedic, Somber, Inspirational, Casual, Dramatic, Action, Informational.

    7. BRAND SAFETY (GARM): Assess "is_safe", "risk_level" (Low/Medium/High), and populate "garm_flags" only if risks are clearly present.

    8. AD SUITABILITY: List "suitable_categories" and "unsuitable_categories" using ONLY: Luxury goods, Premium spirits, Travel, Fine Dining, Automotive, Home improvement, Fitness, Health & Wellness, Gaming, Fast Food, Music, Entertainment, Pop Culture. Also list "contextual_themes" and a "confidence" score (0.0-1.0).

    9. AD BREAK FITNESS: At the END of each segment assess:
      - "post_segment_break_quality": High, Medium, or Low.
      - "break_type": Hard Cut, Fade, Narrative Pause, Topic Shift, or None.
      - "interruption_risk": 0.0 to 1.0.
      - "reasoning": 1-2 sentences referencing the SPECIFIC events, dialogue, story beats, or cast actions at this timestamp that justify the rating.

    Brevity is critical for all text fields EXCEPT reasoning, which must reference actual content.

`;
}

const segment_chunk_response_format = {
    type: "object",
    properties: {
        segments: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    start_time: { type: "number", description: "Segment start in seconds" },
                    end_time: { type: "number", description: "Segment end in seconds" },
                    scene_context: { type: "string", description: "One concise sentence describing the scene, referencing cast by name" },
                    environment: {
                        type: "string",
                        enum: [
                            "Indoor Home", "Indoor Office", "Indoor Bar Restaurant",
                            "Indoor Retail", "Indoor Venue", "Outdoor Urban",
                            "Outdoor Nature", "Outdoor Adventure", "Outdoor Sports Venue",
                            "Vehicle", "Studio", "Other"
                        ]
                    },
                    cast_present: { type: "array", items: { type: "string" } },
                    activities: { type: "array", items: { type: "string" } },
                    objects_of_interest: { type: "array", items: { type: "string" } },
                    sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative", "Mixed"] },
                    emotional_intensity: { type: "number" },
                    tone: {
                        type: "string",
                        enum: ["Celebratory", "Romantic", "Tense", "Comedic", "Somber", "Inspirational", "Casual", "Dramatic", "Action", "Informational"]
                    },
                    brand_safety: {
                        type: "object",
                        properties: {
                            is_safe: { type: "boolean" },
                            risk_level: { type: "string", enum: ["Low", "Medium", "High"] },
                            garm_flags: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        category: { type: "string" },
                                        severity: { type: "string", enum: ["Floor Violation", "High Risk", "Medium Risk", "Low Risk"] },
                                        evidence: { type: "string" }
                                    },
                                    required: ["category", "severity", "evidence"]
                                }
                            }
                        },
                        required: ["is_safe", "risk_level", "garm_flags"]
                    },
                    ad_suitability: {
                        type: "object",
                        properties: {
                            suitable_categories: { type: "array", items: { type: "string" } },
                            unsuitable_categories: { type: "array", items: { type: "string" } },
                            contextual_themes: { type: "array", items: { type: "string" } },
                            confidence: { type: "number" }
                        },
                        required: ["suitable_categories", "unsuitable_categories", "contextual_themes", "confidence"]
                    },
                    ad_break_fitness: {
                        type: "object",
                        properties: {
                            post_segment_break_quality: { type: "string", enum: ["High", "Medium", "Low"] },
                            break_type: { type: "string", enum: ["Hard Cut", "Fade", "Narrative Pause", "Topic Shift", "None"] },
                            interruption_risk: { type: "number" },
                            reasoning: { type: "string" }
                        },
                        required: ["post_segment_break_quality", "break_type", "interruption_risk", "reasoning"]
                    }
                },
                required: [
                    "start_time", "end_time", "scene_context", "environment",
                    "cast_present", "activities", "sentiment", "emotional_intensity", "tone",
                    "brand_safety", "ad_suitability", "ad_break_fitness"
                ]
            }
        }
    },
    required: ["segments"]
};

/* ═══════════════════════════════════════════════════════════
   Shared Utilities
   ═══════════════════════════════════════════════════════════ */

const tl_client = new TwelveLabs({
    apiKey: process.env.TL_API_KEY,
});

function parseAnalyzeResult(raw) {
    if (!raw) return null;
    let inner = raw.data ?? raw;
    if (typeof inner === "string") {
        try {
            inner = JSON.parse(inner);
        } catch {
            const match = inner.match(/\{[\s\S]*\}/);
            if (match) {
                try { inner = JSON.parse(match[0]); } catch { return null; }
            } else {
                return null;
            }
        }
    }
    return inner;
}

/* ═══════════════════════════════════════════════════════════
   POST Handler — Two-Pass Chunked Analysis
   ═══════════════════════════════════════════════════════════ */

export async function POST(request) {
    const { videoId, videoDuration: clientDuration } = await request.json();

    if (!videoId) {
        return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    const blobName = `ad_plan_timeline_${CACHE_VERSION}_${videoId}.json`;

    try {
        /* ── Check cache ─────────────────────────────────── */
        const { blobs } = await list({ prefix: blobName });
        if (blobs.length > 0) {
            console.log(`[generateAdPlan] Cache HIT for ${videoId}`);
            const cachedRes = await fetch(blobs[0].url);
            if (cachedRes.ok) {
                const cachedData = await cachedRes.json();
                if (cachedData?.segments?.length > 0) {
                    return NextResponse.json(cachedData, { status: 200 });
                }
                console.log(`[generateAdPlan] Cached data has 0 segments, regenerating`);
            }
        }

        if (!clientDuration) {
            return NextResponse.json({ error: "Video duration is required" }, { status: 400 });
        }

        const totalDuration = clientDuration

        console.log(`[generateAdPlan] Starting two-pass analysis for ${videoId} (duration=${totalDuration}s)`);

        /* ══════════════════════════════════════════════════
           STEP A — Cast Analysis (single call)
           ══════════════════════════════════════════════════ */
        console.log(`[generateAdPlan] Step A: Cast analysis...`);
        const castResult = await tl_client.analyze({
            videoId,
            prompt: cast_prompt,
            temperature: 0.1,
            max_tokens: 2048,
            responseFormat: {
                type: "json_schema",
                jsonSchema: cast_response_format,
            },
        }, { timeoutInSeconds: 120 });

        const castParsed = parseAnalyzeResult(castResult);
        const castList = castParsed?.cast || [];
        console.log(`[generateAdPlan] Step A complete: ${castList.length} cast members identified`);
        if (castList.length > 0) {
            console.log(`[generateAdPlan]   Cast: ${castList.map(c => c.name).join(", ")}`);
        }

        /* ══════════════════════════════════════════════════
           STEP B — Chunked Segment Analysis
           ══════════════════════════════════════════════════ */
        const chunkResults = {};
        let allSegments = [];
        let currentStart = 0;
        let chunkIndex = 0;
        let consecutiveEmptyChunks = 0;
        const MAX_EMPTY_CHUNKS = 2;

        while (currentStart < totalDuration) {
            const chunkEnd = Math.min(currentStart + CHUNK_DURATION, totalDuration);
            const isFirstChunk = chunkIndex === 0;

            console.log(`[generateAdPlan] Step B chunk ${chunkIndex}: ${currentStart}s – ${chunkEnd}s`);

            const chunkPrompt = buildChunkPrompt(castList, currentStart, chunkEnd, isFirstChunk);

            try {
                const chunkResult = await tl_client.analyze({
                    videoId,
                    prompt: chunkPrompt,
                    temperature: 0.1,
                    max_tokens: 4096,
                    responseFormat: {
                        type: "json_schema",
                        jsonSchema: segment_chunk_response_format,
                    },
                }, { timeoutInSeconds: 180 });

                if (chunkResult.finishReason !== "stop") {
                    console.error(`[generateAdPlan]   Chunk ${chunkIndex} FAILED:`, chunkResult.finishReason);
                    break;
                }

                const parsed = parseAnalyzeResult(chunkResult);
                const chunkSegments = parsed?.segments || [];

                chunkResults[`chunk_${chunkIndex}`] = {
                    requestedWindow: { start: currentStart, end: chunkEnd },
                    segmentCount: chunkSegments.length,
                    segments: chunkSegments,
                };

                allSegments.push(...chunkSegments);

                if (chunkSegments.length === 0) {
                    console.error(`[generateAdPlan]   Chunk ${chunkIndex}: 0 segments`);
                    break;
                }

                const lastSegEnd = chunkSegments[chunkSegments.length - 1].end_time;
                console.log(`[generateAdPlan]   Chunk ${chunkIndex}: ${chunkSegments.length} segments, last end_time=${lastSegEnd}s`);

                // Deterministic continuity: next chunk starts exactly where this one left off
                currentStart = lastSegEnd;

            } catch (chunkErr) {
                console.error(`[generateAdPlan]   Chunk ${chunkIndex} FAILED:`, chunkErr.message || chunkErr);
                chunkResults[`chunk_${chunkIndex}`] = {
                    requestedWindow: { start: currentStart, end: chunkEnd },
                    error: chunkErr.message || "Unknown error",
                };
                // Advance past this window to avoid infinite loop on a failing chunk
                currentStart = chunkEnd;
            }

            chunkIndex++;
        }

        console.log(`[generateAdPlan] Step B complete: ${allSegments.length} total segments across ${chunkIndex} chunks`);

        if (allSegments.length === 0) {
            console.error(`[generateAdPlan] No segments produced for ${videoId}`);
            return NextResponse.json({ error: "Analysis produced no segments" }, { status: 500 });
        }

        const finalPayload = {
            cast: castList,
            segments: allSegments,
        };

        try {
            await put(blobName, JSON.stringify(finalPayload), {
                access: "public",
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: "application/json",
            });
            console.log(`[generateAdPlan] Cached final result: ${castList.length} cast, ${allSegments.length} segments → ${blobName}`);
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
