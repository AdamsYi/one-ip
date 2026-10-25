import { HttpError } from "./http.js";

export function mapConfig(env) {
  const token =
    typeof env?.TIANDITU_TOKEN === "string" ? env.TIANDITU_TOKEN.trim() : "";
  return token ? { provider: "tianditu", token } : { provider: "osm" };
}

// OpenStreetMap tile proxy. Browsers request tiles same-origin from this
// Worker so client-side routing rules, DNS pollution or ad blockers aimed at
// tile.openstreetmap.org cannot break the map. The Worker fetches upstream
// with an identifying User-Agent per the OSM tile usage policy and caches
// each tile at the edge for a week, which also keeps upstream traffic low.
const TILE_PATH = /^\/api\/map\/tile\/(\d{1,2})\/(\d{1,8})\/(\d{1,8})\.png$/;
const UPSTREAM_UA =
  "OneGlance/1.0 (+https://ip.8686668.xyz; map tiles for IP location display)";

export async function mapTile(url) {
  const match = TILE_PATH.exec(url.pathname);
  if (!match) throw new HttpError(404, "瓦片不存在");
  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const max = z >= 0 && z <= 19 ? 2 ** z : 0;
  if (!max || x >= max || y >= max) throw new HttpError(404, "瓦片不存在");

  const cache = globalThis.caches?.default;
  const key = new Request(url.toString());
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(
      `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      {
        headers: {
          "User-Agent": UPSTREAM_UA,
          Referer: "https://ip.8686668.xyz/",
        },
        cf: { cacheTtl: 604800, cacheEverything: true },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new HttpError(502, "瓦片源连接失败或超时");
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    throw new HttpError(502, "瓦片源暂不可用");
  }
  const bytes = await upstream.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0)
    throw new HttpError(502, "瓦片源暂不可用");
  const tile = new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
  await cache?.put(key, tile.clone()).catch(() => {});
  return tile;
}
