import { TwelveLabs } from "twelvelabs-js"
import { NextResponse } from "next/server"
import { list, put } from '@vercel/blob';

export const maxDuration = 120;


export async function POST(request) {
    const tl_client = new TwelveLabs({ apiKey: process.env.TL_API_KEY });
    const { videoId, prompt, response_format } = await request.json()

    if (!videoId) {
        return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    if (!prompt) {
        return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }
    if (String(prompt).length > 12000) {
        return NextResponse.json({ error: "Prompt too long" }, { status: 400 })
    }

    const parameters = {
        videoId: videoId,
        prompt: prompt,
        temperature: 0.2
    }

    if (response_format) {
        parameters.response_format = response_format
    }

    try {
        // 1. Check if we already cached this analysis in Vercel Blob
        const blobName = `analysis_v3_${videoId}.json`;
        const { blobs } = await list({ prefix: blobName });

        if (blobs.length > 0) {
            console.log(`[DEBUG] Found cached analysis for ${videoId} in Vercel Blob`);
            const cachedRes = await fetch(blobs[0].url);
            if (cachedRes.ok) {
                const cachedData = await cachedRes.json();
                return NextResponse.json(cachedData, { status: 200 });
            }
        }

        // 2. Not cached - Generate from TwelveLabs
        console.log(`[DEBUG] Generating new analysis for ${videoId} via TwelveLabs...`);
        const result = await tl_client.analyze(parameters, {
            timeoutInSeconds: 90,
        })

        // 3. Save to Vercel Blob for future loads
        try {
            await put(blobName, JSON.stringify(result), {
                access: 'public',
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: 'application/json'
            });
            console.log(`[DEBUG] Saved analysis for ${videoId} to Vercel Blob`);
        } catch (blobErr) {
            console.error(`[DEBUG] Failed to cache analysis for ${videoId} - Check BLOB_READ_WRITE_TOKEN`, blobErr);
        }

        return NextResponse.json(result, { status: 200 })
    } catch (error) {
        console.error("Analyze API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to analyze video" }, { status: 500 });
    }
}