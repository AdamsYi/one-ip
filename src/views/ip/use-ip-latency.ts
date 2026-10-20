import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { latencyCountries, selectLatencyNodes } from "./latency-presets";
import { sameIp } from "./scenario-evidence";
import {
  getPingNodes,
  runPing,
  type PingResponse,
  type PingNode,
} from "../ping/api";

export function useIpLatency(ip: string) {
  const [busy, setBusy] = useState(false);
  const [nodes, setNodes] = useState<{ cc: string; node?: PingNode }[]>(
    latencyCountries.map((cc) => ({ cc })),
  );
  const [data, setData] = useState<PingResponse>();
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const names: Record<string, string> = {
    us: t("common.unitedStates"),
    de: t("ip.latency.germany"),
    gb: t("ip.latency.unitedKingdom"),
    fr: t("ip.latency.france"),
    jp: t("common.japan"),
    ca: t("ip.latency.canada"),
    cn: t("common.china"),
    kr: t("ip.latency.southKorea"),
  };
  const start = useCallback(async () => {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    setCatalogLoaded(false);
    setStarted(true);
    setError("");
    setData(undefined);
    setNodes(latencyCountries.map((cc) => ({ cc })));
    try {
      const selected = selectLatencyNodes(await getPingNodes(run.signal));
      if (run.signal.aborted) return;
      setNodes(selected);
      setCatalogLoaded(true);
      const ids = selected.flatMap((item) => (item.node ? [item.node.id] : []));
      if (!ids.length)
        throw new Error(t("ip.latency.noPreferredProbesAvailable"));
      await runPing(
        { host: ip, nodes: ids, preferred: true },
        run.signal,
        (result) => {
          if (!run.signal.aborted) setData(result);
        },
      );
    } catch (error) {
      if (!run.signal.aborted)
        setError(
          error instanceof Error ? error.message : t("ip.latency.lookupFailed"),
        );
    } finally {
      if (!run.signal.aborted) setBusy(false);
    }
  }, [ip]);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => {
    controller.current?.abort();
    setBusy(false);
    setError(t("common.cancelled"));
  };
  return {
    ip,
    busy,
    nodes,
    data: data && sameIp(data.target, ip) ? data : undefined,
    error,
    started,
    catalogLoaded,
    names,
    start,
    cancel,
  };
}
