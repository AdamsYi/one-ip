import { PageHeading } from "@/components/toolkit";
import { AnimatedSegmentedTabs } from "@/components/ui/animated-segmented-tabs";
import { t } from "@/i18n";
import { useAtom } from "jotai";
import { Tabs } from "radix-ui";
import { CloudflareTest } from "./components/cloudflare-test";
import { OpenSpeedTest } from "./components/open-speedtest";
import { speedProviderAtom } from "./store";

const providers = [
  { value: "cloudflare", label: "Cloudflare" },
  { value: "openspeedtest", label: "OpenSpeedTest" },
] as const;

export default function SpeedtestPage() {
  const [provider, setProvider] = useAtom(speedProviderAtom);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading title={t("speedtest.title")} description="" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("speedtest.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("speedtest.description")}
        </p>
      </div>
      <AnimatedSegmentedTabs
        label={t("speedtest.provider")}
        value={provider}
        onValueChange={setProvider}
        options={providers}
        className="flex min-w-0 flex-col gap-4"
      >
        <Tabs.Content value="cloudflare" className="min-w-0 outline-none">
          <CloudflareTest />
        </Tabs.Content>
        <Tabs.Content value="openspeedtest" className="min-w-0 outline-none">
          <OpenSpeedTest />
        </Tabs.Content>
      </AnimatedSegmentedTabs>
    </div>
  );
}
