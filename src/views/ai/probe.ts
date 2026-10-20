import { t } from "@/i18n";
import { request, parseTrace } from "../../lib/network.ts";

export interface AiProbeResult {
  samples: number[];
  median: number | null;
  status: "response" | "restricted" | "unknown";
  description: string;
}
export async function probeAiDomain(
  domain: string,
  signal?: AbortSignal,
): Promise<AiProbeResult> {
  const readable = domain === "claude.ai" || domain === "www.perplexity.ai";
  const path = readable
    ? "/cdn-cgi/trace"
    : domain === "gemini.google.com"
      ? "/robots.txt"
      : "/favicon.ico";
  const samples: number[] = [];
  signal?.throwIfAborted();
  const start = performance.now();
  try {
    const body = await request<string>(
      `https://${domain}${path}`,
      {
        mode: readable ? "cors" : "no-cors",
        credentials: "omit",
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
          : AbortSignal.timeout(3000),
      },
      readable ? "text" : "opaque",
    );
    if (readable) parseTrace(body);
    const elapsed = Math.round(performance.now() - start);
    samples.push(elapsed);
    return {
      samples,
      median: elapsed,
      status: "response",
      description: readable
        ? t("ai.readValidatedEdgeNetworkResponseDoesGuaranteeLogin", [domain])
        : t("ai.receivedResourceResponseDoesGuaranteeLoginChatAvailability", [
            domain,
            path,
          ]),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    samples.push(-1);
  }
  return {
    samples,
    median: null,
    status: "unknown",
    description: t("ai.validResponseWithinOneSecondProbeLimitSkipped"),
  };
}
