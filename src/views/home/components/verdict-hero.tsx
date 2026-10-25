import { CountryFlag } from "@/components/country-flag";
import { Card } from "@/components/ui/card";
import { isMessageKey, t } from "@/i18n";
import { ipScoreColor } from "@/lib/ip-score";
import { maskedIp, endpoint } from "@/lib/network";
import type { Geo } from "@/lib/types";
import { verdict } from "@/lib/verdict";
import { hideIpAtom } from "@/store/privacy";
import { lookupIp } from "@/views/ip/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { BadgeCheck, Compass } from "lucide-react";

interface DatacenterEntry {
  known: boolean;
  asn: number | null;
  brand?: string;
  cost_tier?: "budget" | "mid" | "high" | "premium" | null;
}

interface CarrierVerdict {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
}

interface RouteVerdictData {
  status: "finished" | "pending" | "degraded";
  carriers?: Partial<Record<"CT" | "CU" | "CM", CarrierVerdict>>;
}

const CARRIERS: {
  key: "CT" | "CU" | "CM";
  label: "ip.route.carrierCT" | "ip.route.carrierCU" | "ip.route.carrierCM";
}[] = [
  { key: "CT", label: "ip.route.carrierCT" },
  { key: "CU", label: "ip.route.carrierCU" },
  { key: "CM", label: "ip.route.carrierCM" },
];

const LINE_LABELS: Record<string, string> = {
  cn2_gia: "ip.route.line.cn2_gia",
  cn2_gt: "ip.route.line.cn2_gt",
  cn2_mixed: "ip.route.line.cn2_mixed",
  cn2: "ip.route.line.cn2",
  ctgnet: "ip.route.line.ctgnet",
  "163": "ip.route.line.163",
  "9929": "ip.route.line.9929",
  "9929_mixed": "ip.route.line.9929_mixed",
  cug: "ip.route.line.cug",
  "4837": "ip.route.line.4837",
  cmin2: "ip.route.line.cmin2",
  cmin2_mixed: "ip.route.line.cmin2_mixed",
  cmi: "ip.route.line.cmi",
  cmnet: "ip.route.line.cmnet",
  dynamic_mixed: "ip.route.line.dynamic_mixed",
};

function lineLabel(code: string): string {
  const key = LINE_LABELS[code];
  return key && isMessageKey(key) ? t(key) : code;
}

const CONFIDENCE_DOT: Record<string, string> = {
  confirmed: "bg-emerald-500",
  mixed: "bg-amber-500",
  unverified: "bg-muted-foreground/40",
};

export function VerdictHero({ geo }: { geo: Geo }) {
  const [hidden] = useAtom(hideIpAtom);
  const ip = geo.ip;
  const qualityQuery = useQuery({
    queryKey: ["lookup-ip-coffee", ip],
    queryFn: ({ signal }) => lookupIp(ip, signal),
    staleTime: 3600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const datacenterQuery = useQuery({
    queryKey: ["datacenter", ip],
    queryFn: ({ signal }) =>
      endpoint<DatacenterEntry>(`/datacenter/${encodeURIComponent(ip)}`, {
        signal,
      }),
    staleTime: 3600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const routeQuery = useQuery({
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

  const quality = qualityQuery.data?.coffee;
  const dc = datacenterQuery.data;
  const route = routeQuery.data;
  const result = verdict(quality, dc, route);
  const scoreColor = result.score !== null ? ipScoreColor(result.score) : null;
  const stampable =
    !result.pending && result.tier !== "unknown" && result.tier !== "public";

  return (
    <Card className="verdict-hero-card overflow-hidden">
      <div className="grid gap-4 p-5 sm:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("home.verdict.eyebrow")}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-medium break-all sm:text-3xl">
              {maskedIp(ip, hidden)}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CountryFlag code={geo.country_code} />
              {[geo.city, geo.country].filter(Boolean).join(" · ")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {geo.isp}
            {dc?.asn ? ` · AS${dc.asn}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {result.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
              >
                {isMessageKey(chip) ? t(chip) : chip}
              </span>
            ))}
          </div>
        </div>
        <div className="relative flex flex-col items-center justify-center gap-1.5">
          {result.score !== null && (
            <>
              <div className="relative">
                <svg viewBox="0 0 120 120" className="size-28" role="img">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="9"
                    className="stroke-border"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray="326.7"
                    strokeDashoffset={326.7 * (1 - result.score / 100)}
                    transform="rotate(-90 60 60)"
                    style={{ stroke: scoreColor ?? "currentColor" }}
                  />
                  <text
                    x="60"
                    y="58"
                    textAnchor="middle"
                    className="fill-foreground font-mono text-[26px]"
                  >
                    {result.score}
                  </text>
                  <text
                    x="60"
                    y="78"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {t("home.verdict.compositeScore")}
                  </text>
                </svg>
                {stampable && (
                  <span className="verdict-stamp" aria-hidden="true">
                    {t("home.verdict.stampText")}
                  </span>
                )}
              </div>
            </>
          )}
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-base font-medium">
            {result.pending && (
              <Compass className="size-4 animate-spin" aria-hidden="true" />
            )}
            {stampable && (
              <BadgeCheck
                className="size-4 text-emerald-500"
                aria-hidden="true"
              />
            )}
            {isMessageKey(result.labelKey)
              ? t(result.labelKey)
              : result.labelKey}
          </p>
          {result.lineLabelKey && isMessageKey(result.lineLabelKey) && (
            <p className="text-xs text-muted-foreground">
              {t(result.lineLabelKey)}
            </p>
          )}
        </div>
      </div>
      {route && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {t("ip.route.title")}
            <span className="ml-2">{t("ip.route.toTargetNote")}</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {CARRIERS.map(({ key, label }) => {
              const carrier = route.carriers?.[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">
                    {t(label)}
                  </span>
                  {route.status === "pending" ? (
                    <span className="text-xs text-muted-foreground">
                      {t("ip.route.measuring")}
                    </span>
                  ) : carrier ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {lineLabel(carrier.code)}
                      <span
                        className={`inline-block size-2 rounded-full ${CONFIDENCE_DOT[carrier.confidence]}`}
                        aria-hidden="true"
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
