import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { blobs } = await list({ prefix: 'analysis_' });
        const analysisMap = {};

        // Fetch all cached analyses in parallel
        await Promise.all(blobs.map(async (blob) => {
            const videoId = blob.pathname.replace('analysis_', '').replace('.json', '');
            try {
                const req = await fetch(blob.url);
                if (req.ok) {
                    const rawResult = await req.json();
                    let parsed = rawResult;

                    if (typeof rawResult === "string" || rawResult.data || rawResult.text) {
                        const rawStr = typeof rawResult === "string" ? rawResult : (rawResult.data || rawResult.text || JSON.stringify(rawResult));
                        const jsonMatch = rawStr.match(/\{[\s\S]*\}/);
                        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
                    }

                    if (parsed && typeof parsed === 'object') {
                        analysisMap[videoId] = parsed;
                    }
                }
            } catch (e) {
                // Silently ignore individual fetch failures to not crash the Promise.all
            }
        }));

        return NextResponse.json(analysisMap, { status: 200 });
    } catch (error) {
        console.error('Failed to list blobs:', error);
        return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 });
    }
}
