import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { OverflowDetailText } from "@/components/overflow-detail-text";
import { SiteLogo } from "@/components/site-logo";
import { PageHeading, Pending, ActionButton } from "@/components/toolkit";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";
import { useQueries } from "@tanstack/react-query";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { checkCdnProvider } from "./api";
import { providers, providerWebsite } from "./providers";

type Row = {
  name: string;
  node?: string;
  cache?: string;
  loading: boolean;
  error?: string;
};
const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: t("common.vendor"),
    cell: ({ row }) => (
      <span className="site-cell">
        <SiteLogo website={providerWebsite(row.original.name)} />
        <OverflowDetailText
          text={row.original.name}
          title={t("cdn.cdnProvider")}
        />
      </span>
    ),
  },
  {
    id: "node",
    header: t("cdn.nodeResponseIdentifier"),
    cell: ({ row }) =>
      row.original.loading ? (
        <Pending>{t("common.checkingDots")}</Pending>
      ) : (
        <OverflowDetailText text={row.original.node ?? t("common.unknown")} />
      ),
  },
  {
    accessorKey: "cache",
    header: t("cdn.cached"),
    cell: ({ row }) => (
      <OverflowDetailText
        text={row.original.cache ?? "—"}
        title={t("cdn.cacheStatus")}
      />
    ),
  },
  {
    id: "status",
    header: t("common.status"),
    cell: ({ row }) =>
      row.original.loading ? (
        <Pending>{t("common.checkingDots")}</Pending>
      ) : (
        <OverflowDetailText text={row.original.error ?? t("common.complete")} />
      ),
  },
];
export default function CdnPage() {
  const [round, setRound] = useState(0);
  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["cdn-node-v2", provider.name, round],
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        checkCdnProvider(provider, signal),
    })),
  });
  const busy = queries.some((query) => query.isFetching);
  return (
    <>
      <PageHeading title={t("cdn.cdnServingNodes")} description="" />
      <div className="toolbar">
        <ActionButton busy={busy} onClick={() => setRound((n) => n + 1)}>
          {busy ? t("common.checkingDots") : t("common.runAgain")}
        </ActionButton>
        <span className="small muted">
          {queries.filter((query) => query.isSuccess).length}/{providers.length}{" "}
          {t("cdn.readable")}
        </span>
      </div>
      <Card>
        <CardContent>
          <DataTable
            className="cdn-table"
            columns={columns}
            getRowId={(row) => row.name}
            animateChanges={false}
            data={providers.map((provider, index) => ({
              name: provider.name,
              ...queries[index].data,
              loading: queries[index].isFetching,
              error: queries[index].error?.message,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
