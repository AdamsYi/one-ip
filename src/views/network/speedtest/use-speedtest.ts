import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { useMutation } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { emptyResult, measureSpeed } from "./api";
import { connectionsAtom, resultAtom } from "./store";

export function useSpeedtest() {
  const [connections, setConnections] = useAtom(connectionsAtom);
  const result = useAtomValue(resultAtom);
  const setResult = useSetAtom(resultAtom);
  const current = useRef<AbortController | null>(null);
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    networkMode: "always",
    mutationFn: async ({
      controller,
      mode,
    }: {
      controller: AbortController;
      mode: 1 | 4;
    }) => {
      try {
        await measureSpeed(mode, controller.signal, (next) => {
          if (current.current === controller && !controller.signal.aborted)
            setResult(next);
        });
      } catch (error) {
        if (current.current === controller) {
          setResult((previous) => ({
            ...previous,
            phase: controller.signal.aborted ? "stopped" : "error",
          }));
        }
        if (!controller.signal.aborted)
          throw new Error(t("speedtest.failed"), { cause: error });
      } finally {
        controller.abort();
        if (current.current === controller) current.current = null;
      }
    },
  });
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) current.current?.abort();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (current.current) {
        current.current.abort();
        current.current = null;
        setResult((previous) =>
          ["latency", "download", "upload"].includes(previous.phase)
            ? { ...previous, phase: "stopped" }
            : previous,
        );
      }
    };
  }, [setResult]);
  return {
    result,
    connections,
    setConnections,
    busy: mutation.isPending,
    error: mutation.error,
    start: () => {
      if (current.current || mutation.isPending) return;
      const controller = new AbortController();
      current.current = controller;
      setResult(emptyResult());
      mutation.mutate({ controller, mode: connections });
    },
    stop: () => current.current?.abort(),
  };
}
