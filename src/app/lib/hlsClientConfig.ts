import type { HlsConfig } from "hls.js";

/**
 * hls.js config: always route XHR through /api/hls-proxy.
 *
 * Why: The TwelveLabs CloudFront CDN does not return Access-Control-Allow-Origin
 * headers on HLS playlist/segment requests. hls.js uses XHR which triggers CORS
 * preflight — unlike <video src> which browsers handle without CORS checks.
 * Routing all requests through our same-origin Next.js proxy sidesteps CORS
 * entirely: the server-side fetch has no origin restrictions.
 *
 * Security: the proxy allowlist in /api/hls-proxy enforces that only
 * *.cloudfront.net hosts are proxied, preventing SSRF.
 */
export function hlsClientConfig(): Partial<HlsConfig> {
  return {
    enableWorker: false,
    xhrSetup(xhr: XMLHttpRequest, url: string) {
      // If the URL is already a same-origin proxy URL, open it directly.
      try {
        if (typeof window !== "undefined") {
          const resolved = new URL(url, window.location.href);
          if (
            resolved.origin === window.location.origin &&
            resolved.pathname === "/api/hls-proxy" &&
            resolved.searchParams.get("u")
          ) {
            xhr.open("GET", `${resolved.pathname}${resolved.search}`, true);
            return;
          }
        }
      } catch {
        /* fall through */
      }
      // Route all other URLs (CloudFront CDN segments/playlists) through the proxy.
      xhr.open("GET", `/api/hls-proxy?u=${encodeURIComponent(url)}`, true);
    },
  };
}
