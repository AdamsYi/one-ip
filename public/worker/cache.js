import { json } from "./http.js";

export async function cachedJson(url, ttl, load, cacheable = () => true) {
  const cache = globalThis.caches?.default;
  const cacheUrl = new URL(url);
  cacheUrl.search = "";
  cacheUrl.hash = "";
  const key = new Request(cacheUrl);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    const data = await cached.json().catch(() => undefined);
    if (data !== undefined) return json(data);
  }
  const data = await load();
  const response = json(data);
  if (cache && cacheable(data)) {
    const entry = response.clone();
    entry.headers.set("Cache-Control", `public, max-age=${ttl}`);
    await cache.put(key, entry).catch(() => {});
  }
  // Keep browser responses uncached; only the public result is shared at the edge.
  return response;
}
