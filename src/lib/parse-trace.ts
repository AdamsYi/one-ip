// Parse user-pasted traceroute output (nexttrace / backtrace / plain
// traceroute) into per-carrier hop sequences so the return route can be
// classified with the same shared rules as our forward measurement.
import {
  classifyCarrier,
  lookupChinaRoute,
  mergeVerdicts,
  TRACE_TARGETS,
  type Carrier,
} from "./china-route-rules.ts";

export interface ParsedHop {
  asn: number | null;
  ip: string;
}

export interface ParsedTrace {
  carrier: Carrier;
  city: string;
  cityKey: string;
  hops: ParsedHop[];
}

const TARGET_BY_IP = new Map(
  TRACE_TARGETS.map((target) => [target.ip, target]),
);

const TARGET_LINE = /(\d{1,3}(?:\.\d{1,3}){3})/g;
const HOP_LINE = /^\s*(\d{1,2})\s*[.:)\]]?\s+(\d{1,3}(?:\.\d{1,3}){3})\b(.*)$/;

export function parseTraceOutput(text: string): ParsedTrace[] {
  const traces: ParsedTrace[] = [];
  let current: ParsedTrace | null = null;
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const targetMatch = findTarget(rawLine);
    if (targetMatch && !isHopLine(rawLine)) {
      // Every target line starts a new trace block; per-carrier merging of
      // several blocks happens later in classifyParsedTraces.
      current = {
        carrier: targetMatch.carrier,
        city: targetMatch.city,
        cityKey: targetMatch.cityKey,
        hops: [],
      };
      traces.push(current);
      continue;
    }
    if (!current) continue;
    const hopMatch = rawLine.match(HOP_LINE);
    if (!hopMatch) continue;
    const ip = hopMatch[2];
    const asnText = hopMatch[3]?.match(/AS(\d{1,10})/);
    const asn = asnText ? Number(asnText[1]) : lookupChinaRoute(ip);
    if (current.hops.length >= 20) continue;
    // The final hop toward the target stays in the path: its delivery ASN
    // participates in the GIA/GT ordering rules.
    current.hops.push({ asn: Number.isInteger(asn) ? asn : null, ip });
  }
  return traces.filter((trace) => trace.hops.length > 0);
}

function findTarget(line: string) {
  for (const match of line.matchAll(TARGET_LINE)) {
    const target = TARGET_BY_IP.get(match[1]);
    if (target) return target;
  }
  return null;
}

function isHopLine(line: string) {
  // Header lines (e.g. "traceroute to ..." or "北京电信 1.2.3.4 :") never
  // start with a hop index, so HOP_LINE alone separates them.
  return HOP_LINE.test(line);
}

export interface ReturnRouteVerdict {
  carrier: Carrier;
  city: string;
  cityKey: string;
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  reason: string;
  reasonValues?: number[];
  hops: ParsedHop[];
}

export function classifyParsedTraces(
  traces: ParsedTrace[],
): ReturnRouteVerdict[] {
  const byCarrier = new Map<Carrier, ParsedTrace[]>();
  for (const trace of traces) {
    byCarrier.set(trace.carrier, [
      ...(byCarrier.get(trace.carrier) ?? []),
      trace,
    ]);
  }
  const verdicts: ReturnRouteVerdict[] = [];
  for (const [carrier, list] of byCarrier) {
    const paths = list.map((trace) => trace.hops.map((hop) => hop.asn ?? -1));
    const merged = mergeVerdicts(
      paths.map((path) => classifyCarrier(path, carrier)),
    );
    verdicts.push({
      carrier,
      city: list[0].city,
      cityKey: list[0].cityKey,
      ...merged,
      hops: list[0].hops,
    });
  }
  return verdicts;
}
