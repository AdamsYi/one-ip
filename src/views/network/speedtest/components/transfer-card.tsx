import { NumberTicker } from "@/components/number-ticker";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { t } from "@/i18n";
import { ArrowDown, ArrowUp } from "lucide-react";
import { TRANSFER_SECONDS, type Transfer } from "../api";

export const decimal = (value: number) => value.toFixed(1);
export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function SpeedCurve({
  points,
  label,
}: {
  points: Transfer["points"];
  label: string;
}) {
  const ceiling = Math.max(10, ...points.map((point) => point.mbps)) * 1.15;
  const coordinates = points.map((point) => [
    Math.min(600, (point.seconds / TRANSFER_SECONDS) * 600),
    100 - Math.min(100, (point.mbps / ceiling) * 100),
  ]);
  const line = coordinates
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`,
    )
    .join(" ");
  const area = coordinates.length
    ? `${line} L${coordinates[coordinates.length - 1][0].toFixed(1)},100 L${coordinates[0][0].toFixed(1)},100 Z`
    : "";
  return (
    <div className="mt-4 flex flex-col gap-1">
      <div
        className="flex justify-between text-xs tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        <span>{Math.ceil(ceiling)} Mbps</span>
        <span>{t("speedtest.averageCurve")}</span>
      </div>
      <svg
        viewBox="0 0 600 104"
        preserveAspectRatio="none"
        className="h-24 w-full text-primary sm:h-28"
        role="img"
        aria-label={label}
      >
        {[0, 50, 100].map((y) => (
          <line
            key={y}
            x1="0"
            x2="600"
            y1={y}
            y2={y}
            className="stroke-border"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {area && <path d={area} fill="currentColor" opacity="0.08" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div
        className="flex justify-between text-xs tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        <span>0 s</span>
        <span>{TRANSFER_SECONDS} s</span>
      </div>
    </div>
  );
}

export function TransferCard({
  direction,
  value,
  active,
  partial,
}: {
  direction: "download" | "upload";
  value: Transfer;
  active: boolean;
  partial: boolean;
}) {
  const isDownload = direction === "download";
  const title = isDownload ? t("speedtest.download") : t("speedtest.upload");
  const Icon = isDownload ? ArrowDown : ArrowUp;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardAction>
          {active ? (
            <Badge variant="secondary">{t("speedtest.measuring")}</Badge>
          ) : value.complete ? (
            <Badge variant="outline">{t("speedtest.complete")}</Badge>
          ) : partial && value.bytes > 0 ? (
            <Badge variant="outline">{t("speedtest.partial")}</Badge>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-12 items-baseline gap-2 tabular-nums">
          <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {value.mbps == null ? (
              "—"
            ) : (
              <NumberTicker
                value={value.mbps}
                formatValue={decimal}
                duration={0.2}
              />
            )}
          </span>
          <span className="text-sm text-muted-foreground">Mbps</span>
        </div>
        <SpeedCurve
          points={value.points}
          label={t("speedtest.curveLabel", [title])}
        />
      </CardContent>
      <CardFooter>
        <dl className="grid w-full grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">
              {t("speedtest.loadedLatency")}
            </dt>
            <dd className="text-sm font-medium tabular-nums">
              {value.loadedLatency == null ? "—" : decimal(value.loadedLatency)}{" "}
              <span className="font-normal text-muted-foreground">ms</span>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">
              {isDownload ? t("speedtest.downloaded") : t("speedtest.uploaded")}
            </dt>
            <dd className="text-sm font-medium tabular-nums">
              {formatBytes(value.bytes)}
            </dd>
          </div>
        </dl>
      </CardFooter>
    </Card>
  );
}
