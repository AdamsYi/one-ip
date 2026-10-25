import { isMessageKey, t, type MessageKey } from "@/i18n";

export type CarrierKey = "CT" | "CU" | "CM";

export interface GradeVerdict {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
  reason?: string;
  reasonValues?: number[];
}

const CARRIERS: { key: CarrierKey; label: MessageKey }[] = [
  { key: "CT", label: "ip.route.carrierCT" },
  { key: "CU", label: "ip.route.carrierCU" },
  { key: "CM", label: "ip.route.carrierCM" },
];

type Grade = "premium" | "optimized" | "standard" | "unknown";

const GRADE_STYLE: Record<Grade, { tile: string; text: string; tag: string }> =
  {
    premium: {
      tile: "border-emerald-500/40 bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      tag: "bg-emerald-500 text-white",
    },
    optimized: {
      tile: "border-amber-500/40 bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      tag: "bg-amber-500 text-white",
    },
    standard: {
      tile: "border-border bg-muted/40",
      text: "text-foreground",
      tag: "bg-muted-foreground/70 text-background",
    },
    unknown: {
      tile: "border-dashed border-border bg-transparent",
      text: "text-muted-foreground",
      tag: "bg-muted text-muted-foreground",
    },
  };

const GRADE_LABEL: Record<Grade, MessageKey> = {
  premium: "ip.route.grade.premium",
  optimized: "ip.route.grade.optimized",
  standard: "ip.route.grade.standard",
  unknown: "ip.route.grade.unknown",
};

const CONFIDENCE_DOT: Record<string, string> = {
  confirmed: "bg-emerald-500",
  mixed: "bg-amber-500",
  unverified: "bg-muted-foreground/40",
};

export function gradeOf(rank: number | undefined): Grade {
  if (rank === undefined || !Number.isFinite(rank) || rank <= 0)
    return "unknown";
  if (rank >= 4) return "premium";
  if (rank >= 3) return "optimized";
  return "standard";
}

export function lineLabel(code: string): string {
  const key = `ip.route.line.${code}`;
  return isMessageKey(key) ? t(key) : code;
}

export function confidenceLabel(confidence: string): string {
  const key = `ip.route.confidence.${confidence}`;
  return isMessageKey(key) ? t(key) : confidence;
}

export function reasonText(verdict: {
  reason?: string;
  reasonValues?: number[];
}): string | null {
  if (!verdict.reason) return null;
  const key = `ip.route.reason.${verdict.reason}`;
  if (!isMessageKey(key)) return null;
  return t(key, (verdict.reasonValues ?? []).map(String));
}

export function RouteGradeTiles({
  carriers,
  pending = false,
  showReason = true,
}: {
  carriers?: Partial<Record<CarrierKey, GradeVerdict>>;
  pending?: boolean;
  showReason?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {CARRIERS.map(({ key, label }) => {
        const verdict = carriers?.[key];
        const grade = pending ? "unknown" : gradeOf(verdict?.rank);
        const style = GRADE_STYLE[grade];
        const reason = verdict && showReason ? reasonText(verdict) : null;
        return (
          <div
            key={key}
            className={`flex min-w-0 flex-col gap-1.5 rounded-xl border p-3 ${style.tile}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t(label)}
              </span>
              {!pending && verdict && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.tag}`}
                >
                  {t(GRADE_LABEL[grade])}
                </span>
              )}
            </div>
            {pending ? (
              <span className="animate-pulse text-lg font-semibold text-muted-foreground">
                {t("ip.route.measuringShort")}
              </span>
            ) : verdict ? (
              <span
                className={`text-xl leading-tight font-semibold ${style.text}`}
              >
                {lineLabel(verdict.code)}
              </span>
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">
                —
              </span>
            )}
            {!pending && verdict && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`inline-block size-2 rounded-full ${CONFIDENCE_DOT[verdict.confidence]}`}
                  aria-hidden="true"
                />
                {confidenceLabel(verdict.confidence)}
              </span>
            )}
            {reason && (
              <span className="text-xs leading-snug text-muted-foreground">
                {reason}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
