import { cymruAsnInfo, cymruOrigin, ptrLookup } from "./ip-quality.js";
import {
  matchByAsn,
  matchByRdns,
  matchByHolder,
} from "../../src/lib/datacenter-match.ts";

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
  // The holder name also labels uncatalogued networks in airport audits.
  const info = !match && asn ? await cymruAsnInfo(asn).catch(() => null) : null;
  if (!match && info) {
    match = matchByHolder(info.holder);
    if (match) method = "holder";
  }
  const base = {
    ip,
    asn,
    prefix: origin?.prefix ?? null,
    rdns: ptr ?? null,
    // Registry country of the announcing network (RIR allocation, not geo).
    cc: origin?.cc ? origin.cc.toUpperCase() : null,
    holder: info?.holder ?? null,
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
    notes: match.notes ?? null,
    verified: match.verified,
  };
}
