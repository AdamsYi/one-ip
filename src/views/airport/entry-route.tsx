import { t } from "@/i18n";
import { endpoint, maskedIp } from "@/lib/network";
import { hideIpAtom } from "@/store/privacy";
import {
  RouteGradeTiles,
  type CarrierKey,
  type GradeVerdict,
} from "@/views/ip/route-grade-tiles";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

interface RouteData {
  status: "finished" | "pending" | "degraded";
  reason?: string;
  carriers?: Partial<Record<CarrierKey, GradeVerdict>>;
}

/** China three-carrier measurement to one airport entry IP. */
export function EntryRoute({ ip, label }: { ip: string; label: string }) {
  const hidden = useAtomValue(hideIpAtom);
  const query = useQuery({
    queryKey: ["china-route", ip],
    queryFn: ({ signal }) =>
      endpoint<RouteData>(`/route/${encodeURIComponent(ip)}`, { signal }),
    refetchInterval: (state) =>
      state.state.data?.status === "pending" ? 3000 : false,
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <code className="text-xs text-muted-foreground">
          {maskedIp(ip, hidden)}
        </code>
      </p>
      {query.isError || data?.status === "degraded" ? (
        <p className="text-sm text-muted-foreground">
          {data?.reason === "busy"
            ? t("ip.route.queued")
            : t("ip.route.unavailable")}
        </p>
      ) : (
        <RouteGradeTiles
          carriers={data?.carriers}
          pending={query.isPending || data?.status === "pending"}
        />
      )}
    </div>
  );
}
