import { useState } from "react";
import { AnimatedValue } from "@/components/animated-value";
import { CountryFlag } from "@/components/country-flag";
import { DataTable } from "@/components/data-table";
import { LookupFaq } from "@/components/lookup-faq";
import {
  ActionButton,
  ErrorNotice,
  IpText,
  Pending,
} from "@/components/toolkit";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";
import type { RtcResult } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { runWebRtc } from "./api";

const columns: ColumnDef<RtcResult>[] = [
  { id: "number", header: "#", cell: ({ row }) => row.index + 1 },
  {
    accessorKey: "ip",
    header: t("webrtc.ipAddress"),
    cell: ({ row }) => <IpText ip={row.original.ip} />,
  },
  { accessorKey: "type", header: t("webrtc.type") },
  {
    id: "geo",
    header: t("common.location"),
    cell: ({ row }) =>
      row.original.geo ? (
        <>
          <CountryFlag code={row.original.geo.country_code} />{" "}
          {row.original.geo.country ?? ""} {row.original.geo.city ?? ""}
        </>
      ) : (
        t("common.unknown")
      ),
  },
  {
    id: "state",
    header: t("common.status"),
    cell: ({ row }) =>
      row.original.public
        ? t("webrtc.reviewEgress")
        : t("webrtc.localAddresses"),
  },
];
export default function WebRtcPage() {
  const [round, setRound] = useState(0);
  const query = useQuery({
    queryKey: ["webrtc-diagnostic", round],
    queryFn: ({ signal }) => runWebRtc(undefined, signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <Card className="mb-3">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">
              {t("webrtc.webrtcEgressCheck")}
            </CardTitle>
            <ActionButton
              size="sm"
              busy={query.isFetching}
              onClick={() => setRound((n) => n + 1)}
            >
              {query.isFetching
                ? t("common.checkingDots")
                : t("common.runAgain")}
            </ActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div role="status">
            <AnimatedValue value={query.data?.verdict ?? query.isFetching}>
              {query.isFetching ? (
                <Pending>{t("webrtc.collectingIceCandidates")}</Pending>
              ) : (
                (query.data?.verdict ?? t("webrtc.checkIncomplete"))
              )}
            </AnimatedValue>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {t("webrtc.httpBaselineEgress")}
            </span>
            {query.data?.baseline ? (
              <IpText ip={query.data.baseline.ip} />
            ) : query.isFetching ? (
              <Pending>{t("common.loading")}</Pending>
            ) : (
              t("common.unknown")
            )}
            <Badge variant="secondary">
              {query.data?.results.length ?? 0}
              {t("webrtc.addresses")}
            </Badge>
          </div>
        </CardContent>
      </Card>
      <ErrorNotice error={query.error} />
      {Boolean(query.data?.results.length) && (
        <Card>
          <CardContent>
            <DataTable
              data={query.data?.results ?? []}
              columns={columns}
              getRowId={(row) => row.ip}
              animateChanges={false}
              animateEntries
            />
          </CardContent>
        </Card>
      )}
      <LookupFaq
        items={[
          {
            title: t("webrtc.whatIsAWebrtcLeak"),
            text: t("webrtc.webrtcUsesIceStunDiscoverAddressesPeerPeer"),
          },
          {
            title: t("webrtc.whatAreStunAndUdp"),
            text: t(
              "webrtc.udpConnectionlessTransportProtocolStunServerReturnsPublic",
            ),
          },
          {
            title: t("webrtc.howITellIfThereLeak"),
            text: t(
              "webrtc.differentEgressIndicatesDifferentUdpHttpRoutesWhich",
            ),
          },
          {
            title: t("webrtc.howDoIFixALeak"),
            text: t("webrtc.checkUdpForwardingTunTrafficHandlingIpv6Rules"),
          },
          {
            title: t("webrtc.whyDoProxyTunModesGiveDifferentResults"),
            text: t(
              "webrtc.systemProxyVirtualNetworkAdapterModesHandleDifferent",
            ),
          },
        ]}
      />
    </>
  );
}
