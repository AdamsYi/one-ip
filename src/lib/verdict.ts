// Pure aggregation: quality + datacenter + route verdict -> one-glance verdict.
// Kept free of React imports so tests can run it directly.

export type CostTier = "budget" | "mid" | "high" | "premium";

export interface VerdictQuality {
  trust_score?: number | null;
  confidence?: "high" | "medium" | "low" | null;
  is_datacenter?: boolean | null;
  is_vpn?: boolean | null;
  is_proxy?: boolean | null;
  is_tor?: boolean | null;
  is_public_service?: boolean | null;
}

export interface VerdictDatacenter {
  known: boolean;
  brand?: string;
  cost_tier?: CostTier | null;
}

export interface VerdictRouteCarrier {
  code: string;
  rank: number;
  confidence: "confirmed" | "mixed" | "unverified";
}

export interface VerdictRoute {
  status: "finished" | "pending" | "degraded";
  carriers?: Partial<Record<"CT" | "CU" | "CM", VerdictRouteCarrier>>;
}

export interface Verdict {
  score: number | null;
  labelKey: string;
  tier: CostTier | "unknown" | "public";
  lineLabelKey: string | null;
  pending: boolean;
  chips: string[];
}

const TIER_SCORE: Record<CostTier, number> = {
  budget: 35,
  mid: 60,
  high: 80,
  premium: 100,
};

const TIER_RANK: Record<CostTier, number> = {
  budget: 1,
  mid: 2,
  high: 3,
  premium: 4,
};

export function routeRank(
  route: VerdictRoute | undefined | null,
): number | null {
  if (!route || route.status !== "finished" || !route.carriers) return null;
  const ranks = (["CT", "CU", "CM"] as const)
    .map((carrier) => route.carriers?.[carrier]?.rank)
    .filter(
      (rank): rank is number =>
        typeof rank === "number" && Number.isFinite(rank) && rank > 0,
    );
  if (!ranks.length) return null;
  // Median carrier rank: one optimized carrier alone should not cap the score.
  ranks.sort((a, b) => a - b);
  const mid = Math.floor((ranks.length - 1) / 2);
  return ranks.length % 2 === 1
    ? ranks[mid]
    : (ranks[mid] + ranks[mid + 1]) / 2;
}

export function verdict(
  quality: VerdictQuality | undefined | null,
  datacenter: VerdictDatacenter | undefined | null,
  route: VerdictRoute | undefined | null,
): Verdict {
  if (quality?.is_public_service === true)
    return {
      score: null,
      labelKey: "home.verdict.publicService",
      tier: "public",
      lineLabelKey: null,
      pending: false,
      chips: [],
    };

  const trust =
    typeof quality?.trust_score === "number" &&
    Number.isFinite(quality.trust_score) &&
    quality.trust_score >= 0 &&
    quality.trust_score <= 100
      ? quality.trust_score
      : null;
  const rank = routeRank(route);
  const tier = datacenter?.known ? (datacenter.cost_tier ?? "mid") : null;

  let score: number | null = null;
  if (trust !== null && rank !== null && tier) {
    score = Math.round(
      trust * 0.4 + (rank / 5) * 100 * 0.35 + TIER_SCORE[tier] * 0.25,
    );
  } else if (trust !== null && tier) {
    score = Math.round(trust * 0.6 + TIER_SCORE[tier] * 0.4);
  } else if (trust !== null) {
    score = trust;
  }

  // Combined tier: route quality dominates, datacenter cost breaks ties.
  let combined: CostTier | "unknown" = "unknown";
  if (rank !== null && rank >= 4.5) combined = "premium";
  else if (rank !== null && rank >= 3)
    combined = tier === "budget" ? "mid" : "high";
  else if (rank !== null && rank >= 2) combined = tier ?? "mid";
  else if (tier) combined = tier;
  if (rank !== null && rank < 2 && tier !== "premium")
    combined = tier ?? "budget";

  const pending = route?.status === "pending";
  const chips: string[] = [];
  if (datacenter?.known && datacenter.brand) chips.push(datacenter.brand);
  if (rank !== null)
    chips.push(
      rank >= 4.5
        ? "home.verdict.chipPremiumRoute"
        : rank >= 3
          ? "home.verdict.chipOptimizedRoute"
          : rank >= 2
            ? "home.verdict.chipStandardRoute"
            : "home.verdict.chipTransitRoute",
    );
  if (trust !== null)
    chips.push(
      trust >= 75
        ? "home.verdict.chipCleanIp"
        : trust >= 45
          ? "home.verdict.chipFairIp"
          : "home.verdict.chipDirtyIp",
    );

  const lineLabelKey =
    rank !== null
      ? rank >= 4.5
        ? "home.verdict.linePremium"
        : rank >= 3
          ? "home.verdict.lineOptimized"
          : rank >= 2
            ? "home.verdict.lineStandard"
            : "home.verdict.lineTransit"
      : null;

  const labelKey = pending
    ? "home.verdict.measuring"
    : rank === null && trust === null
      ? "home.verdict.insufficient"
      : combined === "premium"
        ? "home.verdict.premium"
        : combined === "high"
          ? "home.verdict.highEnd"
          : combined === "mid"
            ? "home.verdict.midRange"
            : combined === "budget"
              ? "home.verdict.budget"
              : "home.verdict.insufficient";

  return {
    score,
    labelKey,
    tier: combined,
    lineLabelKey,
    pending,
    chips,
  };
}

export interface CostProfile {
  tier: CostTier | null;
  landingStars: number;
  routeStars: number;
  ipStars: number;
  monthlyLowUsd: number | null;
  monthlyHighUsd: number | null;
}

const TIER_PRICE: Record<CostTier, [number, number]> = {
  budget: [1, 4],
  mid: [4, 12],
  high: [12, 25],
  premium: [25, 60],
};

export function costProfile(
  quality: VerdictQuality | undefined | null,
  datacenter: VerdictDatacenter | undefined | null,
  route: VerdictRoute | undefined | null,
): CostProfile {
  const tier = datacenter?.known ? (datacenter.cost_tier ?? null) : null;
  const rank = routeRank(route);
  const trust =
    typeof quality?.trust_score === "number" ? quality.trust_score : null;
  const routeStars =
    rank === null ? 0 : Math.max(1, Math.min(5, Math.round((rank / 5) * 5)));
  const ipStars =
    trust === null ? 0 : Math.max(1, Math.min(5, Math.ceil(trust / 20)));
  const landingStars = tier ? TIER_RANK[tier] : 0;
  const [low, high] = tier ? TIER_PRICE[tier] : [0, 0];
  return {
    tier,
    landingStars,
    routeStars,
    ipStars,
    monthlyLowUsd: tier ? low : null,
    monthlyHighUsd: tier ? high : null,
  };
}
