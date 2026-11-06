import { HttpError, json, publicIp, upstream } from "./http.js";
import { cymruOrigin, expandIpv6 } from "./ip-quality.js";
import {
  classifyCarrier,
  hopBackbone,
  lookupChinaRoute,
  mergeVerdicts,
} from "../../src/lib/china-route-rules.ts";

export { classifyCarrier, lookupChinaRoute, mergeVerdicts };

// Probe ASNs per carrier. Only eyeball (home/provincial) networks count:
// IDC probes such as AS23724 may sit directly on CN2 and fake a GIA path.
const PROBE_CARRIER_ASNS = {
  4134: "CT",
  4812: "CT",
  4811: "CT",
  4837: "CU",
  4808: "CU",
  17621: "CU",
  17622: "CU",
  9808: "CM",
  56040: "CM",
  56041: "CM",
  56042: "CM",
  56044: "CM",
  56046: "CM",
  56047: "CM",
  56048: "CM",
  24400: "CM",
};

// Overseas branches of Chinese clouds register some prefixes as CN; they are
// not mainland entries.
const OVERSEAS_CN_ASNS = new Set([45102, 132203, 136907, 135377, 55967]);
// Carrier international / premium networks that announce overseas space.
const CARRIER_OVERSEAS_ASNS = new Set([4809, 23764, 10099, 58807, 58453]);

const PACKETS = 10;
const PROBES_PER_CARRIER = 3;

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
  const tags = Array.isArray(probe?.tags) ? probe.tags : [];
  if (tags.includes("datacenter-network")) return null;
  return asn ? (PROBE_CARRIER_ASNS[asn] ?? null) : null;
}

/** Beijing hour and whether it falls in the 20:00–23:59 evening peak. */
export function beijingTime(date = new Date()) {
  const hour = (date.getUTCHours() + 8) % 24;
  return { beijing_hour: hour, peak: hour >= 20 };
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
        { magic: "AS4134", limit: PROBES_PER_CARRIER },
        { magic: "AS4837", limit: PROBES_PER_CARRIER },
        { magic: "AS9808", limit: PROBES_PER_CARRIER },
      ],
      measurementOptions: { protocol: "ICMP", packets: PACKETS },
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

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;

export function classifyMeasurement(data) {
  const carriers = {};
  const probes = [];
  const byCarrier = { CT: [], CU: [], CM: [] };
  for (const result of data.results ?? []) {
    const probe = result.probe ?? {};
    const carrier = detectCarrier(probe);
    const rawHops = (result.result?.hops ?? []).slice(0, 30);
    const hops = rawHops.map((hop) => {
      const asn = Array.isArray(hop.asn)
        ? hop.asn.find((value) => Number.isInteger(value))
        : hop.asn;
      const ip =
        typeof hop.resolvedAddress === "string" ? hop.resolvedAddress : null;
      return {
        ip,
        asn: Number.isInteger(asn) ? asn : (lookupChinaRoute(ip) ?? null),
        backbone: hopBackbone({ ip, asn }),
      };
    });
    // End-to-end stats (which include the return leg) only count when the
    // final hop really is the target; otherwise they belong to a middle hop.
    const final = rawHops.at(-1);
    const last =
      final?.resolvedAddress === data.target && final?.stats?.rcv > 0
        ? final
        : null;
    const status = result.result?.status ?? "unknown";
    probes.push({
      city: probe.city ?? probe.location?.city ?? null,
      network: probe.network ?? null,
      asn: Number.isInteger(probe.asn) ? probe.asn : null,
      carrier,
      status,
      rtt: round1(last?.stats?.avg),
      loss: round1(last?.stats?.loss),
      hops,
    });
    if (carrier && status === "finished") {
      const item = classifyCarrier(hops, carrier, "forward");
      probes[probes.length - 1].code = item.code;
      byCarrier[carrier].push(item);
    }
  }
  for (const carrier of ["CT", "CU", "CM"]) {
    const verdicts = byCarrier[carrier];
    if (!verdicts.length) continue;
    const stats = probes.filter(
      (probe) => probe.carrier === carrier && probe.status === "finished",
    );
    carriers[carrier] = {
      ...mergeVerdicts(verdicts),
      probes: verdicts.length,
      rtt: round1(
        median(stats.map((probe) => probe.rtt).filter((v) => v !== null)),
      ),
      loss: round1(Math.max(0, ...stats.map((probe) => probe.loss ?? 0))),
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
    `${requestOrigin}/api/route/v3/${encodeURIComponent(cachePrefix(ip))}`,
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
  // A mainland address means the node itself sits in China: it is a domestic
  // relay entry, so a China → node "route" says nothing about line quality.
  // Carrier international networks (CN2/CMI/CUG…) register overseas space
  // under CN too, so they are measured like any overseas host.
  const mainland =
    origin?.cc === "cn" &&
    !OVERSEAS_CN_ASNS.has(asn) &&
    !CARRIER_OVERSEAS_ASNS.has(asn);
  if (mainland)
    return writeCache(
      key,
      {
        ...base,
        status: "finished",
        method: "domestic",
        domestic: true,
        carriers: {},
        probes: [],
        measured_at: new Date().toISOString(),
      },
      86400,
    );
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
    ...beijingTime(),
    packets: PACKETS,
  };
  if (data.status !== "finished")
    return { ...base, status: "degraded", reason: String(data.status) };
  const { carriers, probes } = classifyMeasurement(data);
  const key = new Request(
    `${requestOrigin}/api/route/v3/${encodeURIComponent(cachePrefix(ip))}`,
  );
  return writeCache(
    key,
    { ...base, status: "finished", method: "mtr", carriers, probes },
    86400,
  );
}
