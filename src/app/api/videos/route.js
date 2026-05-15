import { NextResponse } from "next/server"
import { getTwelveLabsClient, getIndexId } from "../../lib/twelvelabs"
import { put, del } from '@vercel/blob';
import { listAllBlobs } from '../../lib/blobList';
import { VIDEO_LIST_BLOB_WRITE_PREFIX } from "../../lib/videoListBlobPrefix";

const BLOB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** After Marengo indexing reports "ready", HLS packaging can lag with hls.status=PROCESSING and empty videoUrl. */
const HLS_READY_POLL_MS = 5000;
const HLS_READY_MAX_WAIT_MS = 5 * 60 * 1000;

/**
 * Poll indexes.videos.retrieve until playlist URL exists (or timeout).
 * TwelveLabs often completes the indexing task while hls.videoUrl is still empty for several seconds.
 */
async function waitForHlsVideoUrl(tl_client, indexId, videoId) {
    const deadline = Date.now() + HLS_READY_MAX_WAIT_MS;
    let last = null;
    while (Date.now() < deadline) {
        last = await tl_client.indexes.videos.retrieve(indexId, videoId);
        const hls = last?.hls || {};
        const url = hls.videoUrl || hls.video_url;
        if (url && String(url).trim()) {
            return last;
        }
        const st = String(hls.status || hls.video_status || "").toUpperCase();
        if (st === "FAILED" || st === "ERROR" || st === "FAILURE") {
            throw new Error(`TwelveLabs HLS failed for video ${videoId} (hls.status=${hls.status || hls.video_status})`);
        }
        await new Promise((r) => setTimeout(r, HLS_READY_POLL_MS));
    }
    console.warn(
        `[DEBUG] HLS videoUrl still empty after ${HLS_READY_MAX_WAIT_MS / 1000}s for ${videoId} — continuing with last retrieve (UI may show processing until next refresh).`,
    );
    return last;
}

export const dynamic = 'force-dynamic';

export async function GET(request) {

    const { searchParams } = new URL(request.url)
    const targetIndex = searchParams.get("index") || "tl-context-engine-ads"
    console.log(`[DEBUG] /api/videos requested with targetIndex="${targetIndex}"`);
    const forceRefresh = searchParams.get("refresh") === "true";
    const includeEmbeddings = searchParams.get("embeddings") !== "none";
    const payloadMode = includeEmbeddings ? "full" : "meta";

    const tl_client = getTwelveLabsClient()
    const indexId = await getIndexId(targetIndex)

    const blobName = `${VIDEO_LIST_BLOB_WRITE_PREFIX}${indexId}_${payloadMode}.json`;

    if (!forceRefresh) {
        try {
            const blobs = await listAllBlobs(blobName);
            if (blobs.length > 0) {
                const cacheBlob = blobs.reduce((a, b) =>
                    new Date(a.uploadedAt).getTime() > new Date(b.uploadedAt).getTime() ? a : b
                );
                const cacheAge = Date.now() - new Date(cacheBlob.uploadedAt).getTime();
                const cacheExpired = cacheAge > BLOB_CACHE_TTL_MS;

                if (cacheExpired) {
                    console.log(`[DEBUG] Blob cache for indexName=${targetIndex} is ${Math.round(cacheAge / 3600000)}h old (TTL=6h) — refreshing from TwelveLabs.`);
                } else {
                    console.log(`[DEBUG] Fetching video list from Vercel Blob cache for indexId=${indexId} (indexName=${targetIndex})`);
                    const cachedRes = await fetch(cacheBlob.url);
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
        const videoData = includeEmbeddings
            ? await tl_client.indexes.videos.retrieve(
                indexId,
                video.id,
                {
                    embeddingOption: ['visual', 'audio', 'transcription']
                }
            )
            : await tl_client.indexes.videos.retrieve(indexId, video.id)

        // Extract fields early — needed by both the processing branch and the ready branch.
        const hlsData = videoData.hls || {};
        const sysMeta = videoData.systemMetadata || {};
        const rawUserMeta = videoData.userMetadata || videoData.user_metadata || null;
        const hlsStatus = hlsData.status || hlsData.video_status || null;
        const playbackUrl = hlsData.videoUrl || hlsData.video_url || null;

        // Statuses that mean TwelveLabs is still preparing playback — but hls.status can stay
        // "PROCESSING" briefly *after* indexing finished while videoUrl is already set.
        const PROCESSING_STATUSES = new Set([
            'processing', 'PROCESSING',
            'pending', 'PENDING',
            'indexing', 'INDEXING',
            'queued', 'QUEUED',
        ]);
        const isProcessing = !!(hlsStatus && PROCESSING_STATUSES.has(hlsStatus) && !playbackUrl);

        if (isProcessing) {
            console.log(
                `[DEBUG] Video ${videoData.id} has no HLS URL yet (hls.status="${hlsStatus}") — marking as processing.`,
            );
            // Include with limited data so the UI can show a "processing" state.
            videos.push({
                id: videoData.id,
                createdAt: videoData.createdAt,
                indexedAt: videoData.indexedAt,
                processing: true,
                systemMetadata: {
                    filename: sysMeta.filename || null,
                    duration: sysMeta.duration || 0,
                    fps: sysMeta.fps || 0,
                    width: sysMeta.width || 0,
                    height: sysMeta.height || 0,
                    size: sysMeta.size || 0,
                },
                hls: {
                    videoUrl: null,
                    thumbnailUrls: hlsData.thumbnailUrls || hlsData.thumbnail_urls || [],
                    status: hlsStatus,
                },
                userMetadata: typeof rawUserMeta === 'string'
                    ? rawUserMeta
                    : (rawUserMeta ? JSON.stringify(rawUserMeta) : null),
                embedding_segments: [],
            });
            continue;
        }

        let embeddings = [];
        if (includeEmbeddings) {
            const segments = videoData.embedding?.videoEmbedding?.segments || [];
            if (segments.length > 0) {
                embeddings = segments.map(seg => ({
                    startOffsetSec: seg.startOffsetSec,
                    endOffsetSec: seg.endOffsetSec,
                    vector: seg.float
                }));
            }
            console.log(`[DEBUG] Video ${videoData.id} has ${segments.length} segments`);
        }

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
                videoUrl: playbackUrl,
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
    const uploadBlobPrefixes = [
        `${VIDEO_LIST_BLOB_WRITE_PREFIX}${indexId}_full.json`,
        `${VIDEO_LIST_BLOB_WRITE_PREFIX}${indexId}_meta.json`,
        `api_video_cache_v3_${indexId}_full.json`,
        `api_video_cache_v3_${indexId}_meta.json`,
        `api_video_cache_v2_${indexId}.json`, // legacy
    ];

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

                    send('progress', {
                        completed: i,
                        total: totalVideos,
                        percent: Math.round(((i + 0.5) / totalVideos) * 100),
                        message: `Indexing complete — waiting for playable HLS stream for video ${i + 1} (TwelveLabs may still show HLS as PROCESSING)…`,
                    })

                    // Indexing task is "ready" before CloudFront HLS URL is populated — wait so the next
                    // GET /api/videos list is not stuck on processing: true for hours (blob cache TTL).
                    const retrievedVideoData = await waitForHlsVideoUrl(tl_client, indexId, finalTask.videoId);
                    const um = retrievedVideoData?.userMetadata ?? retrievedVideoData?.user_metadata;

                    const result = {
                        videoId: finalTask.videoId,
                        videoUrl: videoURL,
                        userMetadata: um,
                        transcription: retrievedVideoData?.transcription,
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

                // Invalidate Vercel Blob caches so the next GET /api/videos
                // fetches fresh data from TwelveLabs (including newly uploaded videos).
                try {
                    for (const prefix of uploadBlobPrefixes) {
                        const staleBlobs = await listAllBlobs(prefix);
                        if (staleBlobs.length > 0) {
                            await del(staleBlobs.map(b => b.url));
                            console.log(`[DEBUG] Invalidated Vercel Blob cache: ${prefix}`);
                        }
                    }
                } catch (delErr) {
                    console.error('[DEBUG] Failed to invalidate Vercel Blob cache after upload:', delErr);
                }

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