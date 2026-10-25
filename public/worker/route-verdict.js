import { HttpError, json, publicIp, upstream } from "./http.js";
import { cymruOrigin, expandIpv6 } from "./ip-quality.js";
import {
  classifyCarrier,
  lookupChinaRoute,
  mergeVerdicts,
} from "../../src/lib/china-route-rules.ts";

export { classifyCarrier, lookupChinaRoute, mergeVerdicts };

// When the IP itself is announced by one of these networks, the verdict for
// that carrier is direct evidence without any measurement.
const CHINA_ASN_VERDICTS = {
  4809: { carrier: "CT", code: "cn2", rank: 3 },
  23764: { carrier: "CT", code: "ctgnet", rank: 4 },
  4134: { carrier: "CT", code: "163", rank: 2 },
  9929: { carrier: "CU", code: "9929", rank: 5 },
  10099: { carrier: "CU", code: "cug", rank: 3 },
  4837: { carrier: "CU", code: "4837", rank: 2 },
  58807: { carrier: "CM", code: "cmin2", rank: 5 },
  58453: { carrier: "CM", code: "cmi", rank: 2 },
  9808: { carrier: "CM", code: "cmnet", rank: 2 },
};

const PROBE_CARRIER_ASNS = {
  4134: "CT",
  4808: "CT",
  4809: "CT",
  4811: "CT",
  4812: "CT",
  4837: "CU",
  9929: "CU",
  10099: "CU",
  17621: "CU",
  9808: "CM",
  56040: "CM",
  56046: "CM",
  56048: "CM",
  58453: "CM",
  58807: "CM",
};

const CHINA_BACKBONE_ASNS = new Set([
  4809, 4134, 23764, 9929, 10099, 4837, 58807, 58453, 9808,
]);

export function cachePrefix(ip) {
  if (ip.includes(":")) {
    const expanded = expandIpv6(ip);
    if (!expanded) return ip;
    const groups = expanded.match(/.{4}/g) ?? [];
    const first = groups
      .slice(0, 4)
      .map((group) => group.replace(/^0+(?=.{2})/, "").replace(/^0+$/, "0"));
    // Drop a trailing zero group the way RFC 5952 compresses ::/64 prefixes.
    if (first[3] === "0") first.pop();
    return `${first.join(":")}::/64`;
  }
  return `${ip.split(".").slice(0, 3).join(".")}.0/24`;
}

function detectCarrier(probe) {
  const asn = Number.isInteger(probe?.asn) ? probe.asn : null;
  if (asn && PROBE_CARRIER_ASNS[asn]) return PROBE_CARRIER_ASNS[asn];
  const network = String(probe?.network ?? "");
  if (/telecom|chinanet/i.test(network)) return "CT";
  if (/unicom/i.test(network)) return "CU";
  if (/mobile|cmnet|cmcc/i.test(network)) return "CM";
  return null;
}

async function readCache(key) {
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(key).catch(() => undefined);
  if (!cached) return undefined;
  return cached.json().catch(() => undefined);
}

async function writeCache(key, data, ttl) {
  const cache = globalThis.caches?.default;
  if (cache) {
    const entry = json(data);
    entry.headers.set("Cache-Control", `public, max-age=${ttl}`);
    await cache.put(key, entry).catch(() => {});
  }
  return data;
}

async function startMtr(ip, env) {
  const headers = { "Content-Type": "application/json" };
  if (env.GLOBALPING_TOKEN)
    headers.Authorization = `Bearer ${env.GLOBALPING_TOKEN}`;
  const data = await upstream("https://api.globalping.io/v1/measurements", {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "mtr",
      target: ip,
      locations: [
        { magic: "AS4134", limit: 2 },
        { magic: "AS4837", limit: 2 },
        { magic: "AS9808", limit: 2 },
      ],
      measurementOptions: { protocol: "ICMP", packets: 3 },
      inProgressUpdates: false,
    }),
  });
  if (typeof data?.id !== "string" || !data.id)
    throw new Error("GlobalPing response missing measurement id");
  return data.id;
}

async function fetchMeasurement(id, env) {
  const headers = { "Content-Type": "application/json" };
  if (env.GLOBALPING_TOKEN)
    headers.Authorization = `Bearer ${env.GLOBALPING_TOKEN}`;
  return upstream(
    `https://api.globalping.io/v1/measurements/${encodeURIComponent(id)}`,
    { headers },
  );
}

function countHits(paths) {
  const hits = {};
  for (const path of paths)
    for (const asn of path)
      if (CHINA_BACKBONE_ASNS.has(asn)) hits[asn] = (hits[asn] ?? 0) + 1;
  return hits;
}

export function classifyMeasurement(data) {
  const carriers = {};
  const probes = [];
  const byCarrier = { CT: [], CU: [], CM: [] };
  for (const result of data.results ?? []) {
    const probe = result.probe ?? {};
    const carrier = detectCarrier(probe);
    const hops = result.result?.hops ?? [];
    const hopAsns = hops.map((hop) => {
      const asn = Array.isArray(hop.asn)
        ? hop.asn.find((value) => Number.isInteger(value))
        : hop.asn;
      if (Number.isInteger(asn)) return asn;
      return lookupChinaRoute(hop.resolvedAddress) ?? -1;
    });
    probes.push({
      city: probe.location?.city ?? null,
      network: probe.network ?? null,
      asn: Number.isInteger(probe.asn) ? probe.asn : null,
      carrier,
      status: result.result?.status ?? "unknown",
      path_asns: hopAsns.slice(0, 14),
      hops: hops.slice(0, 14).map((hop, index) => ({
        asn: hopAsns[index],
        ip:
          typeof hop.resolvedAddress === "string" ? hop.resolvedAddress : null,
      })),
    });
    if (carrier && result.result?.status === "finished")
      byCarrier[carrier].push(hopAsns);
  }
  for (const carrier of ["CT", "CU", "CM"]) {
    const paths = byCarrier[carrier];
    if (!paths.length) continue;
    const merged = mergeVerdicts(
      paths.map((path) => classifyCarrier(path, carrier)),
    );
    carriers[carrier] = {
      ...merged,
      probes: paths.length,
      hits: countHits(paths),
    };
  }
  return { carriers, probes };
}

export async function routeVerdict(
  ip,
  env = {},
  requestOrigin = "https://route.local",
) {
  ip = publicIp(ip);
  const key = new Request(
    `${requestOrigin}/api/route/v2/${encodeURIComponent(cachePrefix(ip))}`,
  );
  const cached = await readCache(key);
  if (cached) {
    // A pending entry means a measurement is in flight; re-check GlobalPing so
    // polling /route/{ip} alone converges without a separate result call.
    if (cached.status === "pending" && typeof cached.id === "string") {
      const resolved = await routeResult(cached.id, env, requestOrigin).catch(
        () => null,
      );
      if (resolved?.status === "finished" || resolved?.status === "degraded")
        return resolved;
    }
    return cached;
  }
  const origin = await cymruOrigin(ip).catch(() => null);
  const asn = Number.isInteger(origin?.asn) ? origin.asn : null;
  const base = {
    ip,
    asn,
    prefix: origin?.prefix ?? null,
    direction: "to_target",
  };
  const direct = asn ? CHINA_ASN_VERDICTS[asn] : null;
  if (direct) {
    return writeCache(
      key,
      {
        ...base,
        status: "finished",
        method: "asn",
        carriers: {
          [direct.carrier]: {
            code: direct.code,
            rank: direct.rank,
            confidence: "confirmed",
            reason: "origin_asn",
            probes: 0,
            hits: {},
            note: "origin_asn",
          },
        },
        probes: [],
        measured_at: new Date().toISOString(),
      },
      86400,
    );
  }
  if (env.ROUTE_LIMITER) {
    const limited = await env.ROUTE_LIMITER.limit({ key: "global" }).catch(
      () => ({ success: true }),
    );
    if (!limited.success)
      return writeCache(
        key,
        { ...base, status: "degraded", reason: "busy" },
        30,
      );
  }
  try {
    const id = await startMtr(ip, env);
    return writeCache(key, { ...base, status: "pending", id }, 180);
  } catch (error) {
    return writeCache(
      key,
      {
        ...base,
        status: "degraded",
        reason:
          error instanceof HttpError && error.status === 429 ? "busy" : "error",
      },
      30,
    );
  }
}

export async function routeResult(
  id,
  env = {},
  requestOrigin = "https://route.local",
) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
    throw new HttpError(400, "无效的测量 ID");
  const data = await fetchMeasurement(id, env);
  if (data.status === "in-progress")
    return { status: "pending", id, probes_count: data.probesCount ?? null };
  if (!data.target || typeof data.target !== "string")
    throw new HttpError(502, "测量结果缺少目标地址");
  const ip = publicIp(data.target);
  const base = {
    ip,
    direction: "to_target",
    measurement_id: id,
    measured_at: new Date().toISOString(),
  };
  if (data.status !== "finished")
    return { ...base, status: "degraded", reason: String(data.status) };
  const { carriers, probes } = classifyMeasurement(data);
  const key = new Request(
    `${requestOrigin}/api/route/v2/${encodeURIComponent(cachePrefix(ip))}`,
  );
  return writeCache(
    key,
    { ...base, status: "finished", method: "mtr", carriers, probes },
    86400,
  );
}
