// Browser-side entry identification for the airport audit: Team Cymru origin
// and ASN records plus PTR over public DoH, then the shared catalog match.
// Entry IPs never reach the site server, and a 200-node airport does not
// burn the per-visitor API budget.
import type { EntryInfo } from "./airport-audit.ts";
import { matchDatacenter } from "./datacenter-match.ts";

interface DohAnswer {
  type: number;
  data: string;
}

const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

export async function doh(
  name: string,
  type: "A" | "TXT" | "PTR",
  signal?: AbortSignal,
): Promise<DohAnswer[]> {
  let lastError: unknown;
  for (const base of DOH_ENDPOINTS) {
    try {
      const response = await fetch(
        `${base}?name=${encodeURIComponent(name)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
            : AbortSignal.timeout(8000),
          referrerPolicy: "no-referrer",
        },
      );
      if (!response.ok) throw new Error(`DoH ${response.status}`);
      const data = (await response.json()) as { Answer?: DohAnswer[] };
      return Array.isArray(data.Answer) ? data.Answer : [];
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function resolveA(host: string, signal?: AbortSignal) {
  const answers = await doh(host, "A", signal).catch((error) => {
    if (signal?.aborted) throw error;
    return [];
  });
  return answers
    .filter((answer) => answer.type === 1)
    .map((answer) => answer.data);
}

function txtFields(answers: DohAnswer[]) {
  const data = answers.find((answer) => answer.type === 16)?.data;
  if (!data) return null;
  return data
    .replace(/^"|"$/g, "")
    .split("|")
    .map((part) => part.trim());
}

/** "13335 | 104.16.0.0/13 | US | arin | 2014-03-28" → fields. */
export function parseCymruOrigin(answers: DohAnswer[]) {
  const parts = txtFields(answers);
  if (!parts || parts.length < 3) return null;
  // Multi-origin prefixes list several ASNs separated by spaces.
  const asn = Number(parts[0].split(/\s+/)[0]);
  if (!Number.isInteger(asn) || asn <= 0) return null;
  return { asn, prefix: parts[1], cc: parts[2].toUpperCase() || null };
}

/** "13335 | US | arin | 2010-07-14 | CLOUDFLARENET - Cloudflare, Inc., US" */
export function parseCymruHolder(answers: DohAnswer[]) {
  const parts = txtFields(answers);
  return parts && parts.length >= 5 ? parts[4] : null;
}

function reverseV4(ip: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)
    ? ip.split(".").reverse().join(".")
    : null;
}

export async function lookupEntry(
  ip: string,
  signal?: AbortSignal,
): Promise<EntryInfo> {
  const reversed = reverseV4(ip);
  // IPv6 entries are rare in subscriptions; leave them unidentified rather
  // than hand-expanding nibbles here.
  if (!reversed) return { ip, asn: null };
  const [originAnswers, ptrAnswers] = await Promise.all([
    doh(`${reversed}.origin.asn.cymru.com`, "TXT", signal),
    doh(`${reversed}.in-addr.arpa`, "PTR", signal).catch((error) => {
      if (signal?.aborted) throw error;
      return [];
    }),
  ]);
  const origin = parseCymruOrigin(originAnswers);
  const ptr =
    ptrAnswers.find((answer) => answer.type === 12)?.data.replace(/\.$/, "") ??
    null;
  const asn = origin?.asn ?? null;
  let match = matchDatacenter(asn, ptr, null);
  let holder: string | null = null;
  if (!match && asn) {
    holder = parseCymruHolder(
      await doh(`AS${asn}.asn.cymru.com`, "TXT", signal).catch((error) => {
        if (signal?.aborted) throw error;
        return [];
      }),
    );
    match = matchDatacenter(null, null, holder);
  }
  return {
    ip,
    asn,
    cc: origin?.cc ?? null,
    known: Boolean(match),
    brand: match?.entry.brand,
    holder,
    cost_tier: match?.entry.cost_tier ?? null,
    roles: match?.entry.roles,
  };
}
