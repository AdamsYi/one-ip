import { t, type MessageKey } from "@/i18n";

const TYPE_LABEL: Record<string, MessageKey> = {
  residential: "ipType.residential",
  isp_hosted: "ipType.ispHosted",
  datacenter: "ipType.datacenter",
  mobile: "ipType.mobile",
  business: "ipType.business",
  mixed: "ipType.mixed",
};

const SOURCE_LABEL: Record<string, string> = {
  ipapi_is: "ipapi.is",
  asn: "ASN",
  proxycheck: "proxycheck",
  abuseipdb: "AbuseIPDB",
  ip_api: "ip-api",
};

export function ipTypeLabel(type: string | undefined | null) {
  return type && TYPE_LABEL[type] ? t(TYPE_LABEL[type]) : null;
}

/** "ipapi.is: hosting · proxycheck: Residential · …" */
export function typeVotesText(
  votes: { source: string; raw: string }[] | undefined,
) {
  if (!votes?.length) return null;
  return votes
    .map((vote) => `${SOURCE_LABEL[vote.source] ?? vote.source}: ${vote.raw}`)
    .join(" · ");
}
