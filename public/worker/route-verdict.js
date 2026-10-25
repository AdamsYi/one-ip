import chinaRoutes from "./china-routes.json" with { type: "json" };
import { HttpError, json, publicIp, upstream } from "./http.js";
import { cidrMatch, cymruOrigin, expandIpv6 } from "./ip-quality.js";

const ROUTES = chinaRoutes.routes;

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

export function lookupChinaRoute(address) {
  if (typeof address !== "string") return null;
  for (const route of ROUTES) {
    if (cidrMatch(address, route.cidr)) return route.asn;
  }
  return null;
}

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

// Classification ported from oneclickvirt/backtrace route_classification.go
// (Apache-2.0); hop order is relative so it holds for either direction.
export function classifyCarrier(hops, carrier) {
  const seq = hops.map((asn) => (Number.isInteger(asn) && asn > 0 ? asn : -1));
  const pos = (asn) => ({
    idx: seq.indexOf(asn),
    count: seq.reduce((total, value) => (value === asn ? total + 1 : total), 0),
  });
  if (carrier === "CT") {
    const cn2 = pos(4809);
    const c163 = pos(4134);
    const ctg = pos(23764);
    if (cn2.idx >= 0) {
      if (cn2.count < 2)
        return { code: "cn2_mixed", rank: 3, confidence: "mixed" };
      if (c163.idx < 0 || (cn2.idx < c163.idx && c163.count <= 1))
        return { code: "cn2_gia", rank: 5, confidence: "confirmed" };
      if (cn2.idx < c163.idx)
        return { code: "cn2_mixed", rank: 3, confidence: "mixed" };
      return { code: "cn2_gt", rank: 3, confidence: "mixed" };
    }
    if (ctg.idx >= 0)
      return { code: "ctgnet", rank: 4, confidence: "confirmed" };
    if (c163.idx >= 0)
      return c163.count <= 1
        ? { code: "inconclusive", rank: 0, confidence: "unverified" }
        : { code: "163", rank: 2, confidence: "confirmed" };
    return { code: "unknown", rank: 0, confidence: "unverified" };
  }
  if (carrier === "CU") {
    const a9929 = pos(9929);
    const cu4837 = pos(4837);
    const cug = pos(10099);
    if (a9929.idx >= 0) {
      if (cu4837.idx >= 0 && cu4837.idx < a9929.idx)
        return { code: "9929_mixed", rank: 3, confidence: "mixed" };
      return { code: "9929", rank: 5, confidence: "confirmed" };
    }
    if (cug.idx >= 0) return { code: "cug", rank: 3, confidence: "confirmed" };
    if (cu4837.idx >= 0)
      return cu4837.count <= 1
        ? { code: "inconclusive", rank: 0, confidence: "unverified" }
        : { code: "4837", rank: 2, confidence: "confirmed" };
    return { code: "unknown", rank: 0, confidence: "unverified" };
  }
  const cmin2 = pos(58807);
  const cmi = pos(58453);
  const cmnet = pos(9808);
  if (cmin2.idx >= 0) {
    if (cmi.idx >= 0 && cmi.idx < cmin2.idx)
      return { code: "cmin2_mixed", rank: 3, confidence: "mixed" };
    return { code: "cmin2", rank: 5, confidence: "confirmed" };
  }
  if (cmi.idx >= 0) return { code: "cmi", rank: 2, confidence: "confirmed" };
  if (cmnet.idx >= 0)
    return { code: "cmnet", rank: 2, confidence: "confirmed" };
  return { code: "unknown", rank: 0, confidence: "unverified" };
}

export function mergeVerdicts(list) {
  const solid = list.filter(
    (verdict) => verdict.code !== "inconclusive" && verdict.code !== "unknown",
  );
  if (!solid.length)
    return list[0] ?? { code: "unknown", rank: 0, confidence: "unverified" };
  const codes = new Set(solid.map((verdict) => verdict.code));
  if (codes.size === 1)
    return solid.reduce((a, b) => (b.rank > a.rank ? b : a));
  return { code: "dynamic_mixed", rank: 3, confidence: "mixed" };
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
    `${requestOrigin}/api/route/v1/${encodeURIComponent(cachePrefix(ip))}`,
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
    `${requestOrigin}/api/route/v1/${encodeURIComponent(cachePrefix(ip))}`,
  );
  return writeCache(
    key,
    { ...base, status: "finished", method: "mtr", carriers, probes },
    86400,
  );
}
