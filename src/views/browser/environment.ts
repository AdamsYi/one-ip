import { t } from "@/i18n";

export interface BrowserNavigator extends Navigator {
  deviceMemory?: number;
  globalPrivacyControl?: boolean;
  userAgentData?: {
    platform: string;
    mobile: boolean;
    brands: { brand: string; version: string }[];
    getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
  };
}
export function environmentSnapshot() {
  const nav = navigator as BrowserNavigator;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    languages: Array.from(nav.languages),
    hardwareConcurrency: nav.hardwareConcurrency,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
export function environmentRows(): [string, string | number][] {
  const nav = navigator as BrowserNavigator;
  return [
    ["User-Agent", nav.userAgent],
    [t("browser.platform"), nav.platform || t("common.notProvided")],
    [t("browser.language"), nav.languages.join(" · ")],
    [t("common.timezone"), Intl.DateTimeFormat().resolvedOptions().timeZone],
    [t("browser.screen"), `${screen.width} × ${screen.height}`],
    [
      t("browser.availableScreen"),
      `${screen.availWidth} × ${screen.availHeight}`,
    ],
    [t("browser.viewport"), `${innerWidth} × ${innerHeight}`],
    [t("browser.pixelRatio"), devicePixelRatio],
    [t("common.colorDepth"), screen.colorDepth],
    [
      t("common.logicalProcessors"),
      nav.hardwareConcurrency ?? t("common.notProvided"),
    ],
    [
      t("common.memoryHint"),
      nav.deviceMemory
        ? t("browser.gbApprox", [nav.deviceMemory])
        : t("common.notProvided"),
    ],
    [t("browser.touchPoints"), nav.maxTouchPoints],
    ["Cookie", nav.cookieEnabled ? t("common.enabled") : t("common.disabled")],
    [
      t("browser.clientHintsPlatform"),
      nav.userAgentData?.platform ?? t("common.unsupported"),
    ],
    [
      t("browser.clientHintsBrands"),
      nav.userAgentData?.brands
        .map((item) => `${item.brand} ${item.version}`)
        .join(" · ") ?? t("common.unsupported"),
    ],
  ];
}
