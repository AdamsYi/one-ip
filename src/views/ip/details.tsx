import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CopyButton } from "@/components/copy-button";
import { CountryFlag } from "@/components/country-flag";
import { DataTable } from "@/components/data-table";
import { NumberTicker } from "@/components/number-ticker";
import { IpText, ToolCard, Pending } from "@/components/toolkit";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { t } from "@/i18n";
import { ipScoreColor } from "@/lib/ip-score";
import type { Geo } from "@/lib/types";
import { hideIpAtom } from "@/store/privacy";
import { useAtom } from "jotai";
import { Crown, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { coffeeThreatLabels, type CoffeeLookup } from "./coffee";
import { IpFacts } from "./field-help";
import { IpLatency } from "./latency";
import { LocationMap } from "./location-map";
import { PerfectScoreEffects } from "./perfect-score-effects";
import { ipProfile } from "./profile";
import { useIpLatency } from "./use-ip-latency";

const IpProfileGraph = lazy(() => import("./profile-graph"));
const IpRouteGraph = lazy(() => import("./route-graph"));
const IpReputationScale = lazy(() =>
  import("./profile-graph").then((module) => ({
    default: module.IpReputationScale,
  })),
);

export function IpDetails({
  data,
  search,
  recent,
}: {
  data: CoffeeLookup;
  search?: ReactNode;
  recent?: ReactNode;
}) {
  const mobile = useIsMobile();
  const [hidden, setHidden] = useAtom(hideIpAtom);
  const d = data.coffee;
  const threats = coffeeThreatLabels(d, true);
  const profile = useMemo(() => ipProfile(d), [d]);
  const inbound = useIpLatency(d.ip);
  const chip = (label: string, tone = "neutral", title?: string) => (
    <span className={`ip-chip ip-chip-${tone}`} title={title}>
      {label}
    </span>
  );
  const yesNo = (value?: boolean) =>
    chip(
      typeof value !== "boolean"
        ? t("common.unknown")
        : value
          ? t("common.yes")
          : t("common.no"),
    );
  const riskFlag = (value?: boolean) =>
    typeof value !== "boolean"
      ? chip(t("common.unknown"))
      : value
        ? chip(t("common.detected"), "bad")
        : chip(t("common.notDetected"), "good");
  const number = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? (
      <NumberTicker
        value={value}
        formatValue={(v) => Math.round(v).toLocaleString()}
      />
    ) : (
      "—"
    );
  const seen = (value?: number) =>
    value ? new Date(value * 1000).toLocaleDateString() : "—";
  const score =
    typeof d.trust_score === "number" &&
    Number.isFinite(d.trust_score) &&
    d.trust_score >= 0 &&
    d.trust_score <= 100
      ? d.trust_score
      : null;
  const rpki: Record<string, string> = {
    valid: t("ip.valid"),
    invalid: t("ip.invalid"),
    notfound: t("ip.noRoaPublished"),
    unknown: t("common.unknown"),
  };
  return (
    <div className="ip-dossier">
      <div
        className={`ip-dossier-top${score === 100 ? " ip-dossier-perfect" : ""}`}
      >
        {score === 100 && <PerfectScoreEffects />}
        <div className="ip-dossier-head">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-all text-xl font-semibold">
                <IpText ip={d.ip} link={false} />
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    hidden
                      ? t("common.showIpAddresses")
                      : t("common.hideIpAddresses")
                  }
                  title={
                    hidden
                      ? t("common.showIpAddresses")
                      : t("common.hideIpAddresses")
                  }
                  aria-pressed={hidden}
                  onClick={() => setHidden((value) => !value)}
                >
                  {hidden ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
                <CopyButton value={d.ip} />
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <CountryFlag code={data.geo.country_code} />
              <span>
                {[d.country, d.region, d.city, d.isp]
                  .filter(Boolean)
                  .filter((v, i, all) => all.indexOf(v) === i)
                  .join(" · ")}
              </span>
            </div>
          </div>
          <div
            className={`ip-reputation-badge${score === 100 ? " ip-reputation-perfect" : ""}`}
            style={{ color: ipScoreColor(score) }}
          >
            <span className={score === 100 ? "ip-perfect-label" : undefined}>
              {score === 100 && <Crown size={13} aria-hidden="true" />}
              {score === 100
                ? t("common.perfectReputation")
                : t("common.ipReputation")}
            </span>
            <strong>
              {score == null ? "—" : <NumberTicker value={score} />}
            </strong>
          </div>
        </div>
        <Suspense fallback={<div className="ip-reputation-scale" />}>
          <IpReputationScale profile={profile} />
        </Suspense>
        {search}
        {recent}
      </div>
      {profile.risk && (
        <div
          className="ip-risk-notice"
          data-severity={profile.risk.severity}
          role="alert"
        >
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <strong>{profile.risk.title}</strong>
            {!!profile.risk.flags.length && (
              <ul>
                {profile.risk.flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            )}
            <p>{profile.risk.description}</p>
          </div>
        </div>
      )}
      <Suspense
        fallback={
          <ToolCard title={t("common.ipProfile")}>
            <div className="ip-profile-loading">
              <Pending>{t("ip.loadingProfileMap")}</Pending>
            </div>
          </ToolCard>
        }
      >
        <IpProfileGraph
          key={d.ip}
          data={d}
          profile={profile}
          inbound={inbound}
        />
      </Suspense>
      <div className="ip-dossier-grid">
        <ToolCard title={t("ip.networkAttributes")}>
          <IpFacts
            rows={[
              [t("ip.registeredCountry"), d.registered_country],
              [t("common.datacenter"), yesNo(d.is_datacenter)],
              [t("common.mobileNetwork"), yesNo(d.is_mobile)],
              [t("ip.company"), d.company_name],
              [t("ip.datacenterName"), d.datacenter_name || "—"],
            ]}
          />
        </ToolCard>
        <ToolCard title={t("ip.asnIsp")}>
          <IpFacts
            rows={[
              ["ASN", d.asn ? `AS${d.asn}` : undefined],
              [t("ip.isp"), d.isp],
              [t("ip.asnName"), d.asname],
              [t("ip.asnOrganization"), d.asOrganization],

              ["CIDR", d.cidr],
              [t("ip.asnSelfReportedType"), d.asn_kind],
              [t("ip.asnIpv4Addresses"), number(d.asn_ipv4_count)],
              [t("ip.asnRegistered"), d.asn_allocated],
            ]}
          />
        </ToolCard>
        <ToolCard title={t("ip.technicalDetails")}>
          <IpFacts
            rows={[
              [t("ip.addressType"), d.ip.includes(":") ? "IPv6" : "IPv4"],
              [
                t("ip.ipRange"),
                d.range?.first && d.range?.last
                  ? `${d.range.first} – ${d.range.last}`
                  : undefined,
              ],
              [t("ip.addressCount"), number(d.range?.count)],
              [t("ip.estimatedBandwidth"), d.asn_tbps],
              ["Bogon", riskFlag(d.is_bogon)],
              [t("ip.redditRestriction"), riskFlag(d.reddit_blocked)],
              ["PTR", d.rdns || "—"],
              [
                "RPKI",
                d.rpki_status
                  ? (rpki[d.rpki_status.toLowerCase()] ?? d.rpki_status)
                  : t("common.unknown"),
              ],
            ]}
          />
        </ToolCard>
        <ToolCard title={t("ip.riskSignals")}>
          <IpFacts
            rows={[
              ["VPN", riskFlag(d.is_vpn)],
              [t("common.proxy"), riskFlag(d.is_proxy)],
              ["Tor", riskFlag(d.is_tor)],
              [t("common.crawlerFlag"), riskFlag(d.is_crawler)],
              [t("common.abuseFlag"), riskFlag(d.is_abuser)],
              [
                t("ip.abuseScore"),
                d.intelligence?.abuser_score_raw ?? d.abuser_score,
              ],
            ]}
          />
        </ToolCard>
      </div>
      <ToolCard title={t("ip.ipIntelligenceThreatIndicators")}>
        <IpFacts
          rows={[
            [
              t("ip.threatFlags"),
              Array.isArray(d.intelligence?.threats)
                ? threats.length
                  ? chip(threats.join(" · "), "bad")
                  : chip(t("ip.noApparentThreats"), "good")
                : chip(t("common.unknown")),
            ],
            [t("ip.abuseLevel"), d.intelligence?.abuser_level],
            [
              t("ip.httpHoneypotBlacklist"),
              d.intelligence?.rep_threat == null
                ? chip(t("common.unknown"))
                : JSON.stringify(d.intelligence.rep_threat),
            ],
            [
              t("ip.vpnDetails"),
              d.vpn_trace == null
                ? "—"
                : typeof d.vpn_trace === "string"
                  ? d.vpn_trace
                  : JSON.stringify(d.vpn_trace),
            ],
            [t("ip.accessAssessment"), d.ai_verdict?.label],
            [
              t("ip.assessmentConfidence"),
              d.ai_verdict?.confidence == null ? (
                "—"
              ) : (
                <span key="confidence">{number(d.ai_verdict.confidence)}%</span>
              ),
            ],
            [t("ip.assessmentReasoning"), d.ai_verdict?.reasoning],
          ]}
        />
      </ToolCard>
      <ToolCard title={t("ip.locationSourceComparison")}>
        {mobile ? (
          data.sources.length ? (
            <ul className="ip-geo-mobile">
              {data.sources.map((source, index) => (
                <li key={`${source.source}-${index}`}>
                  <span className="ip-geo-source">{source.source}</span>
                  <div className="ip-geo-place">
                    <CountryFlag code={source.country_code} />
                    <span>
                      {[source.country, source.region, source.city]
                        .filter(Boolean)
                        .filter((value, i, all) => all.indexOf(value) === i)
                        .join(" · ") || t("common.unknown")}
                    </span>
                  </div>
                  {source.latitude != null && source.longitude != null && (
                    <p>
                      {t("ip.latitude")} {source.latitude} ·{" "}
                      {t("ip.longitudeLabel")} {source.longitude}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("ip.noLocationDataObtained")}
            </p>
          )
        ) : (
          <DataTable<Geo>
            className="ip-geo-table"
            columns={[
              { accessorKey: "source", header: t("common.dataSource") },
              { accessorKey: "country", header: t("common.countryRegion") },
              { accessorKey: "region", header: t("ip.region") },
              {
                accessorKey: "city",
                header: t("ip.city"),
                cell: ({ row }) => (
                  <span className="ip-geo-city" title={row.original.city}>
                    {row.original.city ?? "—"}
                  </span>
                ),
              },
              { accessorKey: "latitude", header: t("ip.latitude") },
              { accessorKey: "longitude", header: t("ip.longitudeLabel") },
            ]}
            data={data.sources}
            empty={t("ip.noLocationDataObtained")}
          />
        )}
      </ToolCard>
      <IpLatency measurement={inbound} />
      <LocationMap
        geo={
          data.sources.find(
            (source) =>
              source.latitude != null &&
              source.longitude != null &&
              source.latitude === data.geo.latitude &&
              source.longitude === data.geo.longitude,
          ) ?? data.geo
        }
      />
      {!!d.related_domains?.length && (
        <ToolCard title={t("ip.relatedDomains")}>
          <IpFacts
            rows={d.related_domains.map((item) => [item.domain, item.via])}
          />
        </ToolCard>
      )}
      <div className="ip-dossier-grid">
        {!!d.location_history?.length && (
          <ToolCard title={t("ip.locationHistory")}>
            <IpFacts
              rows={d.location_history.map((row) => [
                seen(row.seen_at),
                [row.country, row.region, row.city].filter(Boolean).join(" · "),
              ])}
            />
          </ToolCard>
        )}
        {!!d.asn_history?.length && (
          <ToolCard title={t("ip.asnHistory")}>
            <IpFacts
              rows={d.asn_history.map((row) => [
                seen(row.seen_at),
                `AS${row.asn ?? "—"} · ${row.asn_org ?? "—"}`,
              ])}
            />
          </ToolCard>
        )}
        {!!d.company_history?.length && (
          <ToolCard title={t("ip.companyHistory")}>
            <IpFacts
              rows={d.company_history.map((row) => [
                seen(row.seen_at),
                [row.company_name, row.company_type]
                  .filter(Boolean)
                  .join(" · "),
              ])}
            />
          </ToolCard>
        )}
      </div>
      {!!d.dc_neighbors?.length && (
        <ToolCard title={t("ip.relatedNetworkAddresses")}>
          {mobile ? (
            <ul className="divide-y divide-border/60">
              {d.dc_neighbors.map((row, index) => (
                <li
                  key={`${row.ip}-${index}`}
                  className="min-w-0 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 text-sm font-semibold">
                      <IpText ip={row.ip} />
                    </span>
                    <time
                      className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                      aria-label={t("ip.recorded")}
                    >
                      {seen(row.seen_at)}
                    </time>
                  </div>
                  {row.city && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.city}
                    </p>
                  )}
                  {row.company && (
                    <p className="mt-1 break-words text-xs leading-relaxed">
                      {row.company}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <DataTable
              columns={[
                {
                  accessorKey: "ip",
                  header: "IP",
                  cell: ({ row }) => <IpText ip={row.original.ip} />,
                },
                { accessorKey: "city", header: t("ip.city") },
                { accessorKey: "company", header: t("ip.company") },
                {
                  accessorKey: "seen_at",
                  header: t("ip.recorded"),
                  cell: ({ row }) => seen(row.original.seen_at),
                },
              ]}
              data={d.dc_neighbors}
            />
          )}
        </ToolCard>
      )}
      <Suspense
        fallback={
          <ToolCard title={t("ip.bgpRouteTopology")}>
            <div className="ip-route-graph-state">
              <Pending>{t("ip.readingRoutingData")}</Pending>
            </div>
          </ToolCard>
        }
      >
        <IpRouteGraph
          ip={d.ip}
          currentAsn={d.asn}
          currentAsnName={d.asOrganization ?? d.asname}
        />
      </Suspense>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/network/ping/?host=${encodeURIComponent(d.ip)}`}>
            {t("common.globalLatencyTest")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
