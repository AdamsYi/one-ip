import { Link } from "react-router-dom";
import { ConnectivityTile, homeTargets } from "@/components/connectivity";
import { PageHeading, ToolCard } from "@/components/toolkit";
import { Card, CardContent } from "@/components/ui/card";
import { useAvailableTools } from "@/hooks/use-available-tools";
import { t } from "@/i18n";
import { toolGroups } from "@/layout/routes";
import { AiNetworkCheck } from "@/views/ai/network-check";
import { aiPlatforms } from "@/views/ai/platforms";
import { BrowserSummary } from "@/views/browser/summary";
import { ArrowUpRight } from "lucide-react";

const descriptions: Record<string, string> = {
  "/network/speedtest": t("speedtest.description"),
  "/network/ip": t("overview.tsx.lookUpLocationIspAsnAndMapPosition"),
  "/network/subdomains": t("subdomains.description"),
  "/network/whois": t("overview.tsx.viewDomainIpAndAsRegistrationData"),
  "/network/connectivity": t(
    "overview.tsx.viewTheMapWebsiteEgressConnectivityAndLatency",
  ),
  "/network/ping": t(
    "overview.tsx.measureLatencyAndPacketLossFromGlobalProbes",
  ),
  "/network/dns": t(
    "overview.tsx.inspectTheEgressNetworksUsedForDnsResolution",
  ),
  "/network/cdn": t("overview.tsx.viewContentDeliveryNetworkServingNodes"),
  "/browser/environment": t(
    "overview.tsx.browserOsLanguageScreenAndHardwareInformation",
  ),
  "/browser/fingerprint": t(
    "overview.tsx.inspectFingerprintComponentsAndCompareRepeatedChecks",
  ),
  "/browser/consistency": t(
    "overview.tsx.compareEnvironmentDifferencesAndRunDeepBrowserDiagnostics",
  ),
  "/browser/automation": t("overview.tsx.viewObservableAutomationSignals"),
  "/browser/privacy": t("overview.tsx.checkWebrtcEgressAndWebsitePermissions"),
  "/browser/challenges": t(
    "overview.tsx.tryThirdPartyVerificationViewAttemptSResult",
  ),
};
const titles = {
  network: t("overview.tsx.networkChecksOverview"),
  browser: t("overview.tsx.browserChecksOverview"),
  ai: t("overview.tsx.aiChecksOverview"),
};
export default function ModuleOverview({
  group,
}: {
  group: keyof typeof toolGroups;
}) {
  const tools = useAvailableTools(group);
  return (
    <div className="space-y-3">
      <PageHeading title={titles[group]} description="" />
      {group === "network" && (
        <ToolCard title={t("overview.tsx.currentNetworkResponse")}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {homeTargets.map((target) => (
              <ConnectivityTile key={target.name} target={target} />
            ))}
          </div>
        </ToolCard>
      )}
      {group === "browser" && <BrowserSummary />}
      {group === "ai" && (
        <AiNetworkCheck
          domains={aiPlatforms.map((platform) => platform.domain)}
        />
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.path}>
            <CardContent>
              <Link to={tool.path} className="group block">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>{tool.label}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </span>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {descriptions[tool.path] ??
                    t(
                      "overview.tsx.viewNetworkResponsesEgressComparisonsAndRelatedLinks",
                      [tool.label],
                    )}
                </p>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
