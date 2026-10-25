import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { ToolCard } from "@/components/toolkit";
import { t, isMessageKey } from "@/i18n";
import {
  classifyParsedTraces,
  parseTraceOutput,
  type ReturnRouteVerdict,
} from "@/lib/parse-trace";
import { HopChain, reasonText } from "./china-route-card";

const RETURN_COMMANDS = [
  { carrier: "CT", cmd: "nexttrace 219.141.140.10" },
  { carrier: "CU", cmd: "nexttrace 202.106.195.68" },
  { carrier: "CM", cmd: "nexttrace 221.179.155.161" },
];

const CARRIER_LABEL = {
  CT: "ip.route.carrierCT",
  CU: "ip.route.carrierCU",
  CM: "ip.route.carrierCM",
} as const;

const CONFIDENCE_DOT: Record<string, string> = {
  confirmed: "bg-emerald-500",
  mixed: "bg-amber-500",
  unverified: "bg-muted-foreground/40",
};

function lineLabel(code: string): string {
  const key = `ip.route.line.${code}`;
  return isMessageKey(key) ? t(key) : code;
}

function confidenceLabel(confidence: string): string {
  const key = `ip.route.confidence.${confidence}`;
  return isMessageKey(key) ? t(key) : confidence;
}

export function ReturnRouteCard() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<
    { ok: true; verdicts: ReturnRouteVerdict[] } | { ok: false } | null
  >(null);
  const combinedCommand = useMemo(
    () => RETURN_COMMANDS.map((entry) => entry.cmd).join(" ; "),
    [],
  );
  const parse = () => {
    const traces = parseTraceOutput(text);
    if (!traces.length) {
      setParsed({ ok: false });
      return;
    }
    setParsed({ ok: true, verdicts: classifyParsedTraces(traces) });
  };
  return (
    <ToolCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("ip.route.return.title")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("ip.route.return.note")}
          </span>
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">
        {t("ip.route.return.help")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {RETURN_COMMANDS.map(({ carrier, cmd }) => (
          <span
            key={carrier}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1"
          >
            <code className="text-xs">{cmd}</code>
            <CopyButton value={cmd} />
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
        <code className="max-w-full truncate text-xs text-muted-foreground">
          {combinedCommand}
        </code>
        <CopyButton value={combinedCommand} />
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={t("ip.route.return.placeholder")}
        className="mt-2 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={parse}
          disabled={!text.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {t("ip.route.return.parse")}
        </button>
        {parsed && !parsed.ok && (
          <span className="text-xs text-destructive">
            {t("ip.route.return.parseError")}
          </span>
        )}
      </div>
      {parsed?.ok && (
        <div className="mt-3 flex flex-col gap-3">
          {parsed.verdicts.map((verdict) => (
            <div key={verdict.carrier} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {t(CARRIER_LABEL[verdict.carrier])}
                  {isMessageKey(verdict.cityKey)
                    ? ` · ${t(verdict.cityKey)}`
                    : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {lineLabel(verdict.code)}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`inline-block size-2 rounded-full ${CONFIDENCE_DOT[verdict.confidence]}`}
                      aria-hidden="true"
                    />
                    {confidenceLabel(verdict.confidence)}
                  </span>
                </span>
              </div>
              {reasonText(verdict) && (
                <p className="text-xs text-muted-foreground">
                  {reasonText(verdict)}
                </p>
              )}
              <HopChain
                hops={verdict.hops.map((hop) => ({ asn: hop.asn, ip: hop.ip }))}
              />
            </div>
          ))}
        </div>
      )}
    </ToolCard>
  );
}
