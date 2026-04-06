import { NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';

/**
 * Clears all `analysis_*.json` blobs (Pegasus metadata cache).
 * - Development: allowed without auth.
 * - Production: requires Authorization: Bearer <ANALYSES_CLEAR_SECRET> if that env var is set;
 *   if unset, route returns 403 (prevents accidental mass delete on public deploys).
 */
export async function POST(request) {
    const secret = process.env.ANALYSES_CLEAR_SECRET?.trim();

    if (process.env.NODE_ENV === "production") {
        if (!secret) {
            return NextResponse.json(
                {
                    error:
                        "Clearing analysis cache is disabled in production. Set ANALYSES_CLEAR_SECRET and call with Authorization: Bearer <secret>, or run in development.",
                },
                { status: 403 }
            );
        }
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${secret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const { blobs } = await list({ prefix: 'analysis_' });
        const blobUrls = blobs.map(b => b.url);

        if (blobUrls.length > 0) {
            await del(blobUrls);
            console.log(`[Cache Clear] Deleted ${blobUrls.length} cached analysis blobs.`);
        } else {
            console.log('[Cache Clear] No cached analysis blobs found to delete.');
        }

        return NextResponse.json({ success: true, deletedCount: blobUrls.length }, { status: 200 });
    } catch (error) {
        console.error('[Cache Clear] Error deleting blobs:', error);
        return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
    }
}
