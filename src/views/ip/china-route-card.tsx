import { CopyButton } from "@/components/copy-button";
import { Pending, ToolCard } from "@/components/toolkit";
import { isMessageKey, t, type MessageKey } from "@/i18n";
import { endpoint } from "@/lib/network";
import { useQuery } from "@tanstack/react-query";

interface CarrierVerdict {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  probes: number;
  hits: Record<string, number>;
  note?: string;
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

function lineLabel(code: string): string {
  const key = `ip.route.line.${code}`;
  return isMessageKey(key) ? t(key) : code;
}

function confidenceLabel(confidence: string): string {
  const key = `ip.route.confidence.${confidence}`;
  return isMessageKey(key) ? t(key) : confidence;
}

function evidenceText(verdict: CarrierVerdict): string {
  const parts = Object.entries(verdict.hits)
    .filter(([, count]) => count > 0)
    .map(([asn, count]) => `AS${asn} ×${count}`);
  if (verdict.note === "origin_asn") return t("ip.route.originAsnEvidence");
  return parts.length
    ? t("ip.route.backboneHits", [parts.join("、")])
    : t("ip.route.noBackboneSeen");
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
        <div className="flex flex-col gap-2">
          {CARRIERS.map(({ key, label }) => {
            const verdict = data.carriers?.[key];
            if (!verdict)
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-sm text-muted-foreground">
                    {t(label)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("ip.route.notMeasured")}
                  </span>
                </div>
              );
            return (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-muted-foreground">
                  {t(label)}
                </span>
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
                <span className="w-full text-xs text-muted-foreground">
                  {evidenceText(verdict)}
                </span>
              </div>
            );
          })}
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
