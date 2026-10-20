import { Fragment, memo, useState } from "react";
import { LatencyBadge } from "@/components/latency-badge";
import { SiteLogo } from "@/components/site-logo";
import { Pending, ToolCard } from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { t } from "@/i18n";
import {
  Star,
  Info,
  BrainCircuit,
  ShoppingBag,
  MessagesSquare,
  Bitcoin,
  Play,
  Gamepad2,
  Briefcase,
  Code2,
  Cloud,
  Search,
  House,
  Mail,
} from "lucide-react";
import {
  accessRating,
  averageAccessRating,
  evidenceState,
  qualityRating,
  type Evidence,
  type EvidenceState,
} from "./scenario-evidence";
import {
  scenarioGroups,
  type ScenarioGroup,
  type ScenarioTarget,
} from "./scenario-targets";
import type { useIpLatency } from "./use-ip-latency";
import { useScenarioAccess } from "./use-scenario-access";
import { useScenarioEvidence } from "./use-scenario-evidence";

const stateLabels: Record<EvidenceState, string> = {
  unmeasured: t("common.notChecked"),
  running: t("common.checking"),
  complete: t("ip.scenarios.evidenceCollected"),
  partial: t("ip.scenarios.incompleteEvidence"),
  failed: t("ip.scenarios.requestRefused"),
  "rate-limited": t("ip.scenarios.rateLimited"),
  unverifiable: t("ip.scenarios.unverifiable"),
  mismatch: t("ip.scenarios.egressMismatch"),
  expired: t("ip.scenarios.expired"),
  cancelled: t("common.cancelled"),
};
const stateTone = (state: EvidenceState) =>
  ["unmeasured", "cancelled", "unverifiable"].includes(state)
    ? "secondary"
    : state === "complete"
      ? "success"
      : state === "failed"
        ? "danger"
        : ["partial", "mismatch", "expired", "rate-limited"].includes(state)
          ? "warning"
          : "info";
const metricLabels: Record<string, string> = {
  latency: t("ip.scenarios.unloadedLatency"),
  jitter: t("ip.scenarios.jitter"),
  download: t("ip.scenarios.download"),
  upload: t("ip.scenarios.upload"),
  downLoadedLatency: t("ip.scenarios.downloadLoadedLatency"),
  upLoadedLatency: t("ip.scenarios.uploadLoadedLatency"),
  packetLoss: t("ip.scenarios.udpPacketLoss"),
  latencySamples: t("ip.scenarios.insufficientLatencySamples"),
  packetSamples: t("ip.scenarios.insufficientUdpSamples"),
  loadedSamples: t("ip.scenarios.insufficientLoadedSamples"),
  downloadSamples: t("ip.scenarios.insufficientDownloadSamples"),
  uploadSamples: t("ip.scenarios.insufficientUploadSamples"),
  aimScore: t("ip.scenarios.aimScoreUnavailable"),
};
export function ScenarioStars({
  stars,
  showValue = true,
}: {
  stars: number;
  showValue?: boolean;
}) {
  return (
    <span
      className="ip-scenario-stars"
      data-rating={Math.floor(stars)}
      aria-label={t("ip.scenarios.rating5", [stars])}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className="ip-scenario-star" aria-hidden="true">
          <Star size={12} />
          <span
            className="ip-scenario-star-fill"
            style={{
              width: `${Math.min(1, Math.max(0, stars - index)) * 100}%`,
            }}
          >
            <Star size={12} className="is-filled" />
          </span>
        </span>
      ))}
      {showValue && <span>{stars}/5</span>}
    </span>
  );
}
function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const readable = evidence.samples.filter(
    (sample) => sample.outcome === "readable",
  ).length;
  const opaque = evidence.samples.filter(
    (sample) => sample.outcome === "opaque",
  ).length;
  const elapsed = evidence.samples
    .filter(
      (sample) => sample.outcome === "readable" || sample.outcome === "opaque",
    )
    .map((sample) => sample.elapsedMs)
    .sort((a, b) => a - b);
  const median = elapsed.length
    ? Math.round(
        (elapsed[Math.floor((elapsed.length - 1) / 2)] +
          elapsed[Math.floor(elapsed.length / 2)]) /
          2,
      )
    : null;
  return (
    <div className="ip-measurement-detail">
      <p>
        {t("ip.scenarios.measurementSource")}：{evidence.source} ·{" "}
        {evidence.protocol} ·{" "}
        {evidence.addressFamily === "unknown"
          ? t("ip.scenarios.addressFamilyUnverified")
          : evidence.addressFamily}
      </p>
      <p>
        {evidence.direction === "probe-inbound"
          ? t("ip.scenarios.remoteProbesQueriedIp")
          : t("ip.scenarios.currentBrowserTargetService")}
        ：<span className="break-all">{evidence.target}</span>
      </p>
      {evidence.direction === "browser-outbound" && (
        <p>
          {t("ip.scenarios.observedEgress")}：
          {evidence.egressBefore ?? t("common.unknown")} →{" "}
          {evidence.egressAfter ?? t("common.unknown")}
        </p>
      )}
      <p>
        {t("ip.scenarios.measuredAt")}：
        {new Date(evidence.checkedAt).toLocaleTimeString()} ·{" "}
        {t("ip.scenarios.validFor5Minutes")}
      </p>
      {!!evidence.samples.length && (
        <>
          <p>
            {t("ip.scenarios.samplesReadableOpaqueResponses", [
              evidence.samples.length,
              readable,
              opaque,
            ])}
            {median !== null &&
              ` · ${t("ip.scenarios.medianHttpDuration")} ${median} ms`}
          </p>
          <p>
            {t("ip.scenarios.httpStatus")}：
            {[
              ...new Set(
                evidence.samples.map((sample) => sample.status).filter(Boolean),
              ),
            ].join(" / ") || t("ip.scenarios.unreadable")}
          </p>
        </>
      )}
      {evidence.metrics && (
        <dl className="ip-measurement-metrics">
          {Object.entries(metricLabels)
            .filter(([key]) => key in evidence.metrics!)
            .map(([key, label]) => {
              const value =
                evidence.metrics![key as keyof typeof evidence.metrics];
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {typeof value !== "number" || !Number.isFinite(value)
                      ? t("common.unknown")
                      : key === "packetLoss"
                        ? `${(value * 100).toFixed(1)}%`
                        : key === "download" || key === "upload"
                          ? `${(value / 1e6).toFixed(1)} Mbps`
                          : `${Math.round(value)} ms`}
                  </dd>
                </div>
              );
            })}
        </dl>
      )}
      <details>
        <summary>{t("ip.scenarios.viewRawSamples")}</summary>
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[10px]">
          {JSON.stringify(evidence.raw ?? evidence.samples, null, 2)}
        </pre>
      </details>
    </div>
  );
}
function AccessRows({
  targets,
  records,
  ip,
  now,
}: {
  targets: ScenarioTarget[];
  records: Record<string, Evidence>;
  ip: string;
  now: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="data-table connectivity-table ip-platform-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.website")}</TableHead>
            <TableHead>{t("common.testHistory")}</TableHead>
            <TableHead>{t("common.latency")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {targets.map((target, index) => {
            const evidence = records[target.url];
            const rating = accessRating(evidence, ip, now);
            const running = !evidence || evidence.state === "running";
            const status = rating.stale
              ? t("ip.scenarios.expired")
              : evidence?.state === "cancelled"
                ? t("common.cancelled")
                : evidence?.state === "rate-limited"
                  ? t("ip.scenarios.rateLimited")
                  : evidence?.state === "failed"
                    ? t("ip.scenarios.requestRefused")
                    : rating.responses
                      ? rating.fluctuating
                        ? t("ip.scenarios.inconsistentResponses")
                        : t("ip.scenarios.responseReceived")
                      : running
                        ? t("common.checking")
                        : evidence?.samples.some(
                              (sample) => sample.error === "network",
                            )
                          ? t("ip.scenarios.probeBlocked")
                          : t("ip.scenarios.probeTimedOut");
            const open = expanded === target.url;
            const toggle = () => setExpanded(open ? null : target.url);
            return (
              <Fragment key={target.url}>
                <TableRow
                  data-alt={index % 2}
                  className="ip-platform-row"
                  onClick={toggle}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="site-cell ip-platform-name"
                      aria-expanded={open}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                      }}
                    >
                      <SiteLogo
                        src={target.icon}
                        website={target.website ?? target.url}
                      />
                      <span>{target.name}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div
                      className="ping-dots"
                      aria-label={t("ip.scenarios.responses", [
                        rating.responses,
                        rating.total,
                      ])}
                    >
                      {Array.from({ length: 8 }, (_, sampleIndex) => {
                        const sample = evidence?.samples[sampleIndex];
                        const good =
                          sample &&
                          ["readable", "opaque"].includes(sample.outcome);
                        return (
                          <span
                            key={sampleIndex}
                            className={`ping-dot ${!sample ? "" : !good ? "dot-fail" : sample.elapsedMs < 100 ? "dot-good" : sample.elapsedMs < 400 ? "dot-warn" : "dot-slow"}`}
                            title={
                              !sample
                                ? t("ip.scenarios.notSampled")
                                : good
                                  ? `${sample.elapsedMs} ms · ${sample.status ? `HTTP ${sample.status}` : t("ip.scenarios.opaqueResponse")}`
                                  : sample.status
                                    ? `HTTP ${sample.status}`
                                    : t("ip.scenarios.probeBlocked")
                            }
                          />
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rating.median !== null &&
                    !rating.stale &&
                    !["failed", "rate-limited", "cancelled"].includes(
                      evidence?.state ?? "",
                    ) ? (
                      <LatencyBadge
                        result={{
                          median: rating.median,
                          samples: evidence!.samples.map((sample) =>
                            ["opaque", "readable"].includes(sample.outcome)
                              ? sample.elapsedMs
                              : -1,
                          ),
                        }}
                        running={running}
                      />
                    ) : (
                      <Badge variant={running ? "secondary" : "warning"}>
                        {running ? <Pending>{status}</Pending> : status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
                {open && (
                  <TableRow className="ip-platform-evidence">
                    <TableCell colSpan={3}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          {rating.scope === "ip"
                            ? t("ip.scenarios.verifiedIpEgress")
                            : rating.scope === "different"
                              ? t("ip.scenarios.differentEgress")
                              : t("ip.scenarios.currentNetwork")}
                        </span>
                        <span>{status}</span>
                        {rating.stars !== null && (
                          <ScenarioStars stars={rating.stars} />
                        )}
                      </div>
                      {rating.scope === "different" && (
                        <p>
                          {t(
                            "ip.scenarios.egressDiffersQueriedIpStarsDescribeAccessCurrent",
                          )}
                        </p>
                      )}
                      {evidence && <EvidenceDetails evidence={evidence} />}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const scenarioIcons = {
  ai: BrainCircuit,
  commerce: ShoppingBag,
  social: MessagesSquare,
  crypto: Bitcoin,
  streaming: Play,
  gaming: Gamepad2,
  remote: Briefcase,
  api: Code2,
  hosting: Cloud,
  search: Search,
  domestic: House,
  communication: Mail,
};

const platformCount = new Set(
  scenarioGroups.flatMap((group) => group.targets.map((target) => target.url)),
).size;

// Only visible rating/coverage changes rerender a row; raw sample updates stay in the dialog.
const ScenarioSummaryRow = memo(function ScenarioSummaryRow({
  group,
  average,
  rated,
  dots,
  busy,
  onSelect,
}: {
  group: ScenarioGroup;
  average: number | null;
  rated: number;
  dots: string;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = scenarioIcons[group.id as keyof typeof scenarioIcons];
  const states = dots.split(",");
  const partial = average !== null && rated < group.targets.length;
  return (
    <TableRow
      className="ip-scenario-table-row"
      onClick={() => onSelect(group.id)}
    >
      <TableCell>
        <button
          type="button"
          className="site-cell ip-platform-name"
          aria-haspopup="dialog"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(group.id);
          }}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span>{group.label}</span>
        </button>
      </TableCell>
      <TableCell>
        <div className="ip-scenario-progress">
          <div
            className="ping-dots"
            aria-label={t("ip.scenarios.rated", [rated, group.targets.length])}
          >
            {group.targets.map((target, index) => (
              <span
                key={target.url}
                className={`ping-dot ${states[index] === "_" ? "" : states[index] === "!" ? "dot-fail" : "dot-good"}`}
                title={`${target.name} · ${states[index] === "_" ? t("common.checking") : states[index] === "!" ? t("ip.scenarios.insufficientEvidence") : `${states[index]}/5`}`}
              />
            ))}
          </div>
          <span className="ip-scenario-count text-[10px] text-muted-foreground">
            {rated}/{group.targets.length}
          </span>
          <span
            className="ip-scenario-partial"
            data-visible={partial}
            title={partial ? t("ip.scenarios.partialResults") : undefined}
            aria-label={partial ? t("ip.scenarios.partialResults") : undefined}
            aria-hidden={!partial}
          >
            <Info size={11} aria-hidden="true" />
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="ip-scenario-rating">
          {average !== null ? (
            <ScenarioStars stars={average} />
          ) : (
            <Badge variant="secondary">
              {busy ? (
                <Pending>{t("common.checking")}</Pending>
              ) : (
                t("ip.scenarios.insufficientEvidence")
              )}
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export function ScenarioPanel({
  ip,
  inbound,
}: {
  ip: string;
  inbound: ReturnType<typeof useIpLatency>;
}) {
  const { records, busy, now, run, cancel } = useScenarioEvidence(ip);
  const access = useScenarioAccess(ip);
  const [selected, setSelected] = useState<string | null>(null);
  const group = scenarioGroups.find((item) => item.id === selected);
  const summary = (targets: ScenarioTarget[]) =>
    averageAccessRating(
      targets.map((target) => access.records[target.url]),
      ip,
      now,
    );
  const average = group ? summary(group.targets) : null;
  const key = group?.inbound ? "https" : "quality";
  const evidence = records[key];
  const quality = group?.quality
    ? qualityRating(evidence, ip, group.quality, now)
    : null;
  const state = quality?.state ?? evidenceState(evidence, ip, now);
  const hasTurn = Boolean(
    import.meta.env.VITE_SPEEDTEST_TURN_URI &&
    import.meta.env.VITE_SPEEDTEST_TURN_CREDENTIALS_URL,
  );
  const manual = (
    <>
      <div className="my-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(busy) || inbound.busy || access.busy}
          onClick={() => void run(key)}
        >
          {group?.inbound
            ? t("ip.scenarios.testInboundHttps")
            : t("ip.scenarios.startQualityTest")}
        </Button>
        {busy === key && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            {t("ip.scenarios.cancel")}
          </Button>
        )}
        <Badge variant={stateTone(state)}>
          {state === "running" ? (
            <Pending>{stateLabels[state]}</Pending>
          ) : (
            stateLabels[state]
          )}
        </Badge>
      </div>
      {state === "mismatch" && (
        <p>
          {t("ip.scenarios.observedEgressDiffersQueriedIpResultCannotRate")}
        </p>
      )}
      {state === "unverifiable" && (
        <p>
          {t(
            "ip.scenarios.responseEgressCannotVerifiedDoesEstablishIpUnavailability",
          )}
        </p>
      )}
      {state === "expired" && (
        <p>{t("ip.scenarios.oldResultReferenceRunNewTest")}</p>
      )}
      {!!quality?.missing.length && (
        <p>
          {t("ip.scenarios.missingValidEvidence")}：
          {quality.missing.map((name) => metricLabels[name] ?? name).join("、")}
        </p>
      )}
      {evidence && <EvidenceDetails evidence={evidence} />}
      {quality?.stars != null && (
        <>
          <ScenarioStars stars={quality.stars} />
          <p>{t("ip.scenarios.fiveAimClassesMap15StarsBrowser")}</p>
        </>
      )}
    </>
  );
  return (
    <ToolCard title={t("ip.scenarios.applicationAccessRatings")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="ip-scenario-intro !mb-0">
          {t(
            "ip.scenarios.automaticallyTestsScenariosAcrossPlatformsSelectScenarioDetails",
            [scenarioGroups.length, platformCount],
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={access.busy ? access.cancel : access.start}
        >
          {access.busy ? (
            <Pending>{t("common.stopTesting")}</Pending>
          ) : (
            t("common.testAgain")
          )}
        </Button>
      </div>
      <div className="data-table connectivity-table ip-scenario-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ip.scenarios.scenario")}</TableHead>
              <TableHead>{t("ip.scenarios.coverage")}</TableHead>
              <TableHead>{t("ip.scenarios.averageRating")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarioGroups.map((item) => {
              const result = summary(item.targets);
              const dots = item.targets
                .map((target) => {
                  const record = access.records[target.url];
                  const rating = accessRating(record, ip, now);
                  return rating.stars !== null
                    ? String(rating.stars)
                    : !record || record.state === "running"
                      ? "_"
                      : "!";
                })
                .join(",");
              return (
                <ScenarioSummaryRow
                  key={item.id}
                  group={item}
                  average={result.average}
                  rated={result.rated}
                  dots={dots}
                  busy={access.busy}
                  onSelect={setSelected}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ResponsiveDialog
        open={!!group}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={group?.label ?? t("ip.scenarios.applicationAccessRatings")}
        description={t(
          "ip.scenarios.accessRatingsCurrentNetworkSelectPlatformInspectSamples",
        )}
      >
        {group && average && (
          <div className="ip-scenario-dialog space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("ip.scenarios.averageAccessRating")}</span>
              {average.average !== null ? (
                <ScenarioStars stars={average.average} />
              ) : (
                <Badge variant="secondary">
                  {t("ip.scenarios.insufficientEvidence")}
                </Badge>
              )}
              <p className="w-full text-muted-foreground">
                {t(
                  "ip.scenarios.ratedAtLeastValidPlatformRatingsRequiredUnrated",
                  [average.rated, average.total, average.required],
                )}
              </p>
              {average.rated < average.total && (
                <Badge variant="warning">
                  {access.busy ? (
                    <Pending>{t("common.checking")}</Pending>
                  ) : (
                    t("ip.scenarios.partialResults")
                  )}
                </Badge>
              )}
            </div>
            <AccessRows
              key={group.id}
              targets={group.targets}
              records={access.records}
              ip={ip}
              now={now}
            />
            {group.quality && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("ip.scenarios.fullNetworkQualityTest")}
                </summary>
                <p>
                  {t(
                    "ip.scenarios.websiteAccessRatingsDoMeasureGameplayCallsPlayback",
                  )}
                </p>
                <p>
                  {t(
                    "ip.scenarios.measuresBrowserCloudflareConfiguredTurnServiceRoutesEvery",
                  )}
                </p>
                <p>{t("ip.scenarios.upAbout70Mb2MinutesThreePerformance")}</p>
                {!hasTurn && (
                  <p>
                    {t(
                      "ip.scenarios.turnLossTestingConfiguredBandwidthLatencyMeasuredBut",
                    )}
                  </p>
                )}
                {manual}
              </details>
            )}
            {group.inbound && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("ip.scenarios.inboundTestsForTheQueriedIp")}
                </summary>
                <p>
                  {t(
                    "ip.scenarios.ratingAboveDescribesAccessCloudWebsitesHostingCapability",
                  )}
                </p>
                <p>
                  {t("ip.scenarios.remoteProbesCheckIpHttps443BrowserEgress")}
                </p>
                <div className="my-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={inbound.busy || Boolean(busy) || access.busy}
                    onClick={() => void inbound.start()}
                  >
                    {t("ip.scenarios.testInboundIcmp")}
                  </Button>
                  {inbound.busy && (
                    <Button size="sm" variant="ghost" onClick={inbound.cancel}>
                      {t("ip.scenarios.cancel")}
                    </Button>
                  )}
                </div>
                {inbound.data && (
                  <p>
                    {t(
                      "ip.scenarios.icmpReturnedProbesReplyDoesEstablishHttpsFailure",
                      [inbound.data.results.length],
                    )}
                  </p>
                )}
                {inbound.error && (
                  <p className="text-destructive">{inbound.error}</p>
                )}
                {manual}
              </details>
            )}
            <p className="text-muted-foreground">
              {t(
                "ip.scenarios.testsPublicEndpointsOpaqueResponsesHideHttpStatus",
              )}
            </p>
          </div>
        )}
      </ResponsiveDialog>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          {t("ip.scenarios.ratingRulesAndTestScope")}
        </summary>
        <p className="mt-2">
          {t("ip.scenarios.eachPlatformNeeds3ValidResponsesScenarioNeeds")}
        </p>
        <p>{t("ip.scenarios.medianHttpResponseTimes1503006001000")}</p>
        <p>{t("ip.scenarios.initialSamplesComeFirstFollowedUp8Samples")}</p>
        <p>
          {t("ip.scenarios.testsPublicEndpointsOpaqueResponsesHideHttpStatus")}
        </p>
      </details>
    </ToolCard>
  );
}
