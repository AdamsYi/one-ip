// Shared China-route classification rules, importable by the Worker
// (public/worker/route-verdict.js) and the frontend (return-route paste
// parsing). Keep this module free of node and DOM dependencies.
//
// Factual CIDR mapping derived from oneclickvirt/backtrace (Apache-2.0) with
// corrections verified against RIPEstat on 2026-10-25: 202.97 narrowed to /17,
// CUG narrowed to announced subnets, CTGNet narrowed to announced /24s plus
// 203.22.176.0/21, CMIN2 excludes 223.119.33.0/24.

export type Carrier = "CT" | "CU" | "CM";

export interface ChinaRouteRule {
  cidr: string;
  asn: number;
  carrier: Carrier;
  line: string;
}

export const CHINA_ROUTES: ChinaRouteRule[] = [
  { cidr: "59.43.0.0/16", asn: 4809, carrier: "CT", line: "CN2" },
  { cidr: "202.97.0.0/17", asn: 4134, carrier: "CT", line: "163" },
  { cidr: "69.194.163.0/24", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "69.194.171.0/24", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "69.194.172.0/24", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "69.194.173.0/24", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "69.194.175.0/24", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "203.22.176.0/21", asn: 23764, carrier: "CT", line: "CTGNet" },
  { cidr: "218.105.0.0/16", asn: 9929, carrier: "CU", line: "CUII" },
  { cidr: "210.51.0.0/16", asn: 9929, carrier: "CU", line: "CUII" },
  { cidr: "202.77.16.0/21", asn: 10099, carrier: "CU", line: "CUG" },
  { cidr: "43.252.84.0/22", asn: 10099, carrier: "CU", line: "CUG" },
  { cidr: "61.14.200.0/24", asn: 10099, carrier: "CU", line: "CUG" },
  { cidr: "219.158.0.0/16", asn: 4837, carrier: "CU", line: "CU169" },
  { cidr: "223.118.32.0/24", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.8.0/21", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.26.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.28.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.32.0/24", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.34.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.36.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.74.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.88.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.100.0/24", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.119.252.0/23", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.120.128.0/17", asn: 58807, carrier: "CM", line: "CMIN2" },
  { cidr: "223.118.0.0/15", asn: 58453, carrier: "CM", line: "CMI" },
  { cidr: "223.120.0.0/15", asn: 58453, carrier: "CM", line: "CMI" },
  { cidr: "221.183.0.0/16", asn: 9808, carrier: "CM", line: "CMNET" },
  { cidr: "111.24.0.0/16", asn: 9808, carrier: "CM", line: "CMNET" },
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

export function lookupChinaRoute(address: string): number | null {
  if (typeof address !== "string") return null;
  for (const route of CHINA_ROUTES) {
    if (cidrMatch4(address, route.cidr)) return route.asn;
  }
  return null;
}

export interface RouteClassification {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  reason: string;
  reasonValues?: number[];
}

// Classification ported from oneclickvirt/backtrace route_classification.go
// (Apache-2.0); hop order is relative so it holds for either direction.
export function classifyCarrier(
  hops: number[],
  carrier: Carrier,
): RouteClassification {
  const seq = hops.map((asn) => (Number.isInteger(asn) && asn > 0 ? asn : -1));
  const pos = (asn: number) => ({
    idx: seq.indexOf(asn),
    count: seq.reduce((total, value) => (value === asn ? total + 1 : total), 0),
  });
  if (carrier === "CT") {
    const cn2 = pos(4809);
    const c163 = pos(4134);
    const ctg = pos(23764);
    if (cn2.idx >= 0) {
      if (cn2.count < 2)
        return {
          code: "cn2_mixed",
          rank: 3,
          confidence: "mixed",
          reason: "cn2_single",
          reasonValues: [cn2.count],
        };
      if (c163.idx < 0 || (cn2.idx < c163.idx && c163.count <= 1))
        return {
          code: "cn2_gia",
          rank: 5,
          confidence: "confirmed",
          reason: "cn2_gia",
          reasonValues: [cn2.count],
        };
      if (cn2.idx < c163.idx)
        return {
          code: "cn2_mixed",
          rank: 3,
          confidence: "mixed",
          reason: "cn2_then_163",
          reasonValues: [cn2.count, c163.count],
        };
      return {
        code: "cn2_gt",
        rank: 3,
        confidence: "mixed",
        reason: "cn2_gt",
        reasonValues: [c163.count, cn2.count],
      };
    }
    if (ctg.idx >= 0)
      return {
        code: "ctgnet",
        rank: 4,
        confidence: "confirmed",
        reason: "ctgnet",
      };
    if (c163.idx >= 0)
      return c163.count <= 1
        ? {
            code: "inconclusive",
            rank: 0,
            confidence: "unverified",
            reason: "destination_only",
          }
        : {
            code: "163",
            rank: 2,
            confidence: "confirmed",
            reason: "c163",
            reasonValues: [c163.count],
          };
    return {
      code: "unknown",
      rank: 0,
      confidence: "unverified",
      reason: "none",
    };
  }
  if (carrier === "CU") {
    const a9929 = pos(9929);
    const cu4837 = pos(4837);
    const cug = pos(10099);
    if (a9929.idx >= 0) {
      if (cu4837.idx >= 0 && cu4837.idx < a9929.idx)
        return {
          code: "9929_mixed",
          rank: 3,
          confidence: "mixed",
          reason: "c9929_mixed",
        };
      return {
        code: "9929",
        rank: 5,
        confidence: "confirmed",
        reason: "c9929",
      };
    }
    if (cug.idx >= 0)
      return { code: "cug", rank: 3, confidence: "confirmed", reason: "cug" };
    if (cu4837.idx >= 0)
      return cu4837.count <= 1
        ? {
            code: "inconclusive",
            rank: 0,
            confidence: "unverified",
            reason: "cu_destination_only",
          }
        : {
            code: "4837",
            rank: 2,
            confidence: "confirmed",
            reason: "cu4837",
            reasonValues: [cu4837.count],
          };
    return {
      code: "unknown",
      rank: 0,
      confidence: "unverified",
      reason: "cu_none",
    };
  }
  const cmin2 = pos(58807);
  const cmi = pos(58453);
  const cmnet = pos(9808);
  if (cmin2.idx >= 0) {
    if (cmi.idx >= 0 && cmi.idx < cmin2.idx)
      return {
        code: "cmin2_mixed",
        rank: 3,
        confidence: "mixed",
        reason: "cmin2_mixed",
      };
    return { code: "cmin2", rank: 5, confidence: "confirmed", reason: "cmin2" };
  }
  if (cmi.idx >= 0)
    return { code: "cmi", rank: 2, confidence: "confirmed", reason: "cmi" };
  if (cmnet.idx >= 0)
    return { code: "cmnet", rank: 2, confidence: "confirmed", reason: "cmnet" };
  return {
    code: "unknown",
    rank: 0,
    confidence: "unverified",
    reason: "cm_none",
  };
}

export function mergeVerdicts(
  list: RouteClassification[],
): RouteClassification {
  const solid = list.filter(
    (verdict) => verdict.code !== "inconclusive" && verdict.code !== "unknown",
  );
  if (!solid.length)
    return (
      list[0] ?? {
        code: "unknown",
        rank: 0,
        confidence: "unverified",
        reason: "none",
      }
    );
  const codes = new Set(solid.map((verdict) => verdict.code));
  if (codes.size === 1)
    return solid.reduce((a, b) => (b.rank > a.rank ? b : a));
  return {
    code: "dynamic_mixed",
    rank: 3,
    confidence: "mixed",
    reason: "dynamic_mixed",
  };
}
