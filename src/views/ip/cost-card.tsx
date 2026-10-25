import type { ReactNode } from "react";
import { Pending, ToolCard } from "@/components/toolkit";
import { t } from "@/i18n";
import { endpoint } from "@/lib/network";
import { costProfile } from "@/lib/verdict";
import { useQuery } from "@tanstack/react-query";
import { IpFacts } from "./field-help";

interface DatacenterEntry {
  known: boolean;
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

function Stars({ count }: { count: number }) {
  return (
    <span className="tracking-widest text-amber-500" aria-label={String(count)}>
      {"★".repeat(count)}
      <span className="text-muted-foreground/40">
        {"★".repeat(Math.max(0, 5 - count))}
      </span>
    </span>
  );
}

export function CostCard({
  trustScore,
  ip,
}: {
  trustScore?: number | null;
  ip: string;
}) {
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
  if (datacenterQuery.isPending || routeQuery.isPending)
    return (
      <ToolCard title={t("ip.cost.title")}>
        <Pending>{t("common.checking")}</Pending>
      </ToolCard>
    );
  const datacenter = datacenterQuery.data;
  const route = routeQuery.data;
  if (!datacenter?.known)
    return (
      <ToolCard title={t("ip.cost.title")}>
        <p className="text-sm text-muted-foreground">{t("ip.cost.unknown")}</p>
      </ToolCard>
    );
  const profile = costProfile(
    { trust_score: trustScore ?? null },
    datacenter,
    route,
  );
  const rows: [string, ReactNode][] = [
    [
      t("ip.cost.landing"),
      <Stars key="landing" count={profile.landingStars} />,
    ],
    [t("ip.cost.route"), <Stars key="route" count={profile.routeStars} />],
    [t("ip.cost.ip"), <Stars key="ip" count={profile.ipStars} />],
  ];
  return (
    <ToolCard title={t("ip.cost.title")}>
      <IpFacts rows={rows} />
      {profile.monthlyLowUsd !== null && profile.monthlyHighUsd !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("ip.cost.summary", [
            String(profile.monthlyLowUsd),
            String(profile.monthlyHighUsd),
          ])}
        </p>
      )}
    </ToolCard>
  );
}
