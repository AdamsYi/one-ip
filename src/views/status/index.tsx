import { useSearchParams } from "react-router-dom";
import { AnimatedValue } from "@/components/animated-value";
import { DataTable } from "@/components/data-table";
import { NumberTicker } from "@/components/number-ticker";
import { SiteLogo } from "@/components/site-logo";
import { PageHeading, Pending, ToolCard } from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { UnderlineHover } from "@/components/underline-hover";
import { useIsMobile } from "@/hooks/use-mobile";
import { t, locale } from "@/i18n";
import { localizeApiMessage } from "@/i18n/api-message";
import { localizeCatalogItem } from "@/lib/localize-catalog";
import { useQueries } from "@tanstack/react-query";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { getStatus } from "./api";
import { serviceGroups, serviceGroupLabel } from "./groups";
import { statusOrder } from "./order";
import rawservices from "./services.json";

const services = rawservices.map(localizeCatalogItem);

const componentLabels: Record<string, string> = {
  operational: t("common.operational"),
  degraded_performance: t("status.degradedPerformance"),
  partial_outage: t("status.partialOutage"),
  major_outage: t("common.majorOutage"),
  under_maintenance: t("common.underMaintenance"),
};
const labels: Record<string, string> = {
  none: t("common.operational"),
  minor: t("common.minorOutage"),
  major: t("common.majorOutage"),
  critical: t("common.criticalOutage"),
  maintenance: t("common.underMaintenance"),
};
export default function StatusPage() {
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const requestedService = params.get("service");
  const detailId = services.some((service) => service.id === requestedService)
    ? requestedService
    : null;
  const setDetailId = (id: string | null) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("service", id);
        else next.delete("service");
        return next;
      },
      { replace: id === null },
    );
  };
  const filter = params.get("group") ?? "全部";
  const queries = useQueries({
    queries: services.map((s) => ({
      queryKey: ["service-status", s.id],
      enabled: Boolean(s.url),
      queryFn: ({ signal }: { signal: AbortSignal }) => getStatus(s.id, signal),
      retry: false,
      staleTime: 60_000,
      refetchInterval: 120_000,
    })),
  });
  const pending = queries.some((q) => q.isFetching);
  const rows = services
    .map((service, i) => ({ ...service, query: queries[i] }))
    .filter((s) => filter === "全部" || s.group === filter);
  const sections = [
    [
      t("status.incidentsMaintenance"),
      rows
        .filter((s) => statusOrder(s.query.data?.status?.indicator) === 0)
        .sort((a, b) => {
          const severity = ["critical", "major", "minor", "maintenance"];
          return (
            severity.indexOf(a.query.data!.status.indicator) -
            severity.indexOf(b.query.data!.status.indicator)
          );
        }),
    ],
    [
      t("status.operational"),
      rows.filter((s) => s.query.data?.status?.indicator === "none"),
    ],
    [
      t("common.pendingConfirmation"),
      rows.filter((s) => statusOrder(s.query.data?.status?.indicator) === 2),
    ],
  ] as const;
  const tableRows = sections.flatMap(([, items]) =>
    items.map((service) => ({
      id: service.id,
      name: service.name,
      group: service.group,
      page: service.page,
      icon: service.icon,
      data: service.query.data,
      loading: Boolean(service.url) && service.query.isPending,
      integrated: Boolean(service.url),
      officialStatus: service.officialStatus !== false,
      statusSource:
        "statusSource" in service ? service.statusSource : undefined,
      note: service.note,
      fetching: service.query.isFetching,
      error: service.query.error?.message,
    })),
  );
  const columns: ColumnDef<(typeof tableRows)[number]>[] = [
    {
      accessorKey: "name",
      header: t("status.service"),
      cell: ({ row }) => (
        <button
          type="button"
          className="service-name text-left text-primary focus-visible:outline-ring"
          onClick={() => setDetailId(row.original.id)}
          aria-label={t("common.viewDetails", [row.original.name])}
        >
          <SiteLogo src={row.original.icon} website={row.original.page} />
          <UnderlineHover className="truncate">
            {row.original.name}
          </UnderlineHover>
          {!!row.original.data?.incidents?.length && (
            <Badge variant="secondary" className="shrink-0">
              {row.original.data.incidents.length}
              {t("status.incidents")}
            </Badge>
          )}
        </button>
      ),
    },
    {
      accessorKey: "group",
      header: t("status.category"),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {serviceGroupLabel(row.original.group)}
        </Badge>
      ),
    },
    {
      id: "status",
      header: t("common.status"),
      cell: ({ row }) => {
        const service = row.original;
        const indicator = service.data?.status?.indicator;
        return (
          <button
            type="button"
            onClick={() => setDetailId(service.id)}
            aria-label={t("status.viewStatusDetails", [service.name])}
            className={`service-table-state service-card service-${indicator ?? "unknown"}`}
          >
            <i
              className={`service-dot ${service.fetching ? "service-dot-loading" : ""}`}
            />
            <AnimatedValue value={`${service.loading}-${indicator}`}>
              {service.loading ? (
                <Pending>{t("common.lookingUp")}</Pending>
              ) : !service.integrated ? (
                t("status.notIntegrated")
              ) : (
                (labels[indicator ?? ""] ?? t("common.unknown"))
              )}
            </AnimatedValue>
          </button>
        );
      },
    },
    {
      id: "updated",
      header: t("status.updatedAt"),
      cell: ({ row }) => (
        <span className="small muted">
          {row.original.data?.fetchedAt
            ? new Date(row.original.data.fetchedAt).toLocaleTimeString(locale)
            : "—"}
        </span>
      ),
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <UnderlineHover asChild>
          <a
            href={row.original.page}
            target="_blank"
            rel="noreferrer"
            className="small"
          >
            {row.original.statusSource
              ? t("status.thirdParty", [row.original.statusSource])
              : row.original.officialStatus
                ? t("status.officialStatus")
                : t("status.platformWebsite")}
          </a>
        </UnderlineHover>
      ),
    },
  ];
  const detail = tableRows.find((service) => service.id === detailId);
  return (
    <div className="service-status-page">
      <PageHeading
        title={t("navigation.serviceStatus")}
        description={t(
          "status.serviceStatusIncidentsThirdPartySourcesLabeledSeparately",
        )}
      />
      <div className="toolbar">
        <div className="filter-tabs">
          {serviceGroups.map(({ value: group, label }) => (
            <Button
              size="sm"
              variant={group === filter ? "secondary" : "ghost"}
              key={group}
              onClick={() => setParams(group === "全部" ? {} : { group })}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            void Promise.all(
              queries
                .filter((_, index) => services[index].url)
                .map((q) => q.refetch()),
            );
          }}
        >
          {pending ? (
            <Pending>{t("status.refreshing")}</Pending>
          ) : (
            t("status.refreshStatus")
          )}
        </Button>
      </div>
      <div className="service-summary">
        {sections.map(([label, items], index) => (
          <ToolCard
            key={label}
            title={
              <span className="block truncate" title={label}>
                {locale === "en"
                  ? ["Issues", "Healthy", "Unknown"][index]
                  : label}
              </span>
            }
            className={`service-summary-card summary-${index}`}
          >
            <div className="service-summary-number">
              <NumberTicker value={items.length} />
              <span>{t("status.services")}</span>
            </div>
          </ToolCard>
        ))}
      </div>
      {mobile ? (
        <div className="space-y-3">
          {sections.map(
            ([label, items]) =>
              items.length > 0 && (
                <Card key={label}>
                  <CardContent>
                    <h2 className="mb-1 text-xs font-medium text-muted-foreground">
                      {label} · {items.length}
                    </h2>
                    <div className="divide-y divide-border/50">
                      {items.map((service) => {
                        const indicator = service.query.data?.status?.indicator;
                        const incident = service.query.data?.incidents?.[0];
                        return (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => setDetailId(service.id)}
                            className="block w-full py-3 text-left"
                            aria-label={t("common.viewDetails", [service.name])}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                                <SiteLogo
                                  src={service.icon}
                                  website={service.page}
                                />
                                <span className="truncate">
                                  {service.name.replace(" (Anthropic)", "")}
                                </span>
                              </span>
                              <span
                                className={`service-card service-${indicator ?? "unknown"} shrink-0 text-xs`}
                              >
                                {service.query.isFetching && !service.query.data
                                  ? t("common.lookingUpLabel")
                                  : !service.url
                                    ? t("status.notIntegrated")
                                    : (labels[indicator ?? ""] ??
                                      t("common.pendingConfirmation"))}
                              </span>
                            </span>
                            {incident && (
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {incident.name}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ),
          )}
        </div>
      ) : (
        <div className="service-table">
          <Card>
            <CardContent>
              <DataTable
                data={tableRows}
                columns={columns}
                getRowId={(row) => row.id}
                animateChanges={false}
                empty={t("status.noServices")}
              />
            </CardContent>
          </Card>
        </div>
      )}
      <p className="small muted">
        {t("status.checksAutomaticallyEvery2MinutesUnknownFailedQueries")}
      </p>
      <ResponsiveDialog
        title={t("status.namedServiceDetails", [
          detail?.name ?? t("status.service"),
        ])}
        description={
          detail?.loading
            ? t("status.checkingServiceStatus")
            : (detail?.error ??
              detail?.note ??
              (detail?.data?.status?.description
                ? localizeApiMessage(detail.data.status.description)
                : t("status.noDescription")))
        }
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        {detail && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">
              {!detail.integrated
                ? t("status.notIntegrated")
                : (labels[detail.data?.status?.indicator ?? ""] ??
                  t("common.unknown"))}
            </Badge>
            <span>{serviceGroupLabel(detail.group)}</span>
            {detail.statusSource && (
              <span>{t("status.thirdParty", [detail.statusSource])}</span>
            )}
            {detail.data?.checkedAt && (
              <time>
                {t("status.sourceCheckedAt", [
                  new Date(detail.data.checkedAt).toLocaleString(locale),
                ])}
              </time>
            )}
            {detail.data?.fetchedAt && (
              <time>
                {t("status.updated")}
                {new Date(detail.data.fetchedAt).toLocaleString(locale)}
              </time>
            )}
          </div>
        )}
        {!!detail?.data?.components?.length && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("status.serviceComponents")}
            </h3>
            <dl className="divide-y divide-border text-sm">
              {detail.data.components.map((component) => (
                <div
                  key={component.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <dt className="min-w-0 break-words">{component.name}</dt>
                  <dd className="shrink-0 text-muted-foreground">
                    {componentLabels[component.status] ?? component.status}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <h3 className="text-sm font-medium">{t("status.currentIncidents")}</h3>
        {!detail?.loading &&
          !detail?.error &&
          detail?.data &&
          Array.isArray(detail.data.incidents) &&
          !detail.data.incidents.length && (
            <p className="text-sm text-muted-foreground">
              {t("status.theSourceReportedNoCurrentIncidents")}
            </p>
          )}
        {detail?.data && !detail.data.incidents && (
          <p className="text-sm text-muted-foreground">
            {t("status.sourceProvidesAggregateStatusSeeSourcePageIncident")}
          </p>
        )}
        {detail?.data?.incidents?.map((incident) => (
          <section
            key={incident.id}
            className="space-y-2 rounded-lg bg-muted/50 p-3"
          >
            <h3 className="font-medium">{incident.name}</h3>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{incident.status}</Badge>
              {incident.updated_at && (
                <time>
                  {new Date(incident.updated_at).toLocaleString(locale)}
                </time>
              )}
            </div>
          </section>
        ))}
        {detail && (
          <a
            className="text-sm underline underline-offset-4"
            href={detail.page}
            target="_blank"
            rel="noreferrer"
          >
            {detail.statusSource
              ? t("status.thirdParty", [detail.statusSource])
              : detail.officialStatus
                ? t("status.viewOfficialStatusPage")
                : t("status.visitPlatformWebsite")}
          </a>
        )}
      </ResponsiveDialog>
    </div>
  );
}
