import { useEffect } from "react";
import { PageHeading, ToolCard } from "@/components/toolkit";
import { t, type MessageKey } from "@/i18n";

// Public scoring and verdict methodology. Every number shown elsewhere on the
// site is derived by the rules described here.
const SECTIONS: [MessageKey, MessageKey[]][] = [
  [
    "methodology.neutralTitle",
    ["methodology.neutral1", "methodology.neutral2"],
  ],
  [
    "methodology.purityTitle",
    [
      "methodology.purity1",
      "methodology.purity2",
      "methodology.purity3",
      "methodology.purity4",
    ],
  ],
  [
    "methodology.routeTitle",
    [
      "methodology.route1",
      "methodology.route2",
      "methodology.route3",
      "methodology.route4",
      "methodology.route5",
      "methodology.route6",
    ],
  ],
  [
    "methodology.directionTitle",
    [
      "methodology.direction1",
      "methodology.direction2",
      "methodology.direction3",
    ],
  ],
  [
    "methodology.splitTitle",
    ["methodology.split1", "methodology.split2", "methodology.split3"],
  ],
  [
    "methodology.airportTitle",
    ["methodology.airport1", "methodology.airport2", "methodology.airport3"],
  ],
  ["methodology.costTitle", ["methodology.cost1", "methodology.cost2"]],
  [
    "methodology.limitsTitle",
    ["methodology.limits1", "methodology.limits2", "methodology.limits3"],
  ],
];

export default function MethodologyPage() {
  useEffect(() => {
    document.title = t("methodology.title");
  }, []);
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <PageHeading
        title={t("methodology.title")}
        description={t("methodology.description")}
      />
      {SECTIONS.map(([title, items]) => (
        <ToolCard key={title} title={t(title)}>
          <ul className="list-disc space-y-1.5 pl-5">
            {items.map((item) => (
              <li key={item}>{t(item)}</li>
            ))}
          </ul>
        </ToolCard>
      ))}
    </div>
  );
}
