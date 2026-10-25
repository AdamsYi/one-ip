import type { ReactNode } from "react";
import { Pending, ToolCard } from "@/components/toolkit";
import { isMessageKey, t } from "@/i18n";
import { endpoint } from "@/lib/network";
import { useQuery } from "@tanstack/react-query";
import { IpFacts } from "./field-help";

interface DatacenterEntry {
  ip: string;
  known: boolean;
  method?: string;
  asn: number | null;
  prefix?: string | null;
  rdns?: string | null;
  brand?: string;
  aliases?: string[];
  country?: string;
  cities?: string[];
  cost_tier?: "budget" | "mid" | "high" | "premium" | null;
  price_hint?: string;
  roles?: string[];
  verified?: boolean;
}

const TIER_KEYS = {
  budget: "ip.datacenter.tierBudget",
  mid: "ip.datacenter.tierMid",
  high: "ip.datacenter.tierHigh",
  premium: "ip.datacenter.tierPremium",
} as const;

const TIER_CLASS: Record<string, string> = {
  budget: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  mid: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  premium: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function DatacenterCard({ ip }: { ip: string }) {
  const query = useQuery({
    queryKey: ["datacenter", ip],
    queryFn: ({ signal }) =>
      endpoint<DatacenterEntry>(`/datacenter/${encodeURIComponent(ip)}`, {
        signal,
      }),
    staleTime: 3600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const render = (data: DatacenterEntry) => {
    if (!data.known)
      return (
        <p className="text-sm text-muted-foreground">
          {t("ip.datacenter.notListed", [
            data.asn ? `AS${data.asn}` : t("ip.datacenter.noAsn"),
          ])}
        </p>
      );
    const tierKey = data.cost_tier ? TIER_KEYS[data.cost_tier] : null;
    const tierLabel = tierKey && isMessageKey(tierKey) ? t(tierKey) : null;
    const rows: [string, ReactNode][] = [
      [
        t("ip.datacenter.provider"),
        <span key="brand" className="flex flex-wrap items-center gap-2">
          <span>{data.brand}</span>
          {tierLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${data.cost_tier ? TIER_CLASS[data.cost_tier] : ""}`}
            >
              {tierLabel}
            </span>
          )}
        </span>,
      ],
      [
        t("ip.datacenter.aliases"),
        data.aliases?.length ? data.aliases.join(" / ") : "—",
      ],
      [
        t("ip.datacenter.locations"),
        data.cities?.length ? data.cities.join("、") : (data.country ?? "—"),
      ],
      [
        t("ip.datacenter.roles"),
        data.roles?.length ? data.roles.join(" / ") : "—",
      ],
      [t("ip.datacenter.priceHint"), data.price_hint || "—"],
    ];
    return (
      <>
        <IpFacts rows={rows} />
        {!data.verified && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("ip.datacenter.unverifiedNote")}
          </p>
        )}
      </>
    );
  };
  return (
    <ToolCard title={t("ip.datacenter.title")}>
      {query.isPending ? (
        <Pending>{t("common.checking")}</Pending>
      ) : query.isError || !query.data ? (
        <p className="text-sm text-muted-foreground">
          {t("ip.datacenter.unavailable")}
        </p>
      ) : (
        render(query.data)
      )}
    </ToolCard>
  );
}
