import { NextResponse } from "next/server";

const CLOUDFRONT_SUFFIX = ".cloudfront.net";

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return false;
  if (h.endsWith(CLOUDFRONT_SUFFIX)) return true;
  const extra = process.env.HLS_PROXY_ALLOWED_HOSTS;
  if (!extra) return false;
  return extra.split(",").some((x) => x.trim().toLowerCase() === h);
}

function toProxyLine(absHref) {
  let u;
  try {
    u = new URL(absHref);
  } catch {
    return absHref;
  }
  if (u.protocol === "https:" && isAllowedHost(u.hostname)) {
    return `/api/hls-proxy?u=${encodeURIComponent(u.href)}`;
  }
  return absHref;
}

/**
 * hls.js resolves relative segment URIs against the request URL. XHR goes to
 * /api/hls-proxy, so paths like "seg.ts" or "/api/seg.ts" become localhost
 * /api/... . Rewrite playlist lines to same-origin proxy URLs that point at
 * the real absolute CDN URLs (base = final URL after redirects).
 */
function rewritePlaylistBody(body, playlistBaseHref) {
  return body.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      if (!/\bURI=/i.test(line)) return line;
      return line.replace(/\bURI=(["'])([^"']+)\1/gi, (full, q, uriRef) => {
        try {
          const abs = new URL(uriRef, playlistBaseHref).href;
          return `URI=${q}${toProxyLine(abs)}${q}`;
        } catch {
          return full;
        }
      });
    }
    if (trimmed === "") return line;
    try {
      const abs = new URL(trimmed, playlistBaseHref).href;
      return toProxyLine(abs);
    } catch {
      return line;
    }
  }).join("\n");
}

function shouldRewriteAsPlaylist(upstream, targetUrl, finalUrl) {
  if (!upstream.ok) return false;
  const path = targetUrl.pathname.toLowerCase();
  let finalPath = "";
  try {
    finalPath = new URL(finalUrl).pathname.toLowerCase();
  } catch {
    /* ignore */
  }
  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  return (
    path.endsWith(".m3u8") ||
    finalPath.endsWith(".m3u8") ||
    ct.includes("mpegurl") ||
    ct.includes("application/x-mpegurl") ||
    (ct.includes("text/plain") && path.endsWith(".m3u8"))
  );
}

/**
 * Same-origin proxy for HLS playlists and segments so hls.js XHR works when
 * the CDN does not send Access-Control-Allow-Origin for localhost.
 * Forwards Range for media segments. Host allowlist limits SSRF risk.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("u");
  if (!raw) {
    return NextResponse.json({ error: "Missing u" }, { status: 400 });
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "Only https allowed" }, { status: 400 });
  }

  if (!isAllowedHost(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("Range", range);

  let upstream;
  try {
    upstream = await fetch(target.toString(), { headers, redirect: "follow" });
  } catch {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  const finalPlaylistBase = upstream.url || target.toString();

  if (shouldRewriteAsPlaylist(upstream, target, finalPlaylistBase)) {
    const text = await upstream.text();
    const rewritten = rewritePlaylistBody(text, finalPlaylistBase);
    const res = new NextResponse(rewritten, { status: upstream.status });
    const ct = upstream.headers.get("content-type");
    if (ct) res.headers.set("Content-Type", ct);
    return res;
  }

  const res = new NextResponse(upstream.body, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) res.headers.set("Content-Type", ct);
  for (const name of ["content-range", "accept-ranges", "content-length"]) {
    const v = upstream.headers.get(name);
    if (v) res.headers.set(name, v);
  }
  return res;
}
