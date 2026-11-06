// Shared China-route classification rules, importable by the Worker
// (public/worker/route-verdict.js) and the frontend (return-route paste
// parsing). Keep this module free of node and DOM dependencies.
//
// Prefix facts start from oneclickvirt/backtrace (Apache-2.0) and were
// re-verified against APNIC whois and RIPEstat on 2026-11-05:
// - 59.43.0.0/16 (CN2-BB) is never announced in BGP, so GeoIP/RIB ASNs miss
//   it; only the prefix identifies CN2 hops.
// - 202.97.128.0/17 and 219.158.128.0/17 belong to provincial Unicom /
//   AS4808, not the 163 / 169 backbones.
// - 69.194.160.0/20 is CTGI-HK in whois (router interfaces are unannounced).
// - 223.121.128.0/17 is CMNET (AS9808), not CMI.
// - CMIN2 subnets follow AS58807's announced prefixes; 223.119.33.0/24 is CMI.
// - CMNET backbone spans 221.176.0.0/13.

export type Carrier = "CT" | "CU" | "CM";

/** Backbone a hop belongs to, independent of which ASN GeoIP reports. */
export type Backbone =
  | "cn2"
  | "c163"
  | "ctgnet"
  | "cuii"
  | "cu169"
  | "cug"
  | "cmin2"
  | "cmi"
  | "cmnet";

export interface ChinaRouteRule {
  cidr: string;
  asn: number;
  carrier: Carrier;
  backbone: Backbone;
}

const rule = (
  cidr: string,
  asn: number,
  carrier: Carrier,
  backbone: Backbone,
): ChinaRouteRule => ({ cidr, asn, carrier, backbone });

export const CHINA_ROUTES: ChinaRouteRule[] = [
  rule("59.43.0.0/16", 4809, "CT", "cn2"),
  rule("202.97.0.0/17", 4134, "CT", "c163"),
  rule("69.194.160.0/20", 23764, "CT", "ctgnet"),
  rule("203.22.176.0/21", 23764, "CT", "ctgnet"),
  rule("218.105.0.0/16", 9929, "CU", "cuii"),
  rule("210.51.0.0/16", 9929, "CU", "cuii"),
  rule("219.158.0.0/17", 4837, "CU", "cu169"),
  rule("202.77.16.0/21", 10099, "CU", "cug"),
  rule("43.252.84.0/22", 10099, "CU", "cug"),
  rule("61.14.200.0/22", 10099, "CU", "cug"),
  rule("223.118.32.0/24", 58807, "CM", "cmin2"),
  rule("223.119.8.0/21", 58807, "CM", "cmin2"),
  rule("223.119.26.0/23", 58807, "CM", "cmin2"),
  rule("223.119.28.0/23", 58807, "CM", "cmin2"),
  rule("223.119.32.0/24", 58807, "CM", "cmin2"),
  rule("223.119.34.0/23", 58807, "CM", "cmin2"),
  rule("223.119.36.0/23", 58807, "CM", "cmin2"),
  rule("223.119.74.0/23", 58807, "CM", "cmin2"),
  rule("223.119.88.0/23", 58807, "CM", "cmin2"),
  rule("223.119.100.0/24", 58807, "CM", "cmin2"),
  rule("223.119.252.0/23", 58807, "CM", "cmin2"),
  rule("223.120.128.0/17", 58807, "CM", "cmin2"),
  rule("223.118.0.0/15", 58453, "CM", "cmi"),
  rule("223.120.0.0/17", 58453, "CM", "cmi"),
  rule("223.121.0.0/17", 58453, "CM", "cmi"),
  rule("223.121.128.0/17", 9808, "CM", "cmnet"),
  rule("221.176.0.0/13", 9808, "CM", "cmnet"),
  rule("111.24.0.0/16", 9808, "CM", "cmnet"),
];

// The twelve traceroute targets used by oneclickvirt/backtrace.
export const TRACE_TARGETS: {
  ip: string;
  carrier: Carrier;
  city: string;
  cityKey: string;
}[] = [
  {
    ip: "219.141.140.10",
    carrier: "CT",
    city: "Beijing",
    cityKey: "ip.route.cityBeijing",
  },
  {
    ip: "202.96.209.133",
    carrier: "CT",
    city: "Shanghai",
    cityKey: "ip.route.cityShanghai",
  },
  {
    ip: "58.60.188.222",
    carrier: "CT",
    city: "Guangzhou",
    cityKey: "ip.route.cityGuangzhou",
  },
  {
    ip: "61.139.2.69",
    carrier: "CT",
    city: "Chengdu",
    cityKey: "ip.route.cityChengdu",
  },
  {
    ip: "202.106.195.68",
    carrier: "CU",
    city: "Beijing",
    cityKey: "ip.route.cityBeijing",
  },
  {
    ip: "210.22.97.1",
    carrier: "CU",
    city: "Shanghai",
    cityKey: "ip.route.cityShanghai",
  },
  {
    ip: "210.21.196.6",
    carrier: "CU",
    city: "Guangzhou",
    cityKey: "ip.route.cityGuangzhou",
  },
  {
    ip: "119.6.6.6",
    carrier: "CU",
    city: "Chengdu",
    cityKey: "ip.route.cityChengdu",
  },
  {
    ip: "221.179.155.161",
    carrier: "CM",
    city: "Beijing",
    cityKey: "ip.route.cityBeijing",
  },
  {
    ip: "211.136.112.200",
    carrier: "CM",
    city: "Shanghai",
    cityKey: "ip.route.cityShanghai",
  },
  {
    ip: "120.196.165.24",
    carrier: "CM",
    city: "Guangzhou",
    cityKey: "ip.route.cityGuangzhou",
  },
  {
    ip: "211.137.96.205",
    carrier: "CM",
    city: "Chengdu",
    cityKey: "ip.route.cityChengdu",
  },
];

export function cidrMatch4(ip: string, prefix: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const [base, lenStr] = prefix.split("/");
  const len = Number(lenStr);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(base ?? "")) return false;
  if (!Number.isInteger(len) || len < 0 || len > 32) return false;
  const toInt = (value: string) => {
    const parts = value.split(".").map(Number);
    return (
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    );
  };
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base!) & mask);
}

const prefixLength = (cidr: string) => Number(cidr.split("/")[1]);

/** Longest-prefix match so table order never decides CMIN2 vs CMI. */
export function lookupRoute(address: string): ChinaRouteRule | null {
  if (typeof address !== "string") return null;
  let best: ChinaRouteRule | null = null;
  for (const route of CHINA_ROUTES)
    if (
      cidrMatch4(address, route.cidr) &&
      (!best || prefixLength(route.cidr) > prefixLength(best.cidr))
    )
      best = route;
  return best;
}

export function lookupChinaRoute(address: string): number | null {
  return lookupRoute(address)?.asn ?? null;
}

// ASN-only fallback for hops without an address match (e.g. IPv6 hops or
// pasted output carrying only "[AS9929]"). Access ASNs such as AS4134 or
// AS4837 are deliberately absent: provincial access routers announce those
// ASNs too, so they are not backbone evidence.
const ASN_BACKBONE: Record<number, Backbone> = {
  4809: "cn2",
  23764: "ctgnet",
  9929: "cuii",
  10099: "cug",
  58807: "cmin2",
  58453: "cmi",
};

export interface TraceHop {
  ip?: string | null;
  asn?: number | null;
}

export function hopBackbone(hop: TraceHop): Backbone | null {
  const byPrefix = hop.ip ? lookupRoute(hop.ip) : null;
  if (byPrefix) return byPrefix.backbone;
  return Number.isInteger(hop.asn) ? (ASN_BACKBONE[hop.asn!] ?? null) : null;
}

export function backboneCounts(hops: TraceHop[]) {
  const counts: Partial<Record<Backbone, number>> = {};
  for (const hop of hops) {
    const backbone = hopBackbone(hop);
    if (backbone) counts[backbone] = (counts[backbone] ?? 0) + 1;
  }
  return counts;
}

export interface RouteClassification {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  reason: string;
  reasonValues?: number[];
}

const verdict = (
  code: string,
  rank: number,
  confidence: RouteClassification["confidence"],
  reason: string,
  reasonValues?: number[],
): RouteClassification =>
  reasonValues
    ? { code, rank, confidence, reason, reasonValues }
    : { code, rank, confidence, reason };

/**
 * forward: China → server (GlobalPing China probes); the probe's own network
 *   sits at the start of the path.
 * return: server → China (backtrace / nexttrace on the node); the user's
 *   network sits at the end.
 */
export type RouteDirection = "forward" | "return";

const PREMIUM: Record<Carrier, Backbone[]> = {
  CT: ["cn2", "ctgnet"],
  CU: ["cuii"],
  CM: ["cmin2"],
};
const ORDINARY: Record<Carrier, Backbone> = {
  CT: "c163",
  CU: "cu169",
  CM: "cmi",
};

/**
 * Ordinary backbone hops split by side of the premium segment. User-side hops
 * are the subscriber's own network handing over to the premium line and are
 * expected; server-side hops mean the premium line was left before the server.
 */
function sides(
  seq: (Backbone | null)[],
  carrier: Carrier,
  direction: RouteDirection,
) {
  const premium = PREMIUM[carrier];
  const ordinary = ORDINARY[carrier];
  const first = seq.findIndex((b) => b !== null && premium.includes(b));
  let last = -1;
  seq.forEach((b, i) => {
    if (b !== null && premium.includes(b)) last = i;
  });
  let user = 0;
  let server = 0;
  seq.forEach((b, i) => {
    if (b !== ordinary) return;
    const before = first >= 0 && i < first;
    const after = last >= 0 && i > last;
    const userSide = direction === "forward" ? before : after;
    if (first >= 0 && userSide) user++;
    else server++;
  });
  return { user, server };
}

// Hop-count rules on backbone prefixes only; provincial access routers that
// merely announce AS4134 / AS4837 are never counted. Conventions (verified
// against live GlobalPing paths to known CN2 GIA / 9929 / CMIN2 hosts):
// - GIA: ≥2 CN2 hops, at most one 202.97 hand-over hop on the user side and
//   none on the server side. GT: the path rides 202.97 for ≥2 hops.
// - 9929 / CUP: ≥2 CUII hops and no 169 hops on the server side. Forward
//   paths from 4837 subscribers always cross 169 first, so user-side 169 hops
//   are tolerated there; on return paths only one delivery hop is.
// - 10099 alone is ordinary Unicom international, not CUP.
export function classifyCarrier(
  hops: TraceHop[],
  carrier: Carrier,
  direction: RouteDirection = "return",
): RouteClassification {
  const seq = hops.map(hopBackbone);
  const count = (key: Backbone) => seq.filter((b) => b === key).length;
  const side = sides(seq, carrier, direction);
  if (carrier === "CT") {
    const cn2 = count("cn2");
    const c163 = count("c163");
    const ctg = count("ctgnet");
    if (cn2 >= 1) {
      if (side.server >= 2)
        return verdict("cn2_mixed", 3, "mixed", "cn2_then_163", [
          cn2,
          side.server,
        ]);
      if (side.user >= 2 || side.server === 1)
        return verdict("cn2_gt", 3, "confirmed", "cn2_gt", [c163, cn2]);
      if (cn2 >= 2) return verdict("cn2_gia", 5, "confirmed", "cn2_gia", [cn2]);
      return verdict("cn2_mixed", 3, "unverified", "cn2_single", [cn2]);
    }
    if (ctg >= 1)
      return c163 >= 2
        ? verdict("ctgnet_mixed", 3, "mixed", "ctgnet_mixed", [c163, ctg])
        : verdict("ctgnet", 4, "mixed", "ctgnet", [ctg]);
    if (c163 >= 1) return verdict("163", 2, "confirmed", "c163", [c163]);
    return verdict("unknown", 0, "unverified", "none");
  }
  if (carrier === "CU") {
    const cuii = count("cuii");
    const c169 = count("cu169");
    const cug = count("cug");
    const userTolerance = direction === "forward" ? Infinity : 1;
    if (cuii >= 2)
      return side.server > 0 || side.user > userTolerance
        ? verdict("9929_mixed", 3, "mixed", "c9929_mixed", [c169, cuii])
        : verdict("9929", 5, "confirmed", "c9929", [cuii]);
    if (cuii === 1)
      return verdict("9929_single", 3, "unverified", "c9929_single", [cuii]);
    if (c169 >= 1) return verdict("4837", 2, "confirmed", "cu4837", [c169]);
    if (cug >= 1) return verdict("cug", 2, "unverified", "cug_only", [cug]);
    return verdict("unknown", 0, "unverified", "cu_none");
  }
  const cmin2 = count("cmin2");
  const cmi = count("cmi");
  const cmnet = count("cmnet");
  if (cmin2 >= 1) {
    // Leaving CMIN2 for ≥2 CMI hops before the server means the server is an
    // ordinary CMI customer reached via a CMIN2 transit segment.
    if (side.server >= 2)
      return verdict("cmi", 2, "confirmed", "cmi_via_cmin2", [
        cmin2,
        side.server,
      ]);
    return side.server === 1
      ? verdict("cmin2_mixed", 3, "mixed", "cmin2_mixed", [cmi, cmin2])
      : verdict("cmin2", 5, "confirmed", "cmin2", [cmin2]);
  }
  if (cmi >= 1) return verdict("cmi", 2, "confirmed", "cmi", [cmi]);
  if (cmnet >= 1) return verdict("cmnet", 2, "confirmed", "cmnet", [cmnet]);
  return verdict("unknown", 0, "unverified", "cm_none");
}

/**
 * Combine several probes of one carrier. Agreeing probes keep their verdict;
 * disagreeing ones report the lowest rank seen (the line a user may land on)
 * as "varies by location" instead of inventing a middle rank.
 */
export function mergeVerdicts(
  list: RouteClassification[],
): RouteClassification {
  const solid = list.filter((item) => item.code !== "unknown");
  if (!solid.length)
    return list[0] ?? verdict("unknown", 0, "unverified", "none");
  const codes = new Set(solid.map((item) => item.code));
  if (codes.size === 1)
    return solid.reduce((a, b) =>
      b.confidence === "confirmed" && a.confidence !== "confirmed" ? b : a,
    );
  const ranks = solid.map((item) => item.rank);
  const low = Math.min(...ranks);
  const high = Math.max(...ranks);
  return verdict("varies", low, "mixed", "varies", [solid.length, low, high]);
}
