import { TwelveLabs } from "twelvelabs-js"
import { NextResponse } from "next/server"


export async function POST(request) {
    const tl_client = new TwelveLabs({ apiKey: process.env.TL_API_KEY });
    const { query, indexName } = await request.json()

    if (!query) {
        return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }
    if (String(query).length > 300) {
        return NextResponse.json({ error: "Query too long (max 300 chars)" }, { status: 400 })
    }

    // Restrict searchable indexes to known app indexes only.
    const allowed = new Set(["tl-context-engine-ads", "tl-context-engine-videos"]);
    const requestedIndex = indexName || "tl-context-engine-ads";
    const targetName = allowed.has(requestedIndex) ? requestedIndex : "tl-context-engine-ads";
    console.log('[Search] Looking for TwelveLabs index:', targetName);

    const indexPager = await tl_client.indexes.list()
    let indexId = null;

    for await (const index of indexPager) {
        console.log('[Search] Found index:', index.indexName, '→', index.id);
        if (index.indexName === targetName) {
            indexId = index.id
        }
    }

    if (!indexId) {
        console.error('[Search] Index not found for name:', targetName);
        return NextResponse.json({ error: `Index "${targetName}" not found` }, { status: 404 })
    }

    console.log('[Search] Using index:', indexId, 'for query:', query);

    const resultPager = await tl_client.search.query({
        indexId: indexId,
        queryText: query,
        searchOptions: ['visual', 'audio']
    })

    // Collect all search results from the pager into an array
    const results = [];
    for (const item of resultPager.data || []) {
        results.push({
            videoId: item.videoId || item.video_id,
            start: item.start,
            end: item.end,
            score: item.score,
            confidence: item.confidence,
            rank: item.rank,
            thumbnailUrl: item.thumbnailUrl || item.thumbnail_url,
        });
    }

    console.log('[Search] Found', results.length, 'results');
    return NextResponse.json({ results }, { status: 200 })
}