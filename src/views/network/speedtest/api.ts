import { t } from "@/i18n";
import { request, trace } from "@/lib/network";

const ORIGIN = "https://speed.cloudflare.com";
export const TRANSFER_SECONDS = 10;
export const DOWNLOAD_LIMIT = 200_000_000;
export const UPLOAD_LIMIT = 100_000_000;

type Direction = "download" | "upload";
export type Phase =
  "idle" | "latency" | Direction | "complete" | "stopped" | "error";
export type Transfer = {
  bytes: number;
  mbps?: number;
  loadedLatency?: number;
  complete: boolean;
  points: { seconds: number; mbps: number }[];
};
export type SpeedResult = {
  phase: Phase;
  latency?: number;
  jitter?: number;
  node?: { ip: string; colo?: string };
  download: Transfer;
  upload: Transfer;
};

export function emptyResult(): SpeedResult {
  const transfer = (): Transfer => ({ bytes: 0, complete: false, points: [] });
  return { phase: "idle", download: transfer(), upload: transfer() };
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function downloadUrl(bytes: number) {
  return `${ORIGIN}/__down?bytes=${bytes}&r=${crypto.randomUUID()}`;
}

async function latency(signal: AbortSignal) {
  const url = downloadUrl(0);
  const started = performance.now();
  const response = await request<Response>(
    url,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
    "response",
  );
  if (response.headers.get("content-type")?.includes("text/html")) {
    await response.body?.cancel();
    throw new Error(t("speedtest.invalidResponse"));
  }
  await response.arrayBuffer();
  const elapsed = performance.now() - started;
  const timing = performance.getEntriesByName(url, "resource")[0] as
    PerformanceResourceTiming | undefined;
  const serverTime = Number(
    response.headers
      .get("server-timing")
      ?.match(/cfRequestDuration;dur=([\d.]+)/)?.[1] ?? 0,
  );
  const duration =
    timing &&
    timing.requestStart > 0 &&
    timing.responseStart > timing.requestStart
      ? timing.responseStart - timing.requestStart
      : elapsed;
  return Math.max(0, duration - serverTime);
}

async function download(
  bytes: number,
  signal: AbortSignal,
  received: (bytes: number) => void,
) {
  const response = await request<Response>(
    downloadUrl(bytes),
    {
      signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
    "response",
  );
  if (
    !response.body ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    await response.body?.cancel();
    throw new Error(t("speedtest.invalidResponse"));
  }
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > bytes) throw new Error(t("speedtest.invalidResponse"));
      received(value.byteLength);
    }
    if (total !== bytes) throw new Error(t("speedtest.invalidResponse"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function upload(body: Blob, signal: AbortSignal) {
  const response = await request<Response>(
    `${ORIGIN}/__up?r=${crypto.randomUUID()}`,
    {
      method: "POST",
      body,
      signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
    "response",
  );
  if (response.headers.get("content-type")?.includes("text/html")) {
    await response.body?.cancel();
    throw new Error(t("speedtest.invalidResponse"));
  }
  await response.arrayBuffer();
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      finish();
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function measureSpeed(
  connections: 1 | 4,
  signal: AbortSignal,
  progress: (result: SpeedResult) => void,
) {
  const result = emptyResult();
  const publish = () =>
    progress({
      ...result,
      download: { ...result.download, points: [...result.download.points] },
      upload: { ...result.upload, points: [...result.upload.points] },
    });
  result.phase = "latency";
  publish();
  const [node] = await Promise.all([
    trace("speed.cloudflare.com", signal).catch(() => undefined),
    latency(signal), // Warm the connection before collecting idle samples.
  ]);
  result.node = node;
  const idle: number[] = [];
  for (let index = 0; index < 8; index++) {
    signal.throwIfAborted();
    idle.push(await latency(signal));
    result.latency = median(idle);
    if (idle.length > 1) {
      result.jitter =
        idle
          .slice(1)
          .reduce((sum, value, i) => sum + Math.abs(value - idle[i]), 0) /
        (idle.length - 1);
    }
    publish();
  }

  // Random payloads avoid inflated throughput from content compression.
  const payload = new Uint8Array(8_000_000);
  for (let offset = 0; offset < payload.length; offset += 65_536)
    crypto.getRandomValues(payload.subarray(offset, offset + 65_536));
  const uploadBody = new Blob([payload], { type: "text/plain" });

  for (const direction of ["download", "upload"] as const) {
    signal.throwIfAborted();
    result.phase = direction;
    const transfer = result[direction];
    const limit = direction === "download" ? DOWNLOAD_LIMIT : UPLOAD_LIMIT;
    const controller = new AbortController();
    const stageSignal = AbortSignal.any([
      signal,
      controller.signal,
      AbortSignal.timeout(TRANSFER_SECONDS * 1000),
    ]);
    const started = performance.now();
    const loaded: number[] = [];
    let reserved = 0;
    const sample = () => {
      const seconds = (performance.now() - started) / 1000;
      if (transfer.bytes > 0 && seconds > 0) {
        transfer.mbps = (transfer.bytes * 8) / seconds / 1_000_000;
        transfer.points.push({ seconds, mbps: transfer.mbps });
      }
      publish();
    };
    publish();
    const ticker = setInterval(sample, 250);
    const loadedProbe = (async () => {
      while (!stageSignal.aborted) {
        try {
          await wait(400, stageSignal);
          loaded.push(await latency(stageSignal));
          transfer.loadedLatency = median(loaded);
        } catch {
          // Missing loaded-latency samples do not invalidate the transfer.
        }
      }
    })();
    const workers = Array.from({ length: connections }, async () => {
      let size = direction === "download" ? 1_000_000 : 250_000;
      while (!stageSignal.aborted && reserved < limit) {
        const bytes = Math.min(size, limit - reserved);
        reserved += bytes;
        const requestStarted = performance.now();
        try {
          if (direction === "download") {
            await download(bytes, stageSignal, (count) => {
              transfer.bytes += count;
            });
          } else {
            await upload(uploadBody.slice(0, bytes, "text/plain"), stageSignal);
            transfer.bytes += bytes;
          }
        } catch (error) {
          if (
            stageSignal.aborted &&
            !signal.aborted &&
            stageSignal.reason?.name === "TimeoutError"
          )
            return;
          throw error;
        }
        size = Math.min(
          direction === "download" ? 16_000_000 : uploadBody.size,
          Math.max(
            64_000,
            Math.round(
              (bytes * 1000) / Math.max(1, performance.now() - requestStarted),
            ),
          ),
        );
      }
    });
    try {
      await Promise.all(workers);
      signal.throwIfAborted();
      if (!transfer.bytes) throw new Error(t("speedtest.noSamples"));
      sample();
      transfer.complete = true;
      publish();
    } finally {
      clearInterval(ticker);
      controller.abort();
      await Promise.allSettled([...workers, loadedProbe]);
    }
  }
  signal.throwIfAborted();
  result.phase = "complete";
  publish();
}
