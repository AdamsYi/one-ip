import type { ChallengeProvider as Provider } from "@/hooks/use-challenge-config";
import { t } from "@/i18n";

export type WidgetApi = {
  render(
    container: HTMLElement,
    options: Record<string, unknown>,
  ): string | number;
  reset(id: string | number): void;
  execute?(sitekey: string, options: { action: string }): Promise<string>;
  remove?(id: string | number): void;
};
declare global {
  interface Window {
    turnstile?: WidgetApi;
    grecaptcha?: WidgetApi & { ready(callback: () => void): void };
  }
}
const scripts = new Map<string, Promise<WidgetApi>>();
export function loadWidget(
  id: Provider["id"],
  sitekey: string,
): Promise<WidgetApi> {
  const key = id === "recaptcha" ? `${id}:${sitekey}` : "turnstile";
  const existing = scripts.get(key);
  if (existing) return existing;
  const promise = new Promise<WidgetApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      id !== "recaptcha"
        ? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        : `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(sitekey)}`;
    script.async = true;
    const timer = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      scripts.delete(key);
      reject(
        new Error(
          t(
            "challenges.verificationComponentFailedLoadCheckNetworkContentBlocking",
          ),
        ),
      );
    }
    script.onerror = fail;
    script.onload = () => {
      const ready = () => {
        const api = id !== "recaptcha" ? window.turnstile : window.grecaptcha;
        if (!api || (id === "recaptcha" ? !api.execute : !api.render)) {
          fail();
          return;
        }
        clearTimeout(timer);
        resolve(api);
      };
      if (id === "recaptcha" && window.grecaptcha?.ready)
        window.grecaptcha.ready(ready);
      else ready();
    };
    document.head.append(script);
  });
  scripts.set(key, promise);
  return promise;
}
