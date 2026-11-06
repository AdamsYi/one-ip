// Airport-level audit: combine parsed subscription nodes with resolved entry
// addresses and datacenter lookups into one report. Pure functions only, so
// the browser page and the tests share the exact same verdict logic.
import type { Claim, SubscriptionNode } from "./subscription.ts";
import type { CostTier } from "./verdict.ts";

/**
 * Where a node's entry server sits, which decides the user's real route:
 * - domestic: inside mainland China (国内中转入口, the user's hop is domestic)
 * - premium_line: China premium networks or optimized-route hosts (CN2 GIA,
 *   CMI, 9929…) used as relay entries
 * - cdn: CDN reverse proxy (Cloudflare etc.), route depends on CDN edge
 * - overseas: ordinary overseas datacenter, user connects directly
 */
export type EntryKind =
  "domestic" | "premium_line" | "cdn" | "overseas" | "unknown";

export interface EntryInfo {
  ip: string;
  asn: number | null;
  cc?: string | null;
  known?: boolean;
  brand?: string;
  holder?: string | null;
  cost_tier?: CostTier | null;
  roles?: string[];
}

/**
 * line: most entries are domestic relays or premium-line hosts;
 * partial_line: some relay lines, mostly overseas direct entries;
 * direct: no relay lines, every entry is an overseas host or CDN proxy.
 */
export type Archetype = "line" | "partial_line" | "direct" | "unknown";

export type CostLevel = "high" | "mid" | "low" | "unknown";

export interface Mismatch {
  name: string;
  claim: Claim;
  kind: EntryKind;
  provider: string;
}

export interface ProviderShare {
  key: string;
  label: string;
  asn: number | null;
  kind: EntryKind;
  tier: CostTier | null;
  nodes: number;
  ips: number;
}

export interface AirportReport {
  nodes: number;
  servers: number;
  entryIps: number;
  unresolved: number;
  protocols: [string, number][];
  regions: [string, number][];
  kinds: Record<EntryKind, number>;
  tiers: Record<CostTier | "unknown", number>;
  providers: ProviderShare[];
  mismatches: Mismatch[];
  claimCounts: Partial<Record<Claim, number>>;
  archetype: Archetype;
  /** Operating cost level implied by the entry mix (line cost dominates). */
  costLevel: CostLevel;
  /** Entry IPs worth a China three-carrier measurement, most used first. */
  routeSamples: { ip: string; label: string }[];
}

// Overseas branches of Chinese clouds register some prefixes as CN; they are
// still overseas entries.
const OVERSEAS_CN_ASNS = new Set([45102, 132203, 136907, 135377, 55967]);
// China premium / international carrier networks seen as relay entries.
const PREMIUM_LINE_ASNS = new Set([4809, 23764, 9929, 10099, 58807, 58453]);
const CDN_ASNS = new Set([13335, 209242, 54113, 20940, 16625, 12222]);

export function entryKind(info: EntryInfo | undefined): EntryKind {
  if (!info || !Number.isInteger(info.asn)) return "unknown";
  const asn = info.asn as number;
  if (CDN_ASNS.has(asn)) return "cdn";
  if (PREMIUM_LINE_ASNS.has(asn)) return "premium_line";
  if (info.cc === "CN" && !OVERSEAS_CN_ASNS.has(asn)) return "domestic";
  if (info.roles?.includes("中转入口")) return "premium_line";
  return "overseas";
}

export function providerLabel(info: EntryInfo | undefined): string {
  if (!info) return "?";
  if (info.brand) return info.brand;
  // Cymru holders read "ASNAME - Org Name, CC"; keep the organization.
  if (info.holder)
    return info.holder.replace(/^[^ ]+ - /, "").replace(/,\s*[A-Z]{2}$/, "");
  return info.asn ? `AS${info.asn}` : info.ip;
}

/** A claim in the node name that the measured entry contradicts. */
export function claimConflict(claim: Claim, kind: EntryKind): boolean {
  if (kind === "unknown") return false;
  // IPLC / IEPL entries live inside China (or on a carrier private line).
  if (claim === "iplc") return kind !== "domestic" && kind !== "premium_line";
  // "中转" on a CDN or ordinary overseas host is a plain proxy, not a relay.
  if (claim === "relay") return kind === "cdn" || kind === "overseas";
  return false;
}

function count<T extends string>(values: T[]): [T, number][] {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function isIpLiteral(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

export function archetypeOf(
  kinds: Record<EntryKind, number>,
  total: number,
): Archetype {
  const known = total - kinds.unknown;
  if (!known) return "unknown";
  const line = (kinds.domestic + kinds.premium_line) / known;
  if (line >= 0.5) return "line";
  if (line >= 0.1) return "partial_line";
  return "direct";
}

export function costLevelOf(
  archetype: Archetype,
  tiers: AirportReport["tiers"],
): CostLevel {
  if (archetype === "unknown") return "unknown";
  if (archetype === "line") return "high";
  if (archetype === "partial_line") return "mid";
  // Direct airports: premium/high-tier landing hosts still cost real money.
  const known = tiers.budget + tiers.mid + tiers.high + tiers.premium;
  const upper = tiers.high + tiers.premium;
  return known && upper / known >= 0.5 ? "mid" : "low";
}

export function auditAirport(
  nodes: SubscriptionNode[],
  resolved: Record<string, string[]>,
  entries: Record<string, EntryInfo>,
): AirportReport {
  const kinds: Record<EntryKind, number> = {
    domestic: 0,
    premium_line: 0,
    cdn: 0,
    overseas: 0,
    unknown: 0,
  };
  const tiers: AirportReport["tiers"] = {
    budget: 0,
    mid: 0,
    high: 0,
    premium: 0,
    unknown: 0,
  };
  const providers = new Map<string, ProviderShare & { ipSet: Set<string> }>();
  const mismatches: Mismatch[] = [];
  const claimCounts: AirportReport["claimCounts"] = {};
  const ipUse = new Map<string, number>();
  let unresolved = 0;
  for (const node of nodes) {
    const ips = isIpLiteral(node.server)
      ? [node.server]
      : (resolved[node.server] ?? []);
    if (!ips.length) unresolved++;
    // The first resolved address represents the node; DNS rotation inside one
    // provider does not change the verdict.
    const info = ips.map((ip) => entries[ip]).find(Boolean);
    const kind = entryKind(info);
    kinds[kind]++;
    tiers[info?.cost_tier ?? "unknown"]++;
    if (info) {
      const key = info.asn ? `AS${info.asn}` : info.ip;
      const share = providers.get(key) ?? {
        key,
        label: providerLabel(info),
        asn: info.asn,
        kind,
        tier: info.cost_tier ?? null,
        nodes: 0,
        ips: 0,
        ipSet: new Set<string>(),
      };
      share.nodes++;
      share.ipSet.add(info.ip);
      providers.set(key, share);
      if (kind !== "cdn") ipUse.set(info.ip, (ipUse.get(info.ip) ?? 0) + 1);
    }
    for (const claim of node.claims) {
      claimCounts[claim] = (claimCounts[claim] ?? 0) + 1;
      if (claimConflict(claim, kind))
        mismatches.push({
          name: node.name,
          claim,
          kind,
          provider: providerLabel(info),
        });
    }
  }
  const entryIps = new Set(
    nodes.flatMap((node) =>
      isIpLiteral(node.server) ? [node.server] : (resolved[node.server] ?? []),
    ),
  );
  // Sample distinct providers first so three measurements cover the most
  // representative entries instead of three IPs from one block.
  const byUse = [...ipUse.entries()].sort((a, b) => b[1] - a[1]);
  const routeSamples: AirportReport["routeSamples"] = [];
  const seenProviders = new Set<string>();
  for (const [ip] of byUse) {
    const info = entries[ip];
    const key = info?.asn ? `AS${info.asn}` : ip;
    if (seenProviders.has(key)) continue;
    seenProviders.add(key);
    routeSamples.push({ ip, label: providerLabel(info) });
    if (routeSamples.length === 3) break;
  }
  const archetype = archetypeOf(kinds, nodes.length);
  return {
    nodes: nodes.length,
    servers: new Set(nodes.map((node) => node.server)).size,
    entryIps: entryIps.size,
    unresolved,
    protocols: count(nodes.map((node) => node.protocol)),
    regions: count(nodes.map((node) => node.region ?? "?")),
    kinds,
    tiers,
    providers: [...providers.values()]
      .map(({ ipSet, ...share }) => ({ ...share, ips: ipSet.size }))
      .sort((a, b) => b.nodes - a.nodes),
    mismatches,
    claimCounts,
    archetype,
    costLevel: costLevelOf(archetype, tiers),
    routeSamples,
  };
}
