// Datacenter catalog matching shared by the Worker (/api/datacenter) and the
// browser-side airport audit, so both always reach the same verdict.
import catalog from "./datacenters.json" with { type: "json" };
import type { CostTier } from "./verdict.ts";

export interface DatacenterEntry {
  asn: number;
  holder: string;
  brand: string;
  aliases: string[];
  country: string;
  cities: string[];
  rdns: string[];
  cost_tier: CostTier;
  price_hint: string;
  roles: string[];
  notes?: string;
  verified: boolean;
}

export const datacenterEntries = catalog.entries as DatacenterEntry[];

export function matchByAsn(asn: number | null | undefined) {
  if (!Number.isInteger(asn)) return undefined;
  return datacenterEntries.find((entry) => entry.asn === asn);
}

export function matchByRdns(ptr: string | null | undefined) {
  if (typeof ptr !== "string" || !ptr) return undefined;
  for (const entry of datacenterEntries) {
    for (const pattern of entry.rdns ?? []) {
      try {
        if (new RegExp(pattern, "i").test(ptr)) return entry;
      } catch {
        /* skip malformed pattern */
      }
    }
  }
  return undefined;
}

export function matchByHolder(holder: string | null | undefined) {
  if (!holder) return undefined;
  const value = holder.toLowerCase();
  return datacenterEntries.find((entry) => {
    const keys = [entry.holder, entry.brand, ...(entry.aliases ?? [])]
      .filter(Boolean)
      .map((key) => key.toLowerCase());
    return keys.some((key) => key.length >= 6 && value.includes(key));
  });
}

export type MatchMethod = "asn" | "rdns" | "holder";

/** ASN first, then PTR patterns, then the ASN holder name. */
export function matchDatacenter(
  asn: number | null,
  ptr: string | null,
  holder: string | null,
): { entry: DatacenterEntry; method: MatchMethod } | undefined {
  const byAsn = matchByAsn(asn);
  if (byAsn) return { entry: byAsn, method: "asn" };
  const byRdns = matchByRdns(ptr);
  if (byRdns) return { entry: byRdns, method: "rdns" };
  const byHolder = matchByHolder(holder);
  if (byHolder) return { entry: byHolder, method: "holder" };
  return undefined;
}
