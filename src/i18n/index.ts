import { messages, type MessageKey } from "./messages.ts";

export type { MessageKey } from "./messages.ts";

export type Locale = "zh-CN" | "en";
const storageKey = "ip-tools:locale";

export function resolveLocale(
  saved: string | null,
  languages: readonly string[],
): Locale {
  if (saved === "zh-CN" || saved === "en") return saved;
  return languages[0]?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function initialLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  // The URL also keeps language switching usable when storage is blocked.
  const override = new URL(window.location.href).searchParams.get("lang");
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    /* Storage may be disabled. */
  }
  return resolveLocale(
    override === "en" || override === "zh-CN" ? override : saved,
    navigator.languages,
  );
}

export const locale = initialLocale();
const dictionary = messages[locale];
const placeholder = /\{(\d+)\}/g;

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(messages["zh-CN"], key);
}

export function t(key: MessageKey, values: readonly unknown[] = []): string {
  return dictionary[key].replace(placeholder, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    /* URL fallback below. */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  window.location.assign(url.href);
}

export function initializeLocale() {
  document.documentElement.lang = locale;
  document.title = t("navigation.siteTitle");
  const description = document.querySelector('meta[name="description"]');
  if (description)
    description.setAttribute("content", t("navigation.siteDescription"));
}
