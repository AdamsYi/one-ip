import { useLayoutEffect, useRef, useState } from "react";
import { NumberTicker } from "@/components/number-ticker";
import { ActionButton, IpText, Pending } from "@/components/toolkit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { t } from "@/i18n";
import { hideIpAtom } from "@/store/privacy";
import { getMyIp } from "@/views/home/api";
import { useQueries, useQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import { useAtomValue } from "jotai";
import { claudeApi } from "./api";
import { detectSignal, summarizeSignals } from "./score";
import { SIGNALS } from "../../../vendor/claude-environment/signals";

const labels = [
  t("claude.signals.timezone"),
  t("claude.signals.language"),
  t("claude.signals.chineseFonts"),
  t("claude.signals.vendorFonts"),
  t("claude.signals.webrtc"),
  t("claude.signals.browser"),
  t("claude.signals.deviceVendor"),
  t("claude.signals.dateLocale"),
  t("claude.signals.timezoneOffset"),
  t("claude.signals.emoji"),
];

function countryCode(value?: string) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "ZZ"
    ? code
    : undefined;
}

export function EnvironmentScore() {
  const content = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hidden = useAtomValue(hideIpAtom);
  const exit = useQuery({
    queryKey: ["claude-domain-exit", "claude.ai"],
    queryFn: ({ signal }) => claudeApi.exit(signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const traceCountry = exit.isError
    ? undefined
    : countryCode(exit.data?.country_code);
  const geo = useQuery({
    queryKey: ["geo", exit.data?.ip],
    enabled: !!exit.data?.ip && !exit.isError && !traceCountry,
    queryFn: ({ signal }) => claudeApi.geo(exit.data!.ip, signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const reference = useQuery({
    queryKey: ["claude-site-egress"],
    queryFn: ({ signal }) => getMyIp(signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const exitCountry = exit.isError
    ? undefined
    : (traceCountry ??
      (geo.isError ? undefined : countryCode(geo.data?.country_code)));
  const referenceCountry = reference.isError
    ? undefined
    : countryCode(reference.data?.country_code);
  const country = exitCountry ?? referenceCountry;
  const mainlandExit = country === "CN";
  const networkBusy =
    exit.isFetching ||
    (!exit.isError && !traceCountry && !!exit.data?.ip && geo.isFetching) ||
    (!exitCountry && reference.isFetching);
  const egress = exitCountry ? exit.data : reference.data;
  const egressSource = exitCountry
    ? "claude.ai"
    : t("claude.siteEgressReference");
  const egressDetails = networkBusy ? (
    <Pending>{t("claude.checkingEgressCountry")}</Pending>
  ) : country ? (
    <>
      {egressSource} · <IpText ip={egress?.ip} /> · {country}
    </>
  ) : (
    t("claude.egressCountryUnknown")
  );
  const queries = useQueries({
    queries: SIGNALS.map((definition) => ({
      queryKey: ["claude-upstream-signal", definition.id],
      queryFn: () => detectSignal(definition),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });
  const busy = networkBusy || queries.some((query) => query.isFetching);
  const browserResult = summarizeSignals(
    queries.map((query) =>
      query.isFetching || query.isError ? undefined : query.data,
    ),
  );
  const result = {
    ...browserResult,
    complete: browserResult.complete && !!country && !networkBusy,
  };
  const risk = mainlandExit ? "high" : browserResult.band;
  const completed =
    queries.filter((query) => !query.isFetching && !query.isPending).length +
    (networkBusy ? 0 : 1);
  useLayoutEffect(() => {
    if (!content.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.fromTo(
          "[data-scan-enter]",
          { autoAlpha: 0, y: 6 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.035,
            ease: "power2.out",
            clearProps: "opacity,visibility,transform",
          },
        );
      }, content);
      return () => context.revert();
    });
    return () => media.revert();
  }, [busy]);
  const hits = SIGNALS.flatMap((definition, i) =>
    !queries[i].isFetching &&
    !queries[i].isError &&
    (queries[i].data?.score ?? 0) >= 0.25
      ? [
          {
            definition,
            i,
            points:
              Math.round(queries[i].data!.score * definition.weight * 10) / 10,
          },
        ]
      : [],
  );
  const band = {
    low: t("claude.lowRisk"),
    medium: t("claude.mediumRisk"),
    high: t("claude.highRisk"),
  }[risk];
  const color = {
    low: "text-emerald-600",
    medium: "text-amber-600",
    high: "text-destructive",
  }[risk];
  const recommendations = [
    ...(mainlandExit ? [t("claude.mainlandEgressRecommendation")] : []),
    ...(hits.some(
      ({ definition }) =>
        definition.id === "timezone" ||
        definition.id === "timezoneOffset" ||
        definition.id === "language" ||
        definition.id === "intlLocale",
    )
      ? [t("claude.checkWhetherTimezoneBrowserLanguageRegionalFormatsMatch")]
      : []),
    ...(hits.some(({ definition }) => definition.id === "webrtcLeak")
      ? [t("claude.iceAddressCandidatesWereDetectedCheckPublicAddresses")]
      : []),
    ...(hits.some(({ definition }) =>
      ["fonts", "vendorFonts", "cnBrowser", "deviceVendor", "emoji"].includes(
        definition.id,
      ),
    )
      ? [t("claude.fontsDevicesEmojiWeakEnvironmentCluesMatchNormal")]
      : []),
    ...(!result.complete
      ? [t("claude.someChecksDidCompleteReviewLogsCheckNetwork")]
      : []),
    t("claude.useNetworkCardsAboveCheckConnectivityTheseSignals"),
  ];
  function renderLogs() {
    return (
      <div
        role="log"
        aria-label={t("claude.diagnosticLog")}
        aria-live="polite"
        className="max-h-72 overflow-auto font-mono text-xs leading-6"
      >
        {SIGNALS.map((definition, i) => {
          const query = queries[i];
          const pending = query.isFetching || query.isPending;
          const unavailable =
            !pending &&
            (query.isError ||
              /unknown|unavailable/i.test(query.data?.raw ?? "unknown"));
          return (
            <div
              key={definition.id}
              className="flex items-start gap-2 border-b border-border/40 py-1 last:border-0"
            >
              <span className="shrink-0 text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={
                  pending
                    ? "shrink-0 text-muted-foreground"
                    : unavailable
                      ? "shrink-0 text-amber-600"
                      : "shrink-0 text-emerald-600"
                }
              >
                [
                {pending
                  ? t("common.checkingLabel")
                  : unavailable
                    ? t("common.incomplete")
                    : t("common.completeLabel")}
                ]
              </span>
              <div className="min-w-0 flex-1 break-words">
                <span>{labels[i]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {pending
                    ? t("claude.waitingForResults")
                    : query.isError
                      ? t("claude.detectionFailedOrTimedOut")
                      : definition.id === "webrtcLeak" && hidden
                        ? t("claude.ipHidden")
                        : query.data?.raw}
                </span>
              </div>
              {!pending && !unavailable && (
                <span className="shrink-0 tabular-nums">
                  +
                  {Math.round(
                    (query.data?.score ?? 0) * definition.weight * 10,
                  ) / 10}
                </span>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-start gap-2 py-1">
          <span className="shrink-0 text-muted-foreground">
            {String(SIGNALS.length + 1).padStart(2, "0")}
          </span>
          <span
            className={
              networkBusy
                ? "text-muted-foreground"
                : country
                  ? "text-emerald-600"
                  : "text-amber-600"
            }
          >
            [
            {networkBusy
              ? t("common.checkingLabel")
              : country
                ? t("common.completeLabel")
                : t("common.incomplete")}
            ]
          </span>
          <span>
            {t("claude.egressCountry")} · {egressDetails}
          </span>
          {mainlandExit && !networkBusy && (
            <span className="text-destructive">
              {t("claude.mainlandEgressHighRisk")}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("common.claudeChinaUserCheck")}</CardTitle>
          <ActionButton
            size="sm"
            variant="ghost"
            busy={busy}
            onClick={() => {
              queries.forEach((query) => void query.refetch());
              void exit.refetch();
              if (exit.data?.ip && !traceCountry) void geo.refetch();
              void reference.refetch();
            }}
          >
            {busy ? t("common.checking") : t("common.runAgain")}
          </ActionButton>
        </div>
      </CardHeader>
      <CardContent ref={content} className="space-y-3">
        <div
          className="grid gap-5 py-2 md:grid-cols-[220px_minmax(0,1fr)]"
          aria-live="polite"
        >
          <div className="space-y-2 md:border-r md:pr-5">
            <p className="text-xs text-muted-foreground">
              {t("claude.browserSignalScore")}
            </p>
            <div className="flex items-baseline gap-3">
              <div className={`text-4xl font-medium tabular-nums ${color}`}>
                <NumberTicker value={result.total} />
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / 100
                </span>
              </div>
              <span className={`text-sm font-medium ${color}`}>
                {busy
                  ? t("common.checking")
                  : result.complete || mainlandExit
                    ? band
                    : t("claude.incompleteDetection")}
              </span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {busy
                ? t("claude.checkingEnvironmentSignals")
                : mainlandExit
                  ? t("claude.mainlandEgressHighRisk")
                  : result.complete
                    ? t(
                        "claude.environmentSignalScoreNotAnOfficialClaudeAssessment",
                      )
                    : t(
                        "claude.partialScoreIncludesCompletedChecksCompleteRiskBand",
                      )}
            </p>
          </div>
          <div
            data-scan-enter
            className="grid content-center gap-x-8 gap-y-2 sm:grid-cols-2"
          >
            {hits.map(({ definition, i, points }) => (
              <div
                key={definition.id}
                className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 py-2 text-sm"
              >
                <span className="text-muted-foreground">{labels[i]}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  +{points}
                </span>
              </div>
            ))}
            {!busy && !hits.length && (
              <span className="text-sm text-muted-foreground">
                {t("claude.noSignalsMatched")}
              </span>
            )}
            {busy && (
              <p
                className="col-span-full text-xs text-muted-foreground"
                role="status"
              >
                {t("claude.detectionProgress", [completed, SIGNALS.length + 1])}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <span className="text-muted-foreground">
            {t("claude.egressCountry")}
          </span>
          <span>{egressDetails}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <details className="min-w-0 flex-1 text-sm">
            <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
              {t("claude.suggestionsAndMethodology")}
            </summary>
            <div className="mt-3 space-y-3 pr-3 text-xs leading-6 text-muted-foreground">
              {!busy && (
                <ul className="list-disc space-y-1 pl-4">
                  {recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              <p>
                {t("claude.usesProjectSTenDetectorsOriginalWeightsHeuristic")}
              </p>
              <a
                href="https://github.com/LinXiaoTao/FuckClaude"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {t("claude.detectionSourceFuckclaudeMit")}
              </a>
            </div>
          </details>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 self-start text-muted-foreground"
            onClick={() => setOpen(true)}
          >
            {t("claude.viewDetectionLogs")}
          </Button>
        </div>
        <ResponsiveDialog
          open={open}
          onOpenChange={setOpen}
          title={t("claude.diagnosticLog")}
          description={t("claude.resultsAndEnvironmentSignalsFromThisCheck")}
        >
          {renderLogs()}
        </ResponsiveDialog>
      </CardContent>
    </Card>
  );
}
