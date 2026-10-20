import { endpoint } from "@/lib/network";

export interface SubdomainsResult {
  domain: string;
  source: string;
  sourceUrl: string;
  names: string[];
  limit?: number;
  checkedAt: string;
}

export function lookupSubdomains(domain: string, signal: AbortSignal) {
  return endpoint<SubdomainsResult>(
    `/subdomains/${encodeURIComponent(domain)}`,
    { signal },
  );
}
