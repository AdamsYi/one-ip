import { CountryFlag } from "@/components/country-flag";
import {
  PrivacyToggle,
  PageHeading,
  ToolCard,
  IpText,
  Pending,
} from "@/components/toolkit";
import { t } from "@/i18n";
import { trace } from "@/lib/network";
import { getGeo, getDomesticIp } from "@/views/home/api";
import { useQuery } from "@tanstack/react-query";
import { AiNetworkCheck } from "./network-check";
import { AiPlatformLinks } from "./platform-links";
import type { AiPlatform } from "./platforms";

export default function PlatformDiagnostics({
  platform,
}: {
  platform: AiPlatform;
}) {
  const exit = useQuery({
    queryKey: [platform.id, "exit"],
    enabled: Boolean(platform.traceDomain),
    queryFn: ({ signal }) => trace(platform.traceDomain!, signal),
    staleTime: 60_000,
    retry: false,
  });
  const geo = useQuery({
    queryKey: ["geoip", exit.data?.ip],
    enabled: Boolean(exit.data?.ip),
    queryFn: ({ signal }) => getGeo(exit.data!.ip, signal),
    staleTime: 60_000,
    retry: false,
  });
  const domestic = useQuery({
    queryKey: ["domestic-ip"],
    queryFn: ({ signal }) => getDomesticIp(signal),
    retry: false,
  });
  const cf = useQuery({
    queryKey: ["cf-exit"],
    queryFn: ({ signal }) => trace("1.1.1.1", signal),
    retry: false,
  });
  return (
    <div className="ai-diagnostics">
      <PageHeading
        title={t("ai.networkCheck", [platform.name])}
        description=""
      />
      <div className="ai-overview">
        <ToolCard
          title={
            <div className="flex items-center justify-between gap-3">
              <span>
                {platform.name}
                {t("ai.egress")}
              </span>
              <PrivacyToggle />
            </div>
          }
        >
          {platform.traceDomain ? (
            <>
              <div className="ip-value text-primary">
                {exit.isPending ? (
                  <Pending>{t("ai.checkingEgress")}</Pending>
                ) : (
                  <IpText ip={exit.data?.ip} />
                )}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {exit.isError ? (
                  t("ai.egressLookupFailedPossiblyDueNetworkCrossOrigin")
                ) : geo.isFetching ? (
                  <Pending>{t("ai.lookingUpLocation")}</Pending>
                ) : (
                  <>
                    <CountryFlag
                      code={geo.data?.country_code ?? exit.data?.country_code}
                    />{" "}
                    {[
                      geo.data?.country ?? exit.data?.country_code,
                      geo.data?.city,
                      geo.data?.isp,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("common.locationDetailsAreUnavailable")}
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("ai.publicEndpointCurrentlyAvailableReadPlatformSEgress")}
            </p>
          )}
          <div className="ai-exit-comparison">
            <span className="small muted">{t("ai.otherEgressAddresses")}</span>
            {[
              { query: domestic, title: t("ai.chinaIpv4") },
              { query: cf, title: "Cloudflare" },
            ].map(({ query, title }) => (
              <div className="ai-exit-row" key={title}>
                <span className="muted">{title}</span>
                <span>
                  {query.isPending ? (
                    <Pending>{t("common.checking")}</Pending>
                  ) : query.isError ? (
                    <span className="muted">{t("common.unavailable")}</span>
                  ) : (
                    <IpText ip={query.data?.ip} />
                  )}
                </span>
              </div>
            ))}
            {(domestic.isError || cf.isError) && (
              <p className="small muted">
                {t(
                  "ai.referenceEgressMayLimitedConnectivityCrossOriginRestrictions",
                )}
              </p>
            )}
          </div>
        </ToolCard>
        <AiNetworkCheck domains={[platform.domain]}>
          <p className="small muted mt-3">
            {t("ai.browserHttpProbesDoIndicateAccountAccessModel")}
          </p>
          <AiPlatformLinks platform={platform} />
        </AiNetworkCheck>
      </div>
    </div>
  );
}
