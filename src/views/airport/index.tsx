import { useRef, useState, type ReactNode } from "react";
import {
  ErrorNotice,
  PageHeading,
  Pending,
  ToolCard,
} from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isMessageKey, locale, t, type MessageKey } from "@/i18n";
import type { AirportReport, CostLevel, EntryKind } from "@/lib/airport-audit";
import { looksLikeSubscriptionUrl } from "@/lib/subscription";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { EntryRoute } from "./entry-route";
import { useAirportAudit, type PlanUsage } from "./use-airport-audit";

const KIND_ORDER: EntryKind[] = [
  "domestic",
  "premium_line",
  "cdn",
  "overseas",
  "unknown",
];

const KIND_COLOR: Record<EntryKind, string> = {
  domestic: "bg-emerald-500",
  premium_line: "bg-teal-500",
  cdn: "bg-amber-500",
  overseas: "bg-sky-500",
  unknown: "bg-muted-foreground/40",
};

const COST_STYLE: Record<CostLevel, string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  mid: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  low: "bg-muted text-foreground",
  unknown: "bg-muted text-muted-foreground",
};

function msg(key: string, values: readonly unknown[] = []) {
  return isMessageKey(key) ? t(key as MessageKey, values) : key;
}

function gb(bytes: number) {
  return (bytes / 1024 ** 3).toFixed(1);
}

function PlanLine({ plan }: { plan: PlanUsage }) {
  if (!plan.total) return null;
  const used = (plan.upload ?? 0) + (plan.download ?? 0);
  const expire = plan.expire
    ? new Date(plan.expire * 1000).toLocaleDateString(locale)
    : "—";
  return (
    <p className="text-xs text-muted-foreground">
      {t("airport.planLine", [gb(used), gb(plan.total), expire])}
    </p>
  );
}

function Summary({
  report,
  plan,
}: {
  report: AirportReport;
  plan: PlanUsage | null;
}) {
  const mismatches = report.mismatches.length;
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">
            {msg(`airport.archetype.${report.archetype}`)}
          </h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COST_STYLE[report.costLevel]}`}
            title={t("airport.costLabel")}
          >
            {msg(`airport.cost.${report.costLevel}`)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              mismatches
                ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {mismatches ? (
              <TriangleAlert className="size-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-3.5" aria-hidden="true" />
            )}
            {mismatches
              ? t("airport.mismatchCount", [mismatches])
              : t("airport.noMismatch")}
          </span>
        </div>
        <p className="text-sm leading-relaxed">
          {msg(`airport.archetypeDesc.${report.archetype}`)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("airport.nodesLine", [
            report.nodes,
            report.entryIps,
            report.servers,
          ])}
          {report.unresolved > 0 &&
            ` · ${t("airport.unresolved", [report.unresolved])}`}
        </p>
        {plan && <PlanLine plan={plan} />}
      </CardContent>
    </Card>
  );
}

function KindBar({ report }: { report: AirportReport }) {
  const kinds = KIND_ORDER.filter((kind) => report.kinds[kind] > 0);
  return (
    <ToolCard title={t("airport.kindsTitle")}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={kinds
          .map((kind) => `${msg(`airport.kind.${kind}`)} ${report.kinds[kind]}`)
          .join(", ")}
      >
        {kinds.map((kind) => (
          <span
            key={kind}
            className={KIND_COLOR[kind]}
            style={{ width: `${(report.kinds[kind] / report.nodes) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {KIND_ORDER.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <span
              className={`inline-block size-2.5 rounded-full ${KIND_COLOR[kind]}`}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">
              {msg(`airport.kind.${kind}`)}
            </span>
            <span className="ml-auto font-mono tabular-nums sm:ml-0">
              {report.kinds[kind]}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("airport.kindsNote")}
      </p>
    </ToolCard>
  );
}

function Providers({ report }: { report: AirportReport }) {
  return (
    <ToolCard title={t("airport.providersTitle")}>
      <div className="overflow-hidden rounded-lg border">
        <Table className="text-[13px]" aria-label={t("airport.providersTitle")}>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead scope="col">{t("airport.provider")}</TableHead>
              <TableHead scope="col">{t("airport.kindsTitle")}</TableHead>
              <TableHead scope="col">{t("airport.providerTier")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("airport.providerNodes")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("airport.providerIps")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.providers.map((provider) => (
              <TableRow key={provider.key}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{provider.label}</span>
                  {provider.asn && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      AS{provider.asn}
                    </span>
                  )}
                </TableCell>
                <TableCell>{msg(`airport.kind.${provider.kind}`)}</TableCell>
                <TableCell>
                  {provider.tier ? msg(`airport.tier.${provider.tier}`) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {provider.nodes}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {provider.ips}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ToolCard>
  );
}

function Mismatches({ report }: { report: AirportReport }) {
  const [expanded, setExpanded] = useState(false);
  if (!report.mismatches.length) return null;
  const shown = expanded ? report.mismatches : report.mismatches.slice(0, 8);
  return (
    <ToolCard title={t("airport.mismatchTitle")}>
      <ul className="space-y-1.5 text-sm">
        {shown.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{item.name}</span>
            <span className="text-muted-foreground">
              {msg(`airport.mismatch.${item.claim}`, [
                msg(`airport.kind.${item.kind}`),
                item.provider,
              ])}
            </span>
          </li>
        ))}
      </ul>
      {report.mismatches.length > 8 && (
        <button
          type="button"
          className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t("airport.collapse")
            : t("airport.showAll", [report.mismatches.length])}
        </button>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {t("airport.mismatchNote")}
      </p>
    </ToolCard>
  );
}

function Routes({ report }: { report: AirportReport }) {
  return (
    <ToolCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("airport.routeTitle")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("ip.route.toTargetNote")}
          </span>
        </span>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {t("airport.routeNote")}
      </p>
      {report.routeSamples.length ? (
        <div className="space-y-4">
          {report.routeSamples.map((sample) => (
            <EntryRoute key={sample.ip} ip={sample.ip} label={sample.label} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("airport.routeSkipped")}
        </p>
      )}
    </ToolCard>
  );
}

function Chips({ items }: { items: [string, number][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([name, count]) => (
        <Badge key={name} variant="secondary" className="font-normal">
          {name === "?" ? t("airport.regionUnknown") : name}
          <span className="ml-1 font-mono tabular-nums text-muted-foreground">
            {count}
          </span>
        </Badge>
      ))}
    </div>
  );
}

function Distribution({ report }: { report: AirportReport }) {
  const rows: [string, ReactNode][] = [
    [t("airport.protocols"), <Chips key="p" items={report.protocols} />],
    [t("airport.regions"), <Chips key="r" items={report.regions} />],
  ];
  return (
    <ToolCard title={t("airport.distributionTitle")}>
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="space-y-1.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </ToolCard>
  );
}

export default function AirportPage() {
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { stage, report, plan, audit, fetchAndAudit, reset } =
    useAirportAudit();
  const isUrl = looksLikeSubscriptionUrl(input);
  const busy =
    stage.step === "fetching" ||
    stage.step === "resolving" ||
    stage.step === "lookup";
  const error =
    stage.step === "error"
      ? stage.error instanceof Error && stage.error.message === "empty"
        ? new Error(t("airport.parseEmpty"))
        : stage.error
      : null;
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <PageHeading
        title={t("airport.title")}
        description={t("airport.description")}
        privacy
      />
      <Card>
        <CardContent className="space-y-3">
          <label htmlFor="airport-input" className="text-sm font-medium">
            {t("airport.inputLabel")}
          </label>
          <Textarea
            id="airport-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("airport.inputPlaceholder")}
            className="max-h-60 min-h-28 font-mono text-xs"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
              aria-hidden="true"
            />
            {t("airport.privacyNote")}
          </p>
          {isUrl && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              {t("airport.urlDetected")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {isUrl ? (
              <Button
                disabled={busy}
                onClick={() => {
                  const url = input.trim();
                  setInput("");
                  void fetchAndAudit(url);
                }}
              >
                {t("airport.fetchViaServer")}
              </Button>
            ) : (
              <Button
                disabled={busy || !input.trim()}
                onClick={() => {
                  const content = input;
                  setInput("");
                  void audit(content);
                }}
              >
                {t("airport.run")}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {t("airport.loadFile")}
            </Button>
            {report && (
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  setInput("");
                }}
              >
                {t("airport.reset")}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.yaml,.yml,.json,.conf,text/plain"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void audit(await file.text());
              }}
            />
          </div>
          {busy && (
            <p className="text-sm text-muted-foreground">
              <Pending>
                {stage.step === "fetching"
                  ? t("airport.fetching")
                  : stage.step === "lookup"
                    ? t("airport.stage.lookup", [stage.done, stage.total])
                    : t("airport.stage.resolve")}
              </Pending>
            </p>
          )}
          <ErrorNotice error={error} />
        </CardContent>
      </Card>
      {report && (
        <>
          <Summary report={report} plan={plan} />
          <KindBar report={report} />
          <Mismatches report={report} />
          <Providers report={report} />
          <Routes report={report} />
          <Distribution report={report} />
          <p className="text-xs text-muted-foreground">
            {t("airport.exitNote")}
          </p>
        </>
      )}
    </div>
  );
}
