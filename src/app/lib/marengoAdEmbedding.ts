/**
 * Build a single ad-level Marengo vector by averaging all TwelveLabs clip segment vectors
 * (same semantics as /api/adInventory and EmbeddingsView PCA input).
 */

export type MarengoClipSegment = { vector?: number[] };

export function averageMarengoClipEmbeddings(
  segments: MarengoClipSegment[] | undefined | null
): number[] | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  let count = 0;
  let sum: number[] | null = null;
  for (const seg of segments) {
    const v = seg.vector;
    if (!Array.isArray(v) || v.length === 0) continue;
    if (sum === null) {
      sum = new Array(v.length).fill(0);
    } else if (v.length !== sum.length) {
      continue;
    }
    for (let i = 0; i < sum.length; i++) sum[i] += v[i];
    count++;
  }
  if (!sum || count === 0) return null;
  return sum.map((x) => x / count);
}

/** Compact JSON for Delta STRING column; Mosaic / from_json can cast to array<double>. */
export function embeddingVectorToJson(vec: number[] | null): string {
  if (!vec || vec.length === 0) return "";
  return JSON.stringify(vec);
}

export type CreativeWithMarengoEmbeddings = {
  embedding_segments?: MarengoClipSegment[] | undefined;
  embedding?: number[] | undefined;
};

/** Clip-averaged Marengo vector, or legacy flat `embedding` from cache. */
export function getMarengoAdVectorForCreative(v: CreativeWithMarengoEmbeddings): number[] | null {
  const fromClips = averageMarengoClipEmbeddings(v.embedding_segments);
  if (fromClips) return fromClips;
  const flat = v.embedding;
  if (Array.isArray(flat) && flat.length > 0 && typeof flat[0] === "number") return flat;
  return null;
}
