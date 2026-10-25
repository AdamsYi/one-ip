import assert from "node:assert/strict";
import { test } from "node:test";
import { costProfile, routeRank, verdict } from "../src/lib/verdict.ts";

const dc = (tier) => ({ known: true, brand: "TestDC", cost_tier: tier });
const route = (ranks, status = "finished") => ({
  status,
  carriers: {
    ...(ranks.CT !== undefined ? { CT: { code: "cn2_gia", rank: ranks.CT, confidence: "confirmed" } } : {}),
    ...(ranks.CU !== undefined ? { CU: { code: "9929", rank: ranks.CU, confidence: "confirmed" } } : {}),
    ...(ranks.CM !== undefined ? { CM: { code: "cmin2", rank: ranks.CM, confidence: "confirmed" } } : {}),
  },
});

test("routeRank takes the median carrier rank", () => {
  assert.equal(routeRank(route({ CT: 5, CU: 3, CM: 2 })), 3);
  assert.equal(routeRank(route({ CT: 5, CU: 5, CM: 2 })), 5);
  assert.equal(routeRank(route({ CT: 2, CU: 2, CM: 2 })), 2);
  assert.equal(routeRank(route({})), null);
  assert.equal(routeRank({ status: "pending", carriers: {} }), null);
  assert.equal(routeRank(undefined), null);
});

test("verdict aggregates all three signals into a full score", () => {
  const result = verdict(
    { trust_score: 85 },
    dc("premium"),
    route({ CT: 5, CU: 5, CM: 5 }),
  );
  // 85*0.4 + 100*0.35 + 100*0.25 = 94
  assert.equal(result.score, 94);
  assert.equal(result.tier, "premium");
  assert.equal(result.labelKey, "home.verdict.premium");
  assert.equal(result.lineLabelKey, "home.verdict.linePremium");
  assert.equal(result.pending, false);
  assert.deepEqual(result.chips, [
    "TestDC",
    "home.verdict.chipPremiumRoute",
    "home.verdict.chipCleanIp",
  ]);
});

test("verdict renormalizes while the route is still measuring", () => {
  const pending = verdict(
    { trust_score: 85 },
    dc("premium"),
    route({}, "pending"),
  );
  assert.equal(pending.pending, true);
  assert.equal(pending.labelKey, "home.verdict.measuring");
  // trust 85*0.6 + tier 100*0.4 = 91
  assert.equal(pending.score, 91);
});

test("verdict handles mixed quality routes and cheaper datacenters", () => {
  const result = verdict(
    { trust_score: 60 },
    dc("mid"),
    route({ CT: 3, CU: 3, CM: 2 }),
  );
  assert.equal(result.tier, "high");
  assert.equal(result.labelKey, "home.verdict.highEnd");
  assert.equal(result.lineLabelKey, "home.verdict.lineOptimized");
});

test("verdict grades transit-heavy routes down", () => {
  const result = verdict(
    { trust_score: 80 },
    dc("budget"),
    route({ CT: 2, CU: 2, CM: 2 }),
  );
  // plain carrier routes keep the budget datacenter's tier
  assert.equal(result.tier, "budget");
  assert.equal(result.lineLabelKey, "home.verdict.lineStandard");
  const plain = verdict({ trust_score: 80 }, dc("budget"), route({ CT: 0, CU: 0, CM: 0 }));
  assert.equal(plain.tier, "budget");
});

test("verdict stays honest with missing signals and public services", () => {
  assert.equal(verdict(null, null, null).labelKey, "home.verdict.insufficient");
  assert.equal(verdict(null, null, null).score, null);
  const onlyTrust = verdict({ trust_score: 70 }, null, null);
  assert.equal(onlyTrust.score, 70);
  const pub = verdict({ is_public_service: true, trust_score: 63 }, dc("budget"), route({}));
  assert.equal(pub.tier, "public");
  assert.equal(pub.score, null);
  assert.equal(pub.labelKey, "home.verdict.publicService");
});

test("costProfile maps tiers to stars and monthly price ranges", () => {
  const profile = costProfile(
    { trust_score: 85 },
    dc("premium"),
    route({ CT: 5, CU: 5, CM: 5 }),
  );
  assert.equal(profile.tier, "premium");
  assert.equal(profile.landingStars, 4);
  assert.equal(profile.routeStars, 5);
  assert.equal(profile.ipStars, 5);
  assert.equal(profile.monthlyLowUsd, 25);
  assert.equal(profile.monthlyHighUsd, 60);
  const cheap = costProfile({ trust_score: 40 }, dc("budget"), route({ CT: 2, CU: 2, CM: 2 }));
  assert.equal(cheap.tier, "budget");
  assert.equal(cheap.landingStars, 1);
  assert.equal(cheap.routeStars, 2);
  assert.equal(cheap.ipStars, 2);
  assert.equal(cheap.monthlyLowUsd, 1);
  assert.equal(cheap.monthlyHighUsd, 4);
  const unknown = costProfile(null, { known: false }, null);
  assert.equal(unknown.tier, null);
  assert.equal(unknown.monthlyLowUsd, null);
});
