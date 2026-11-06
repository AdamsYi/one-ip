import { useCallback, useRef, useState } from "react";
import {
  auditAirport,
  isIpLiteral,
  type AirportReport,
  type EntryInfo,
} from "@/lib/airport-audit";
import { lookupEntry, resolveA } from "@/lib/entry-lookup";
import { endpoint, pool } from "@/lib/network";
import { parseSubscription, type ParsedSubscription } from "@/lib/subscription";

export interface PlanUsage {
  upload?: number | null;
  download?: number | null;
  total?: number | null;
  expire?: number | null;
}

export type AuditStage =
  | { step: "idle" }
  | { step: "fetching" }
  | { step: "resolving" }
  | { step: "lookup"; done: number; total: number }
  | { step: "done" }
  | { step: "error"; error: unknown };

// Stays under the per-visitor API limit (180/min) with room for the page's
// other requests; airports rarely expose more distinct entries than this.
// Bounds the DoH fan-out (≈3 lookups per IP) for unusually large airports.
const MAX_ENTRY_IPS = 300;

export function useAirportAudit() {
  const [stage, setStage] = useState<AuditStage>({ step: "idle" });
  const [parsed, setParsed] = useState<ParsedSubscription | null>(null);
  const [report, setReport] = useState<AirportReport | null>(null);
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const controller = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controller.current?.abort();
    setStage({ step: "idle" });
    setParsed(null);
    setReport(null);
    setPlan(null);
  }, []);

  const audit = useCallback(async (content: string, usage?: PlanUsage) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const { signal } = abort;
    setReport(null);
    setPlan(usage ?? null);
    try {
      const subscription = parseSubscription(content);
      setParsed(subscription);
      if (!subscription.nodes.length) {
        setStage({ step: "error", error: new Error("empty") });
        return;
      }
      setStage({ step: "resolving" });
      const domains = [
        ...new Set(
          subscription.nodes
            .map((node) => node.server)
            .filter((host) => !isIpLiteral(host)),
        ),
      ];
      const resolved: Record<string, string[]> = {};
      await pool(
        domains,
        async (host) => {
          resolved[host] = await resolveA(host, signal);
        },
        8,
      );
      const ips = [
        ...new Set(
          subscription.nodes.flatMap((node) =>
            isIpLiteral(node.server)
              ? [node.server]
              : (resolved[node.server] ?? []).slice(0, 1),
          ),
        ),
      ].slice(0, MAX_ENTRY_IPS);
      const entries: Record<string, EntryInfo> = {};
      let done = 0;
      setStage({ step: "lookup", done, total: ips.length });
      await pool(
        ips,
        async (ip) => {
          try {
            entries[ip] = await lookupEntry(ip, signal);
          } catch (error) {
            if (signal.aborted) throw error;
          }
          done++;
          setStage({ step: "lookup", done, total: ips.length });
        },
        8,
      );
      setReport(auditAirport(subscription.nodes, resolved, entries));
      setStage({ step: "done" });
    } catch (error) {
      if (!signal.aborted) setStage({ step: "error", error });
    }
  }, []);

  const fetchAndAudit = useCallback(
    async (url: string) => {
      setStage({ step: "fetching" });
      try {
        const data = await endpoint<{ content: string; userinfo: PlanUsage }>(
          "/airport/subscription",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          },
        );
        await audit(data.content, data.userinfo ?? undefined);
      } catch (error) {
        setStage({ step: "error", error });
      }
    },
    [audit],
  );

  return { stage, parsed, report, plan, audit, fetchAndAudit, reset };
}
