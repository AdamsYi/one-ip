import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageHeading, ToolCard } from "@/components/toolkit";
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
import { t, type MessageKey } from "@/i18n";
import { maskedIp, trace } from "@/lib/network";
import {
  AUDIT_SERVICES,
  auditServices,
  parseRuleConfig,
  type RuleConfig,
  type ServiceVerdict,
} from "@/lib/split-rules";
import { hideIpAtom } from "@/store/privacy";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ShieldCheck } from "lucide-react";

// Server-side helper: prints the config with every credential field removed,
// so users can paste it without exposing keys.
const EXPORT_COMMAND = `python3 - <<'PY'
import json,glob,re
keys=re.compile(r"(uuid|password|private_key|public_key|short_id|secret|psk|token|key_path|certificate|key)$",re.I)
def clean(v):
    if isinstance(v,dict): return {k:("***" if keys.search(k) else clean(x)) for k,x in v.items()}
    if isinstance(v,list): return [clean(x) for x in v]
    return v
for f in sorted(glob.glob("/etc/sing-box*/config.json")):
    print("//",f); print(json.dumps(clean(json.load(open(f))),ensure_ascii=False))
PY`;

const STATUS_STYLE: Record<ServiceVerdict["status"], string> = {
  match: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  mismatch: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  inferred: "bg-muted text-foreground",
  unknown: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<ServiceVerdict["status"], MessageKey> = {
  match: "rules.status.match",
  mismatch: "rules.status.mismatch",
  inferred: "rules.status.inferred",
  unknown: "rules.status.unknown",
};

const echoDomains = [
  ...new Set(AUDIT_SERVICES.flatMap((service) => service.echo ?? [])),
];

/**
 * The export command prints "// /etc/sing-box-x/config.json" headers with
 * one JSON document per line; split them so users can pick a file.
 */
function splitDocuments(text: string): { name: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  if (!lines.some((line) => /^\s*\/\/\s*\S/.test(line)))
    return [{ name: "config", body: text }];
  const docs: { name: string; body: string }[] = [];
  for (const line of lines) {
    const header = /^\s*\/\/\s*(\S.*)$/.exec(line);
    if (header) docs.push({ name: header[1].trim(), body: "" });
    else if (docs.length) docs[docs.length - 1].body += `${line}\n`;
  }
  return docs.filter((doc) => doc.body.trim());
}

function Results({
  config,
  inbound,
}: {
  config: RuleConfig;
  inbound: string | undefined;
}) {
  const hidden = useAtomValue(hideIpAtom);
  const echoes = useQueries({
    queries: echoDomains.map((domain) => ({
      queryKey: ["rules-echo", domain],
      queryFn: ({ signal }: { signal: AbortSignal }) => trace(domain, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const observed = Object.fromEntries(
    echoDomains.map((domain, index) => [
      domain,
      echoes[index].data?.ip ?? null,
    ]),
  );
  const pending = echoes.some((query) => query.isPending);
  const { verdicts, exits } = auditServices(config, inbound, observed);
  const groups = new Map<string, ServiceVerdict[]>();
  for (const item of verdicts)
    groups.set(item.match.outbound, [
      ...(groups.get(item.match.outbound) ?? []),
      item,
    ]);
  const mismatches = verdicts.filter((item) => item.status === "mismatch");
  return (
    <>
      <ToolCard title={t("rules.summaryTitle")}>
        <div className="flex flex-col gap-2">
          {[...groups.entries()].map(([outbound, items]) => (
            <div
              key={outbound}
              className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-medium">{outbound}</code>
                {exits[outbound] ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {t("rules.exitIp")} {maskedIp(exits[outbound], hidden)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {pending ? t("common.checking") : t("rules.exitUnknown")}
                  </span>
                )}
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {items.length}
                </span>
              </div>
              <p className="text-xs leading-relaxed">
                {items.map((item) => item.service.name).join(" · ")}
              </p>
            </div>
          ))}
        </div>
        {mismatches.length > 0 && (
          <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
            {t("rules.mismatchWarning", [
              mismatches.map((item) => item.service.name).join("、"),
            ])}
          </p>
        )}
      </ToolCard>
      <ToolCard title={t("rules.detailTitle")}>
        <div className="overflow-hidden rounded-lg border">
          <Table className="text-[13px]" aria-label={t("rules.detailTitle")}>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead scope="col">{t("rules.service")}</TableHead>
                <TableHead scope="col">{t("rules.outbound")}</TableHead>
                <TableHead scope="col">{t("rules.matchedRule")}</TableHead>
                <TableHead scope="col">{t("rules.observed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verdicts.map((item) => (
                <TableRow key={item.service.name}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{item.service.name}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {item.service.domain}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code>{item.match.outbound}</code>
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">
                    {item.match.rule
                      ? `#${item.match.rule.index} ${item.match.rule.text}`
                      : t("rules.finalRule")}
                    {item.match.uncertain.length > 0 && (
                      <span className="block text-amber-700 dark:text-amber-400">
                        {t("rules.uncertain", [
                          item.match.uncertain
                            .map((rule) => `#${rule.index} ${rule.text}`)
                            .join("; "),
                        ])}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[item.status]}`}
                    >
                      {t(STATUS_LABEL[item.status])}
                    </span>
                    {item.observed && (
                      <code className="ml-1.5 text-xs text-muted-foreground">
                        {maskedIp(item.observed, hidden)}
                      </code>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("rules.observedNote")}
        </p>
      </ToolCard>
    </>
  );
}

export default function RulesPage() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [inbound, setInbound] = useState<string>("");
  const [docIndex, setDocIndex] = useState(0);
  const docs = useMemo(() => splitDocuments(submitted), [submitted]);
  const doc = docs[Math.min(docIndex, docs.length - 1)];
  const config = useMemo(
    () => (doc?.body.trim() ? parseRuleConfig(doc.body) : null),
    [doc],
  );
  const inbounds = config?.inbounds ?? [];
  const activeInbound =
    inbound && inbounds.some((item) => item.tag === inbound)
      ? inbound
      : undefined;
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <PageHeading
        title={t("rules.title")}
        description={t("rules.description")}
        privacy
      />
      <Card>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("rules.howTo")}</p>
          <div className="flex items-start gap-2 rounded-lg border border-border p-2">
            <code className="max-h-20 flex-1 overflow-auto whitespace-pre text-[11px] text-muted-foreground">
              {EXPORT_COMMAND}
            </code>
            <CopyButton value={EXPORT_COMMAND} />
          </div>
          <label htmlFor="rules-input" className="text-sm font-medium">
            {t("rules.inputLabel")}
          </label>
          <Textarea
            id="rules-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("rules.inputPlaceholder")}
            className="max-h-60 min-h-28 font-mono text-xs"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
              aria-hidden="true"
            />
            {t("rules.privacyNote")}
          </p>
          <Button
            disabled={!input.trim()}
            onClick={() => {
              setSubmitted(input);
              setInput("");
              setInbound("");
              setDocIndex(0);
            }}
          >
            {t("rules.run")}
          </Button>
          {docs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="rules-doc" className="text-xs font-medium">
                {t("rules.fileLabel")}
              </label>
              <select
                id="rules-doc"
                value={docIndex}
                onChange={(event) => {
                  setDocIndex(Number(event.target.value));
                  setInbound("");
                }}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                {docs.map((item, index) => (
                  <option key={item.name} value={index}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {config && config.format === "unknown" && (
            <p className="text-sm text-destructive">{t("rules.parseFailed")}</p>
          )}
          {config && inbounds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="rules-inbound" className="text-xs font-medium">
                {t("rules.inboundLabel")}
              </label>
              <select
                id="rules-inbound"
                value={activeInbound ?? ""}
                onChange={(event) => setInbound(event.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">{t("rules.inboundAny")}</option>
                {inbounds.map((item) => (
                  <option key={item.tag} value={item.tag}>
                    {item.tag}
                    {item.port ? ` :${item.port}` : ""} ({item.type})
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {t("rules.inboundHint")}
              </span>
            </div>
          )}
          {config && config.format !== "unknown" && (
            <p className="text-xs text-muted-foreground">
              {t("rules.parsedLine", [
                config.format,
                config.rules.length,
                config.outbounds.length,
                config.final,
              ])}
              {config.warnings.length > 0 &&
                ` · ${t("rules.warnings", [config.warnings.length])}`}
            </p>
          )}
        </CardContent>
      </Card>
      {config && config.format !== "unknown" && (
        <Results config={config} inbound={activeInbound} />
      )}
    </div>
  );
}
