// Per-exit profile for split-routing users: every distinct egress IP the
// page observed gets its network, IP type, purity score and China route,
// next to the sites that left through it.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CountryFlag } from "@/components/country-flag";
import { SiteLogo } from "@/components/site-logo";
import { IpText, Pending } from "@/components/toolkit";
import { t, type MessageKey } from "@/i18n";
import { ipScoreColor } from "@/lib/ip-score";
import { ipTypeLabel, typeVotesText } from "@/lib/ip-type";
import { endpoint } from "@/lib/network";
import type { Geo } from "@/lib/types";
import { lookupIp } from "@/views/ip/api";
import { lineLabel, type CarrierKey } from "@/views/ip/route-grade-tiles";
import { useQuery } from "@tanstack/react-query";

interface ExitSite {
  name: string;
  icon: string;
  onSelect: () => void;
}

interface DatacenterInfo {
  known: boolean;
  brand?: string;
  asn?: number | null;
  holder?: string | null;
  cost_tier?: string | null;
}

interface RouteInfo {
  status: "finished" | "pending" | "degraded";
  domestic?: boolean;
  carriers?: Partial<Record<CarrierKey, { code: string; rank: number }>>;
}

const CARRIERS: [CarrierKey, MessageKey][] = [
  ["CT", "ip.route.carrierCT"],
  ["CU", "ip.route.carrierCU"],
  ["CM", "ip.route.carrierCM"],
];

function rankClass(rank: number) {
  if (rank >= 4) return "text-emerald-600 dark:text-emerald-400";
  if (rank >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-foreground";
}

function ExitProfile({
  geo,
  sites,
  direct,
}: {
  geo: Geo;
  sites: ExitSite[];
  direct: boolean;
}) {
  const ip = geo.ip;
  const quality = useQuery({
    queryKey: ["lookup-ip-coffee", ip],
    queryFn: ({ signal }) => lookupIp(ip, signal),
    enabled: !direct,
    staleTime: 3600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const dc = useQuery({
    queryKey: ["datacenter", ip],
    queryFn: ({ signal }) =>
      endpoint<DatacenterInfo>(`/datacenter/${encodeURIComponent(ip)}`, {
        signal,
      }),
    enabled: !direct,
    staleTime: 3600_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Route measurements share a small site-wide budget, so extra exits are
  // measured on request; the primary exit is measured by the hero card.
  const [measure, setMeasure] = useState(false);
  const route = useQuery({
    queryKey: ["china-route", ip],
    queryFn: ({ signal }) =>
      endpoint<RouteInfo>(`/route/${encodeURIComponent(ip)}`, { signal }),
    enabled: !direct && measure,
    refetchInterval: (state) =>
      state.state.data?.status === "pending" ? 3000 : false,
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const coffee = quality.data?.coffee;
  const typeLabel = ipTypeLabel(coffee?.ip_type);
  const votes = typeVotesText(coffee?.type_votes);
  const score =
    typeof coffee?.trust_score === "number" ? coffee.trust_score : null;
  const network =
    dc.data?.brand ??
    dc.data?.holder?.replace(/^[^ ]+ - /, "") ??
    geo.isp ??
    null;
  const asn = dc.data?.asn ?? geo.asn;
  const flags = [
    coffee?.is_proxy && "home.exit.flagProxy",
    coffee?.is_vpn && "home.exit.flagVpn",
    coffee?.is_abuser && "home.exit.flagAbuse",
    geo.warp && "home.exit.flagWarp",
  ].filter(Boolean) as MessageKey[];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <CountryFlag code={geo.country_code} />
        <span className="font-mono text-sm font-medium">
          <IpText ip={ip} />
        </span>
        {direct ? (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-400">
            {t("home.exit.direct")}
          </span>
        ) : (
          typeLabel && (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs"
              title={votes ?? undefined}
            >
              {typeLabel}
            </span>
          )
        )}
        {coffee?.sources_missing && (
          <span
            className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
            title={coffee.sources_missing.join(", ")}
          >
            {t("ipType.incomplete")}
          </span>
        )}
        {score !== null && (
          <span
            className="rounded-full px-2 py-0.5 font-mono text-xs font-medium text-white"
            style={{ background: ipScoreColor(score) }}
            title={t("home.exit.purity")}
          >
            {score}
          </span>
        )}
        {flags.map((flag) => (
          <span
            key={flag}
            className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-400"
          >
            {t(flag)}
          </span>
        ))}
        <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {sites.length} {t("home.sites")}
        </span>
      </div>
      {!direct && votes && (
        <p className="text-xs text-muted-foreground">
          {t("ipType.votes")} {votes}
        </p>
      )}
      <p className="min-w-0 truncate text-xs text-muted-foreground">
        {[
          network,
          asn ? `AS${asn}` : null,
          [geo.city, geo.country].filter(Boolean).join(", ") || null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {!direct && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">{t("home.exit.route")}</span>
          {!measure && !route.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setMeasure(true)}
            >
              {t("home.exit.measureRoute")}
            </button>
          ) : route.data?.domestic ? (
            <span>{t("home.exit.domesticEntry")}</span>
          ) : route.isPending || route.data?.status === "pending" ? (
            <Pending>{t("ip.route.measuringShort")}</Pending>
          ) : route.data?.status === "finished" && route.data.carriers ? (
            CARRIERS.map(([key, label]) => {
              const verdict = route.data?.carriers?.[key];
              return (
                <span key={key}>
                  <span className="text-muted-foreground">{t(label)} </span>
                  <span
                    className={`font-medium ${verdict ? rankClass(verdict.rank) : ""}`}
                  >
                    {verdict ? lineLabel(verdict.code) : "—"}
                  </span>
                </span>
              );
            })
          ) : (
            <span className="text-muted-foreground">
              {t("ip.route.queued")}
            </span>
          )}
          <Link
            to={`/network/ip/${encodeURIComponent(ip)}`}
            className="ml-auto text-primary underline-offset-2 hover:underline"
          >
            {t("home.exit.details")}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {sites.map((site) => (
          <button
            key={site.name}
            type="button"
            onClick={site.onSelect}
            className="flex max-w-full items-center gap-1.5 rounded-md bg-background px-2 py-1 text-xs ring-1 ring-border hover:text-primary [&_.site-icon]:size-3.5"
          >
            <SiteLogo src={site.icon} />
            <span className="min-w-0 truncate">{site.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExitProfiles({
  exits,
  domesticIp,
}: {
  exits: { geo: Geo; sites: ExitSite[] }[];
  /** The visitor's own China-side IP; exits equal to it went DIRECT. */
  domesticIp?: string;
}) {
  // Mainland exits are the visitor's own line (DIRECT rules): proxy exits
  // never land inside China. Domestic CDNs report different edge-facing
  // addresses, so they collapse into one card.
  const isDirect = (geo: Geo) =>
    geo.ip === domesticIp || geo.country_code?.toUpperCase() === "CN";
  const proxied = exits.filter(({ geo }) => !isDirect(geo));
  const direct = exits.filter(({ geo }) => isDirect(geo));
  return (
    <div className="flex flex-col gap-2">
      {proxied.map(({ geo, sites }) => (
        <ExitProfile key={geo.ip} geo={geo} sites={sites} direct={false} />
      ))}
      {direct.length > 0 && (
        <ExitProfile
          geo={
            direct.find(({ geo }) => geo.ip === domesticIp)?.geo ??
            direct[0].geo
          }
          sites={direct.flatMap(({ sites }) => sites)}
          direct
        />
      )}
    </div>
  );
}
