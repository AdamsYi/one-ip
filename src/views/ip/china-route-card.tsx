import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "@/components/copy-button";
import { ToolCard } from "@/components/toolkit";
import { t, type MessageKey } from "@/i18n";
import { endpoint } from "@/lib/network";
import { useQuery } from "@tanstack/react-query";
import {
  RouteGradeTiles,
  lineLabel,
  reasonText,
  type CarrierKey,
  type GradeVerdict,
} from "./route-grade-tiles";

export { reasonText };

interface CarrierVerdict extends GradeVerdict {
  probes: number;
  rtt?: number | null;
  loss?: number | null;
}

interface Hop {
  asn: number | null;
  ip: string | null;
  backbone?: string | null;
}

interface RouteVerdictData {
  ip: string;
  asn: number | null;
  status: "finished" | "pending" | "degraded";
  reason?: string;
  method?: "domestic" | "mtr";
  domestic?: boolean;
  peak?: boolean;
  beijing_hour?: number;
  packets?: number;
  carriers?: Partial<Record<CarrierKey, CarrierVerdict>>;
  probes?: {
    city: string | null;
    network: string | null;
    asn: number | null;
    carrier: string | null;
    status: string;
    rtt?: number | null;
    loss?: number | null;
    code?: string;
    hops?: Hop[];
  }[];
}

const CARRIER_LABEL: Record<CarrierKey, MessageKey> = {
  CT: "ip.route.carrierCT",
  CU: "ip.route.carrierCU",
  CM: "ip.route.carrierCM",
};

// Backbone of a hop → chip color (premium lines warm, ordinary cool).
const BACKBONE_CLASS: Record<string, string> = {
  cn2: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  ctgnet: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cuii: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  cmin2: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  c163: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  cu169: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  cug: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  cmi: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  cmnet: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
};

const BACKBONE_LABEL: Record<string, string> = {
  cn2: "CN2",
  c163: "163",
  ctgnet: "CTG",
  cuii: "9929",
  cu169: "169",
  cug: "CUG",
  cmin2: "CMIN2",
  cmi: "CMI",
  cmnet: "CMNET",
};

export function HopChain({ hops }: { hops: Hop[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {hops.map((hop, index) => {
        const asn = hop.asn;
        const backbone = hop.backbone ?? null;
        const label = backbone
          ? BACKBONE_LABEL[backbone]
          : asn && asn > 0
            ? `AS${asn}`
            : "·";
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground/50" aria-hidden="true">
                →
              </span>
            )}
            <span
              title={
                [hop.ip, asn && asn > 0 ? `AS${asn}` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                backbone
                  ? BACKBONE_CLASS[backbone]
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

function PathDetails({ data }: { data: RouteVerdictData }) {
  return (
    <div className="flex flex-col gap-3">
      {(["CT", "CU", "CM"] as const).map((key) => {
        const verdict = data.carriers?.[key];
        const probes = (data.probes ?? []).filter(
          (probe) => probe.carrier === key && (probe.hops?.length ?? 0) > 0,
        );
        if (!verdict && !probes.length) return null;
        const stats =
          verdict && verdict.rtt != null
            ? t("ip.route.statsLine", [verdict.rtt, verdict.loss ?? 0])
            : "";
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">
              {t(CARRIER_LABEL[key])}
              <span className="ml-2 font-normal text-muted-foreground">
                {stats}
              </span>
            </span>
            {probes.map((probe, index) => (
              <div
                key={index}
                className="flex flex-col gap-1 rounded-lg border border-border p-2"
              >
                <span className="text-xs text-muted-foreground">
                  {probe.city ?? probe.network}
                  {probe.asn ? ` · AS${probe.asn}` : ""}
                  {probe.code ? ` · ${lineLabel(probe.code)}` : ""}
                  {probe.rtt != null
                    ? ` · ${t("ip.route.statsLine", [probe.rtt, probe.loss ?? 0])}`
                    : ""}
                </span>
                <HopChain hops={probe.hops ?? []} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function ChinaRouteCard({ ip }: { ip: string }) {
  const [expanded, setExpanded] = useState(false);
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
  const pending = query.isPending || data?.status === "pending";
  const selfTestCommand =
    "curl -sSf https://raw.githubusercontent.com/oneclickvirt/backtrace/main/backtrace_install.sh | bash && backtrace";
  const hasPaths = (data?.probes ?? []).some(
    (probe) => (probe.hops?.length ?? 0) > 0,
  );
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
      {query.isError ? (
        <p className="text-sm text-muted-foreground">
          {t("ip.route.unavailable")}
        </p>
      ) : data?.status === "degraded" ? (
        <p className="text-sm text-muted-foreground">
          {data.reason === "busy"
            ? t("ip.route.queued")
            : t("ip.route.unavailable")}
          {data.asn ? ` · AS${data.asn}` : ""}
        </p>
      ) : data?.domestic ? (
        <p className="text-sm">{t("ip.route.domesticEntry")}</p>
      ) : (
        <RouteGradeTiles carriers={data?.carriers} pending={pending} />
      )}
      {data?.status === "finished" && data.method === "mtr" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(data.peak ? "ip.route.measuredPeak" : "ip.route.measuredOffPeak", [
            data.beijing_hour ?? "?",
          ])}
        </p>
      )}
      {data?.status === "finished" && hasPaths && (
        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("ip.route.hideHops") : t("ip.route.showHops")}
          </button>
          {expanded && (
            <div className="mt-2">
              <PathDetails data={data} />
            </div>
          )}
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
        {t("ip.route.disclaimer")} ·{" "}
        <Link
          to="/methodology"
          className="text-primary underline-offset-2 hover:underline"
        >
          {t("methodology.link")}
        </Link>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("ip.route.relayHint")}{" "}
        <Link
          to="/airport"
          className="text-primary underline-offset-2 hover:underline"
        >
          {t("navigation.airport")}
        </Link>
      </p>
    </ToolCard>
  );
}
