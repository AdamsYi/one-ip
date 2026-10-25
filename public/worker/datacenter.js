import catalog from "./datacenters.json" with { type: "json" };
import { cymruAsnInfo, cymruOrigin, ptrLookup } from "./ip-quality.js";

const entries = catalog.entries;

function matchByAsn(asn) {
  if (!Number.isInteger(asn)) return undefined;
  return entries.find((entry) => entry.asn === asn);
}

function matchByRdns(ptr) {
  if (typeof ptr !== "string" || !ptr) return undefined;
  for (const entry of entries) {
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

async function matchByHolder(asn) {
  if (!Number.isInteger(asn)) return undefined;
  const info = await cymruAsnInfo(asn).catch(() => null);
  if (!info?.holder) return undefined;
  const holder = info.holder.toLowerCase();
  return entries.find((entry) => {
    const keys = [entry.holder, entry.brand, ...(entry.aliases ?? [])]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    return keys.some((key) => key.length >= 6 && holder.includes(key));
  });
}

export async function datacenter(ip) {
  const [origin, ptr] = await Promise.all([
    cymruOrigin(ip).catch(() => null),
    ptrLookup(ip).catch(() => null),
  ]);
  const asn = Number.isInteger(origin?.asn) ? origin.asn : null;
  let match = matchByAsn(asn);
  let method = match ? "asn" : "";
  if (!match) {
    match = matchByRdns(ptr);
    if (match) method = "rdns";
  }
  if (!match && asn) {
    match = await matchByHolder(asn);
    if (match) method = "holder";
  }
  const base = {
    ip,
    asn,
    prefix: origin?.prefix ?? null,
    rdns: ptr ?? null,
  };
  if (!match)
    return {
      ...base,
      known: false,
    };
  return {
    ...base,
    known: true,
    method,
    brand: match.brand,
    aliases: match.aliases,
    country: match.country,
    cities: match.cities,
    cost_tier: match.cost_tier,
    price_hint: match.price_hint,
    roles: match.roles,
    verified: match.verified,
  };
}
