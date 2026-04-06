import { NextResponse } from "next/server"
import { getTwelveLabsClient, getIndexId } from "../../lib/twelvelabs"
import { list, put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET(request) {

    const { searchParams } = new URL(request.url)
    const targetIndex = searchParams.get("index") || "tl-context-engine-ads"
    console.log(`[DEBUG] /api/videos requested with targetIndex="${targetIndex}"`);
    const forceRefresh = searchParams.get("refresh") === "true";

    const tl_client = getTwelveLabsClient()
    const indexId = await getIndexId(targetIndex)

    const blobName = `api_video_cache_v2_${indexId}.json`;

    if (!forceRefresh) {
        try {
            const { blobs } = await list({ prefix: blobName });
            if (blobs.length > 0) {
                console.log(`[DEBUG] Fetching video list from Vercel Blob cache for indexId=${indexId} (indexName=${targetIndex})`);
                const cachedRes = await fetch(blobs[0].url);
                if (cachedRes.ok) {
                    const cachedData = await cachedRes.json();
                    const count = Array.isArray(cachedData) ? cachedData.length : 0;
                    console.log(`[DEBUG] Blob cache for indexName=${targetIndex} contains ${count} videos.`);

                    // Only short‑circuit if cache actually has videos.
                    if (count > 0) {
                        console.log(`[DEBUG] Returning cached videos for indexName=${targetIndex}`);
                        return NextResponse.json(cachedData, { status: 200 });
                    } else {
                        console.log(`[DEBUG] Blob cache for indexName=${targetIndex} is empty, falling back to live TwelveLabs fetch.`);
                    }
                }
            } else {
                console.log(`[DEBUG] No blob cache found for indexName=${targetIndex}, will fetch from TwelveLabs.`);
            }
        } catch (e) {
            console.error("[DEBUG] Error checking blob cache:", e);
        }
    }

    console.log(`[DEBUG] Fetching videos for indexId=${indexId} (indexName=${targetIndex}) directly from TwelveLabs...`);

    const videoPager = await tl_client.indexes.videos.list(indexId)
    const videos = []

    for await (const video of videoPager) {
        const videoData = await tl_client.indexes.videos.retrieve(
            indexId,
            video.id,
            {
                embeddingOption: ['visual', 'audio', 'transcription']
            }
        )

        let embeddings = [];
        const segments = videoData.embedding?.videoEmbedding?.segments || [];

        if (segments.length > 0) {
            embeddings = segments.map(seg => ({
                startOffsetSec: seg.startOffsetSec,
                endOffsetSec: seg.endOffsetSec,
                vector: seg.float
            }));
        }

        console.log(`[DEBUG] Video ${videoData.id} has ${segments.length} segments`);

        // Explicitly extract fields into a plain serializable object
        // The SDK may return camelCase or snake_case depending on method
        const hlsData = videoData.hls || {};
        const sysMeta = videoData.systemMetadata || {};
        const rawUserMeta = videoData.userMetadata || videoData.user_metadata || null;

        videos.push({
            id: videoData.id,
            createdAt: videoData.createdAt,
            indexedAt: videoData.indexedAt,
            systemMetadata: {
                filename: sysMeta.filename || null,
                duration: sysMeta.duration || 0,
                fps: sysMeta.fps || 0,
                width: sysMeta.width || 0,
                height: sysMeta.height || 0,
                size: sysMeta.size || 0,
            },
            hls: {
                videoUrl: hlsData.videoUrl || hlsData.video_url || null,
                thumbnailUrls: hlsData.thumbnailUrls || hlsData.thumbnail_urls || [],
                status: hlsData.status || null,
            },
            userMetadata: typeof rawUserMeta === 'string'
                ? rawUserMeta
                : (rawUserMeta ? JSON.stringify(rawUserMeta) : null),
            embedding_segments: embeddings,
        })
    }

    console.log(`[DEBUG] Retrieved ${videos.length} videos from indexId=${indexId} (indexName=${targetIndex}).`);
    if (videos.length > 0) {
        console.log(
            "[DEBUG] Example videos:",
            videos.slice(0, 3).map(v => ({
                id: v.id,
                filename: v.systemMetadata?.filename,
                duration: v.systemMetadata?.duration
            }))
        );
    }
    console.log(`[DEBUG] Saving video list to Vercel Blob cache key=${blobName}...`);

    try {
        await put(blobName, JSON.stringify(videos), {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'application/json'
        });
        console.log(`[DEBUG] Saved video list to Vercel Blob: ${blobName}`);
    } catch (blobErr) {
        console.error(`[DEBUG] Failed to cache video list for index ${indexId}:`, blobErr);
    }

    return NextResponse.json(videos, { status: 200 })

}

export async function POST(request) {
    // Pass in public video URLs and associated user metadata to add to TwelveLabs index.
    // Video URLS from Vercel Blob storage on client-side upload first.

    const { videoURLs, metadata, target_index } = await request.json()
    if (!Array.isArray(videoURLs) || videoURLs.length === 0) {
        return NextResponse.json({ error: "videoURLs is required" }, { status: 400 });
    }
    if (videoURLs.length > 10) {
        return NextResponse.json({ error: "Max 10 videos per request" }, { status: 400 });
    }

    const tl_client = getTwelveLabsClient()
    const indexId = await getIndexId(target_index || "tl-context-engine-ads")

    const totalVideos = videoURLs.length

    // Stream progress back to the client via SSE
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder()
            let isClosed = false;

            function send(event, data) {
                if (isClosed) return;
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
                } catch (e) {
                    console.log('[DEBUG] SSE stream closed by client');
                    isClosed = true;
                }
            }

            send('progress', {
                completed: 0,
                total: totalVideos,
                percent: 0,
                message: `Starting upload of ${totalVideos} video${totalVideos !== 1 ? 's' : ''}…`,
            })

            const videoData = []

            for (let i = 0; i < videoURLs.length; i++) {
                if (isClosed) break;
                
                const videoURL = videoURLs[i]

                try {
                    send('progress', {
                        completed: i,
                        total: totalVideos,
                        percent: Math.round((i / totalVideos) * 100),
                        message: `Processing video ${i + 1} of ${totalVideos}…`,
                    })

                    const task = await tl_client.tasks.create({
                        indexId: indexId,
                        videoUrl: videoURL,
                        enableVideoStream: true,
                        userMetadata: JSON.stringify(metadata)
                    })
                    console.log(`[DEBUG] Created task:`, JSON.stringify(task, null, 2));

                    send('progress', {
                        completed: i,
                        total: totalVideos,
                        percent: Math.round(((i + 0.5) / totalVideos) * 100),
                        message: `Waiting for TwelveLabs to process video ${i + 1}…`,
                    })

                    const completedTask = await tl_client.tasks.waitForDone(task.id, {
                        sleepInterval: 5
                    })
                    console.log(`[DEBUG] Task finished waiting:`, JSON.stringify(completedTask, null, 2));

                    // Fallback in case waitForDone returns void/null, though it usually returns the task
                    const finalTask = completedTask || await tl_client.tasks.retrieve(task.id);

                    if (finalTask.status !== "ready") {
                        throw new Error(`Task ${finalTask.id} failed with status ${finalTask.status}`)
                    }

                    console.log(`Task ${finalTask.id} completed with status ${finalTask.status} and video ID ${finalTask.videoId}`)

                    const retrieveTask = await fetch(`https://api.twelvelabs.io/v1.3/indexes/${indexId}/videos/${finalTask.videoId}`, {
                        method: "GET",
                        headers: {
                            "x-api-key": process.env.TL_API_KEY,
                            "transcription": "true"
                        }
                    })

                    const retrievedVideoData = await retrieveTask.json()

                    const result = {
                        videoId: finalTask.videoId,
                        videoUrl: videoURL,
                        userMetadata: retrievedVideoData.user_metadata,
                        transcription: retrievedVideoData.transcription
                    }

                    videoData.push(result)

                    send('video_done', {
                        index: i,
                        completed: i + 1,
                        total: totalVideos,
                        percent: Math.round(((i + 1) / totalVideos) * 100),
                        video: result,
                    })

                } catch (err) {
                    send('video_error', {
                        index: i,
                        videoUrl: videoURL,
                        error: err.message,
                        completed: i,
                        total: totalVideos,
                        percent: Math.round(((i + 1) / totalVideos) * 100),
                    })
                }
            }

            if (!isClosed) {
                send('complete', {
                    completed: totalVideos,
                    total: totalVideos,
                    percent: 100,
                    videos: videoData,
                })

                try {
                    controller.close()
                } catch (e) {
                    console.error('[DEBUG] Error closing already closed stream');
                }
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}