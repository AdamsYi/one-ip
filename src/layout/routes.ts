import { t } from "@/i18n";
import { aiPlatforms } from "@/views/ai/platforms";

export const navigationRoutes = [
  {
    value: "/",
    label: t("navigation.overview"),
    short: t("navigation.overview"),
  },
  { value: "/ai/", label: t("navigation.aiChecks"), short: "AI" },
  {
    value: "/status/",
    label: t("navigation.serviceStatus"),
    short: t("common.status"),
  },
  {
    value: "/network/",
    label: t("navigation.networkChecks"),
    short: t("navigation.network"),
  },
  {
    value: "/browser/",
    label: t("navigation.browserChecks"),
    short: t("navigation.browser"),
  },
] as const;
export const toolGroups = {
  network: [
    { path: "/network/connectivity", label: t("common.connectivityEgress") },
    { path: "/network/speedtest", label: t("speedtest.title") },
    { path: "/network/dns", label: t("common.dnsEgress") },
    { path: "/network/cdn", label: t("navigation.cdnNodes") },
    { path: "/network/ip", label: t("navigation.ipCheck") },
    { path: "/network/subdomains", label: t("common.subdomainLookup") },
    { path: "/network/whois", label: "WHOIS" },
    { path: "/network/ping", label: t("common.globalPing") },
  ],
  browser: [
    { path: "/browser/environment", label: t("common.environment") },
    { path: "/browser/fingerprint", label: t("common.fingerprint") },
    { path: "/browser/consistency", label: t("common.consistency") },
    { path: "/browser/automation", label: t("common.automation") },
    { path: "/browser/privacy", label: t("common.permissionsPrivacy") },
    { path: "/browser/challenges", label: t("common.humanVerification") },
  ],
  ai: aiPlatforms.map((platform) => ({
    path: `/ai/${platform.id}`,
    label: platform.name,
  })),
} as const;
export const legacyRoutes: Record<string, string> = {
  "/query": "/network/ip",
  "/query/ip": "/network/ip",
  "/query/ip/:ip": "/network/ip",
  "/query/whois": "/network/whois",
  "/ip": "/network/ip",
  "/ip/:ip": "/network/ip",
  "/whois": "/network/whois",
  "/link": "/network/connectivity",
  "/network/link": "/network/connectivity",
  "/network/exits": "/network/connectivity",
  "/ping": "/network/ping",
  "/cdn": "/network/cdn",
  "/dns-exit": "/network/dns",
  "/network/dns-exit": "/network/dns",
  "/webrtc": "/browser/privacy",
  "/network/webrtc": "/browser/privacy",
  "/browser/webrtc": "/browser/privacy",
  "/gpt": "/ai/gpt",
  "/claude": "/ai/claude",
  "/gpt/status.html": "/status/openai",
  "/claude/status.html": "/status/claude",
  "/ai/gpt/status": "/status/openai",
  "/ai/claude/status": "/status/claude",
};
export function activeNavigationRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/";
  for (const [group, routes] of Object.entries(toolGroups)) {
    if (path === `/${group}` || routes.some((route) => route.path === path))
      return `/${group}/`;
  }
  if (/^\/network\/ip\/[^/]+$/.test(path)) return "/network/";
  return /^\/status(?:\/(?:openai|claude))?$/.test(path)
    ? "/status/"
    : "not-found";
}

export function visibleTools(
  group: keyof typeof toolGroups,
  challengesConfigured: boolean,
) {
  return toolGroups[group].filter(
    (tool) => tool.path !== "/browser/challenges" || challengesConfigured,
  );
}
