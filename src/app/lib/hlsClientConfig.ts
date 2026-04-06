import type { HlsConfig } from "hls.js";

function useHlsSameOriginProxy(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

/** hls.js options: on localhost, route XHR through /api/hls-proxy to avoid CDN CORS. */
export function hlsClientConfig(): Partial<HlsConfig> {
  const base: Partial<HlsConfig> = { enableWorker: false };
  if (!useHlsSameOriginProxy()) return base;
  return {
    ...base,
    xhrSetup(xhr: XMLHttpRequest, url: string) {
      try {
        const resolved = new URL(url, window.location.href);
        if (
          resolved.origin === window.location.origin &&
          resolved.pathname === "/api/hls-proxy" &&
          resolved.searchParams.get("u")
        ) {
          xhr.open("GET", `${resolved.pathname}${resolved.search}`, true);
          return;
        }
      } catch {
        /* fall through */
      }
      xhr.open(
        "GET",
        `/api/hls-proxy?u=${encodeURIComponent(url)}`,
        true
      );
    },
  };
}
