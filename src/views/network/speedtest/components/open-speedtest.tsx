import { useEffect } from "react";
import { ErrorNotice, Pending } from "@/components/toolkit";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { t } from "@/i18n";
import { useAtom } from "jotai";
import { Play, Square } from "lucide-react";
import { openSpeedtestPanelAtom } from "../store";

export function OpenSpeedTest() {
  const [panel, setPanel] = useAtom(openSpeedtestPanelAtom);
  const open = panel === "loading" || panel === "loaded";

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) setPanel("closed");
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      setPanel("closed");
    };
  }, [setPanel]);

  useEffect(() => {
    if (panel !== "loading") return;
    const timer = setTimeout(() => setPanel("error"), 20_000);
    return () => clearTimeout(timer);
  }, [panel, setPanel]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenSpeedTest</CardTitle>
        <CardDescription>
          {t("speedtest.openSpeedtestDescription")}
        </CardDescription>
        {open && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanel("closed")}
            >
              <Square data-icon="inline-start" />
              {t("speedtest.stop")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {open ? (
          <div className="relative">
            {panel === "loading" && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-card"
                role="status"
              >
                <Pending>{t("speedtest.loadingPanel")}</Pending>
              </div>
            )}
            <iframe
              title={t("speedtest.openSpeedtestPanel")}
              src="https://openspeedtest.com/speedtest"
              className="aspect-video min-h-96 w-full border-0"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              onLoad={() =>
                setPanel((current) =>
                  current === "loading" ? "loaded" : current,
                )
              }
              onError={() => setPanel("error")}
            />
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4">
            {panel === "error" && (
              <ErrorNotice error={t("speedtest.panelFailed")} />
            )}
            <Button onClick={() => setPanel("loading")}>
              <Play data-icon="inline-start" />
              {t("speedtest.loadPanel")}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              {t("speedtest.openSpeedtestNotice")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
