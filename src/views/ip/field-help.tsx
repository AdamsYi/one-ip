import { useState, type ReactNode } from "react";
import { Facts } from "@/components/toolkit";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { t } from "@/i18n";
import { Info } from "lucide-react";

const definitions = new Map([
  ["ASN", t("ip.asnIdentifiesNetworkAnnouncingIpRoutesEndUsers")],
  ["CIDR", t("ip.cidrDescribesAddressBlockSmallerPrefixLengthMeans")],
  ["PTR", t("ip.reverseDnsMapsIpHostnameOperatorsConfigureThese")],
  ["RPKI", t("ip.rpkiValidatesPrefixAnnouncingAsnAgainstRouteAuthorizations")],
  [
    "Bogon",
    t("ip.privateReservedUnallocatedAddressesShouldAppearPublicRouting"),
  ],
  ["VPN", t("ip.whetherIpIdentifiedVpnExitVpnFlagDoes")],
  ["Tor", t("ip.whetherIpIdentifiedTorExitDescribesExitNetwork")],
  [
    t("ip.ipOrigin"),
    t("ip.comparesRegisteredGeolocatedCountriesMatchingCountriesLabeledNative"),
  ],
  [
    t("ip.asnSelfReportedType"),
    t("ip.networkOrganizationSReportedBusinessTypeSuchMixed"),
  ],
  [
    t("ip.asnIpv4Addresses"),
    t("ip.ipv4AddressCountAssociatedAsnSizeBlockNumber"),
  ],
  [
    t("ip.estimatedBandwidth"),
    t("ip.organizationLevelBandwidthEstimateReportedRangeMeasuredDownload"),
  ],
  [
    t("ip.asnRegistered"),
    t("ip.asnRegistrationAllocationDateActivationDateIpBlock"),
  ],
  [
    t("common.proxy"),
    t("ip.whetherAddressIdentifiedProxyExitDatabaseCoverageUpdate"),
  ],
  [
    t("ip.httpHoneypotBlacklist"),
    t("ip.threatSignalsHoneypotsObservingScansAttacksAutomatedTraffic"),
  ],
  [t("ip.abuseScore"), t("ip.strengthReportedAbuseSignalsFieldUsesOwnScale")],
  [
    t("ip.assessmentConfidence"),
    t("ip.providerSConfidenceAssessmentServiceUptimeProbabilityAccessing"),
  ],
  [
    t("ip.relatedNetworkAddresses"),
    t("ip.otherAssociatedNetworkAddressesNecessarilySameServerUsed"),
  ],
  [
    t("common.ipReputation"),
    t("ip.composite0100ReputationIndicatorHigherMeansLower"),
  ],
]);

export function FieldHelp({ label }: { label: string }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const description = definitions.get(label);
  if (!description) return <>{label}</>;
  const trigger = (
    <button
      type="button"
      className="ip-help-trigger"
      aria-label={t("common.explain", [label])}
      onClick={mobile ? () => setOpen(true) : undefined}
    >
      <Info aria-hidden="true" size={14} />
    </button>
  );
  return (
    <span className="ip-field-label">
      {label}
      {mobile ? (
        <>
          {trigger}
          <ResponsiveDialog
            open={open}
            onOpenChange={setOpen}
            title={label}
            description=""
          >
            <p className="text-sm leading-relaxed">{description}</p>
          </ResponsiveDialog>
        </>
      ) : (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent
              sideOffset={6}
              className="max-w-72 text-xs leading-relaxed"
            >
              {description}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}
export function IpFacts({ rows }: { rows: [string, ReactNode][] }) {
  const compactLabels = new Set([
    "ASN",
    "VPN",
    "Tor",
    "Bogon",
    "RPKI",
    t("ip.ipOrigin"),
    t("ip.classification"),
    t("ip.registeredCountry"),
    t("common.datacenter"),
    t("common.mobileNetwork"),
    t("ip.companyType"),
    t("ip.addressType"),
    t("ip.addressCount"),
    t("common.proxy"),
    t("common.crawlerFlag"),
    t("common.abuseFlag"),
    t("ip.redditRestriction"),
    t("ip.abuseLevel"),
    t("ip.assessmentConfidence"),
  ]);
  const compact = new Set<string>();
  const fits = ([label, value]: [string, ReactNode]) =>
    compactLabels.has(label) &&
    (typeof value !== "string" || value.length <= 12);
  for (let i = 0; i < rows.length - 1; i++) {
    if (fits(rows[i]) && fits(rows[i + 1])) {
      compact.add(rows[i][0]);
      compact.add(rows[i + 1][0]);
      i++;
    }
  }
  const important = new Set([
    "ASN",
    "CIDR",
    t("ip.isp"),
    t("ip.classification"),
    t("ip.ipOrigin"),
    t("ip.threatFlags"),
  ]);
  return (
    <Facts
      rows={rows.map(([label, value]) => [
        label,
        important.has(label) ? (
          <span key={label} className="ip-key-value">
            {value}
          </span>
        ) : (
          value
        ),
      ])}
      renderLabel={(label) => (
        <span className={compact.has(label) ? "ip-compact-field" : undefined}>
          <FieldHelp label={label} />
        </span>
      )}
    />
  );
}
