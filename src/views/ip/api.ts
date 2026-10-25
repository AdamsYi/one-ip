import { t } from "@/i18n";
import { request } from "@/lib/network";
import type { Geo } from "@/lib/types";
import { adaptCoffee, type CoffeeIp } from "./coffee.ts";

const apiBase =
  (import.meta.env && import.meta.env.VITE_API_BASE_URL) || "/api";

export async function lookupIp(ip: string, signal?: AbortSignal) {
  const data = await request<CoffeeIp>(
    `${apiBase}/ip/quality/${encodeURIComponent(ip)}`,
    { signal, mode: "cors", credentials: "omit", cache: "no-store" },
  );
  const normalize = (value: string) =>
    value.includes(":") ? new URL(`https://[${value}]/`).hostname : value;
  if (typeof data.ip !== "string" || normalize(data.ip) !== normalize(ip))
    throw new Error(t("ip.ipReturnedSourceDoesMatchRequestedAddress"));
  return adaptCoffee(data);
}
export const currentIp = (signal?: AbortSignal) =>
  request<Geo>(`${apiBase}/me`, { signal });
