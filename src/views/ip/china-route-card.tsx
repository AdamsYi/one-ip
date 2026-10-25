import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Pending, ToolCard } from "@/components/toolkit";
import { isMessageKey, t, type MessageKey } from "@/i18n";
import { endpoint } from "@/lib/network";
import { useQuery } from "@tanstack/react-query";

interface CarrierVerdict {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  reason?: string;
  reasonValues?: number[];
  probes: number;
  hits: Record<string, number>;
  note?: string;
}

interface Hop {
  asn: number | null;
  ip: string | null;
}

interface RouteVerdictData {
  ip: string;
  asn: number | null;
  status: "finished" | "pending" | "degraded";
  reason?: string;
  method?: "asn" | "mtr";
  direction?: "to_target";
  measurement_id?: string;
  id?: string;
  carriers?: Partial<Record<"CT" | "CU" | "CM", CarrierVerdict>>;
  probes?: {
    city: string | null;
    network: string | null;
    asn: number | null;
    carrier: string | null;
    status: string;
    path_asns: number[];
    hops?: Hop[];
  }[];
}

const CARRIERS: { key: "CT" | "CU" | "CM"; label: MessageKey }[] = [
  { key: "CT", label: "ip.route.carrierCT" },
  { key: "CU", label: "ip.route.carrierCU" },
  { key: "CM", label: "ip.route.carrierCM" },
];

const CONFIDENCE_DOT: Record<string, string> = {
  confirmed: "bg-emerald-500",
  mixed: "bg-amber-500",
  unverified: "bg-muted-foreground/40",
};

// China backbone ASN → chip color; everything else stays neutral.
const ASN_CLASS: Record<number, string> = {
  4809: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  23764: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  9929: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  10099: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  58807: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  4134: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  4837: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  58453: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  9808: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
};

function lineLabel(code: string): string {
  const key = `ip.route.line.${code}`;
  return isMessageKey(key) ? t(key) : code;
}

function confidenceLabel(confidence: string): string {
  const key = `ip.route.confidence.${confidence}`;
  return isMessageKey(key) ? t(key) : confidence;
}

export function reasonText(verdict: {
  reason?: string;
  reasonValues?: number[];
}): string | null {
  if (!verdict.reason) return null;
  const key = `ip.route.reason.${verdict.reason}`;
  if (!isMessageKey(key)) return null;
  return t(key, (verdict.reasonValues ?? []).map(String));
}

export function HopChain({ hops }: { hops: Hop[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {hops.map((hop, index) => {
        const asn = hop.asn;
        const label = asn && asn > 0 ? `AS${asn}` : "·";
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground/50" aria-hidden="true">
                →
              </span>
            )}
            <span
              title={hop.ip ?? undefined}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                asn && ASN_CLASS[asn]
                  ? ASN_CLASS[asn]
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function CarrierRow({
  label,
  verdict,
  probes,
  direction,
}: {
  label: string;
  verdict?: CarrierVerdict;
  probes?: RouteVerdictData["probes"];
  direction: "to_target" | "to_china";
}) {
  const [expanded, setExpanded] = useState(false);
  const carrierProbes = (probes ?? []).filter(
    (probe) =>
      probe.carrier ===
      (label === t("ip.route.carrierCT")
        ? "CT"
        : label === t("ip.route.carrierCU")
          ? "CU"
          : "CM"),
  );
  const hasPath =
    direction === "to_target" &&
    carrierProbes.some((probe) => (probe.hops?.length ?? 0) > 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {verdict ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {lineLabel(verdict.code)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-block size-2 rounded-full ${CONFIDENCE_DOT[verdict.confidence]}`}
                aria-hidden="true"
              />
              {confidenceLabel(verdict.confidence)}
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      {verdict && reasonText(verdict) && (
        <p className="text-xs text-muted-foreground">{reasonText(verdict)}</p>
      )}
      {verdict && direction === "to_target" && (
        <p className="text-xs text-muted-foreground">
          {Object.entries(verdict.hits)
            .filter(([, count]) => count > 0)
            .map(([asn, count]) => `AS${asn} ×${count}`)
            .join("、") || t("ip.route.noBackboneSeen")}
        </p>
      )}
      {hasPath && (
        <button
          type="button"
          className="w-fit text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t("ip.route.hideHops") : t("ip.route.showHops")}
        </button>
      )}
      {expanded &&
        carrierProbes.map((probe, index) => (
          <div
            key={index}
            className="flex flex-col gap-1 rounded-lg border border-border p-2"
          >
            <span className="text-xs text-muted-foreground">
              {probe.city ?? probe.network}
              {probe.asn ? ` · AS${probe.asn}` : ""}
            </span>
            <HopChain hops={probe.hops ?? []} />
          </div>
        ))}
    </div>
  );
}

export function ChinaRouteCard({ ip }: { ip: string }) {
  const query = useQuery({
    queryKey: ["china-route", ip],
    queryFn: ({ signal }) =>
      endpoint<RouteVerdictData>(`/route/${encodeURIComponent(ip)}`, {
        signal,
      }),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 3000 : false,
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const selfTestCommand =
    "curl -sSf https://raw.githubusercontent.com/oneclickvirt/backtrace/main/backtrace_install.sh | bash && backtrace";
  return (
    <ToolCard
      className="china-route-card"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("ip.route.title")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("ip.route.toTargetNote")}
          </span>
        </span>
      }
    >
      {query.isPending && <Pending>{t("common.checking")}</Pending>}
      {query.isError && (
        <p className="text-sm text-muted-foreground">
          {t("ip.route.unavailable")}
        </p>
      )}
      {data?.status === "pending" && (
        <Pending>{t("ip.route.measuring")}</Pending>
      )}
      {data?.status === "degraded" && (
        <p className="text-sm text-muted-foreground">
          {data.reason === "busy"
            ? t("ip.route.queued")
            : t("ip.route.unavailable")}
          {data.asn ? ` · AS${data.asn}` : ""}
        </p>
      )}
      {data?.status === "finished" && (
        <div className="flex flex-col gap-3">
          {CARRIERS.map(({ key, label }) => (
            <CarrierRow
              key={key}
              label={t(label)}
              verdict={data.carriers?.[key]}
              probes={data.probes}
              direction="to_target"
            />
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
        <code className="max-w-full truncate text-xs text-muted-foreground">
          {selfTestCommand}
        </code>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("ip.route.selfTestLabel")}
          </span>
          <CopyButton value={selfTestCommand} />
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("ip.route.disclaimer")}
      </p>
    </ToolCard>
  );
}
