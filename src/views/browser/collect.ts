import { t } from "@/i18n";
import { compareContexts, comparePlatforms, type Check } from "./consistency";
import { environmentSnapshot, type BrowserNavigator } from "./environment";

export async function consistencyChecks(): Promise<Check[]> {
  const snapshot = environmentSnapshot();
  const checks: Check[] = [
    comparePlatforms(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints,
    ),
  ];
  const nav = navigator as BrowserNavigator;
  if (nav.userAgentData) {
    checks.push({
      ...comparePlatforms(
        nav.userAgent,
        nav.userAgentData.platform,
        nav.maxTouchPoints,
      ),
      name: t("browser.uaClientHintsPlatform"),
    });
  } else
    checks.push({
      name: t("browser.uaClientHintsPlatform"),
      status: "unavailable",
      detail: t("browser.theBrowserDidNotProvideClientHints"),
    });
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = t("browser.environmentConsistencyCheck");
  try {
    document.body.append(frame);
    const win = frame.contentWindow as (Window & typeof globalThis) | null;
    if (!win) throw new Error();
    checks.push(
      compareContexts(
        snapshot,
        {
          userAgent: win.navigator.userAgent,
          platform: win.navigator.platform,
          language: win.navigator.language,
          languages: Array.from(win.navigator.languages),
          hardwareConcurrency: win.navigator.hardwareConcurrency,
          timezone: win.Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        t("browser.mainPageIframe"),
      ),
    );
  } catch {
    checks.push({
      name: t("browser.mainPageIframe"),
      status: "unavailable",
      detail: t("browser.theBrowserRestrictedAccessToTheChildFrame"),
    });
  } finally {
    frame.remove();
  }
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new Worker(new URL("./context.worker.ts", import.meta.url), {
      type: "module",
    });
    const data = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        timeout = setTimeout(() => reject(new Error()), 5000);
        worker!.onmessage = (event) => resolve(event.data);
        worker!.onerror = () => reject(new Error());
        worker!.postMessage("read");
      },
    );
    checks.push(compareContexts(snapshot, data, t("browser.mainPageWorker")));
  } catch {
    checks.push({
      name: t("browser.mainPageWorker"),
      status: "unavailable",
      detail: t("browser.workerReturnedResultPossiblyDuePolicyRestrictions"),
    });
  } finally {
    clearTimeout(timeout);
    worker?.terminate();
  }
  checks.push({
    name: t("common.preferredLanguage"),
    status: !nav.languages.length
      ? "unavailable"
      : nav.language === nav.languages[0]
        ? "consistent"
        : "different",
    detail: `language: ${nav.language}；languages[0]: ${nav.languages[0] ?? t("common.notProvided")}。`,
  });
  return checks;
}
export function automationChecks(): Check[] {
  return [
    {
      name: "WebDriver",
      status:
        typeof navigator.webdriver !== "boolean"
          ? "unavailable"
          : navigator.webdriver
            ? "detected"
            : "not-detected",
      detail: t("browser.navigatorWebdriverValueChangedBrowserExtensions", [
        String(navigator.webdriver),
      ]),
    },
    {
      name: "Headless UA",
      status: /HeadlessChrome/i.test(navigator.userAgent)
        ? "detected"
        : "not-detected",
      detail: t(
        "browser.checksWhetherUserAgentExplicitlyContainsHeadlesschrome",
      ),
    },
    {
      name: t("browser.legacyAutomationGlobals"),
      status: ["_phantom", "callPhantom", "__nightmare"].some(
        (key) => key in window,
      )
        ? "detected"
        : "not-detected",
      detail: t("browser.checksCommonPhantomjsNightmareMarkersDoesCoverAll"),
    },
  ];
}
export async function fingerprint() {
  const { load, hashComponents } = await import("@fingerprintjs/fingerprintjs");
  const result = await (await load({ monitoring: false })).get();
  const components = Object.entries(result.components).map(([name, value]) => ({
    name,
    value:
      "error" in value
        ? t("browser.check.unavailable")
        : hashComponents({ [name]: value }),
    detail:
      "error" in value
        ? t("browser.notProvidedByTheBrowserOrAccessRestricted")
        : JSON.stringify(value.value),
  }));
  const element = document.createElement("span");
  element.textContent = "Browser diagnostics 字体 Aa 0123";
  element.style.cssText =
    "position:fixed;left:-10000px;top:0;font:17px Arial;visibility:hidden;white-space:nowrap";
  try {
    document.body.append(element);
    const rect = element.getBoundingClientRect();
    const value = { width: rect.width, height: rect.height };
    components.push({
      name: "ClientRects",
      value: hashComponents({ rect: { value, duration: 0 } }),
      detail: JSON.stringify(value),
    });
  } finally {
    element.remove();
  }
  return { visitorId: result.visitorId, version: result.version, components };
}
