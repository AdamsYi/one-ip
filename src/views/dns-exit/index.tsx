import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { NumberTicker } from "@/components/number-ticker";
import { OverflowDetailText } from "@/components/overflow-detail-text";
import {
  PageHeading,
  IpText,
  ActionButton,
  ErrorNotice,
  Pending,
} from "@/components/toolkit";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { detectDnsExits, dnsSampleCount, type DnsProgress } from "./api";

type Resolver = DnsProgress["results"][number];
const columns: ColumnDef<Resolver>[] = [
  {
    id: "ip",
    header: t("dns.dnsEgressIp"),
    cell: ({ row }) => <IpText ip={row.original.ip} />,
  },
  {
    accessorKey: "geo",
    header: t("dns.locationIsp"),
    cell: ({ row }) => (
      <OverflowDetailText
        text={row.original.geo}
        title={t("dns.dnsLocationDetails")}
      />
    ),
  },
  {
    id: "sources",
    header: t("dns.detectionSource"),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1.5">
        {row.original.sources.map((source) => (
          <span
            key={source}
            className="whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
          >
            {source}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: "samples",
    header: t("dns.observations"),
    cell: ({ row }) => <NumberTicker value={row.original.samples} />,
  },
];
export default function DnsExitPage() {
  const [round, setRound] = useState(0);
  const client = useQueryClient();
  const progressKey = ["dns-exit-progress", round];
  const progress = useQuery<DnsProgress>({
    queryKey: progressKey,
    enabled: false,
    queryFn: skipToken,
  });
  const query = useQuery({
    queryKey: ["dns-exit", round],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      detectDnsExits(signal, (state) => {
        client.setQueryData(progressKey, state);
      }),
  });
  const state = query.isFetching
    ? progress.data
    : (query.data ?? progress.data);
  return (
    <>
      <PageHeading title={t("dns.dnsEgressLookup")} description="" />
      <div className="toolbar">
        <ActionButton
          busy={query.isFetching}
          onClick={() => setRound((n) => n + 1)}
        >
          {query.isFetching ? t("common.checkingDots") : t("common.runAgain")}
        </ActionButton>
        <span className="small muted">
          <NumberTicker value={state?.count ?? 0} />/{dnsSampleCount}
          {t("dns.samples")} {state?.failed ?? 0}
          {t("dns.failures")}
        </span>
      </div>
      <ErrorNotice error={query.error} />
      {state && state.failed > 0 && (
        <p className="small muted mb-3">
          {t("dns.someProbesFailedDoesMeanThereDnsLeaks")}{" "}
          {Object.entries(state.failures)
            .map(([source, count]) => `${source}: ${count}`)
            .join(" · ")}
        </p>
      )}
      <Card>
        <CardContent>
          <DataTable
            className="dns-exit-table"
            data={state?.results ?? []}
            columns={columns}
            getRowId={(row) => row.ip}
            animateChanges={false}
            animateEntries
            empty={
              query.isFetching ? (
                <Pending>{t("dns.waitingForResolutionResults")}</Pending>
              ) : (
                t("dns.noDnsEgressDetected")
              )
            }
          />
        </CardContent>
      </Card>
      <p className="small muted mt-3">
        {t("dns.identicalEgressAddressesMergedTheirCountDependsActual")}
      </p>
    </>
  );
}
