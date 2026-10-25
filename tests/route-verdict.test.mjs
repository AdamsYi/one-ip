import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cachePrefix,
  classifyCarrier,
  classifyMeasurement,
  lookupChinaRoute,
  mergeVerdicts,
} from "../public/worker/route-verdict.js";

test("lookupChinaRoute maps prefixes to backbone ASNs", () => {
  assert.equal(lookupChinaRoute("59.43.1.1"), 4809);
  assert.equal(lookupChinaRoute("202.97.1.1"), 4134);
  assert.equal(lookupChinaRoute("202.97.200.1"), null); // /17 narrows out Unicom half
  assert.equal(lookupChinaRoute("218.105.1.1"), 9929);
  assert.equal(lookupChinaRoute("223.120.130.1"), 58807);
  assert.equal(lookupChinaRoute("223.120.100.1"), 58453);
  assert.equal(lookupChinaRoute("223.119.33.1"), 58453); // CMIN2 exclusion falls through to CMI
  assert.equal(lookupChinaRoute("61.14.200.1"), 10099);
  assert.equal(lookupChinaRoute("61.14.201.1"), null); // only 61.14.200.0/24 belongs to CUG
  assert.equal(lookupChinaRoute("61.140.1.1"), null); // GD Telecom must not hit CUG
  assert.equal(lookupChinaRoute("8.8.8.8"), null);
});

test("cachePrefix groups IPv4 by /24 and IPv6 by /64", () => {
  assert.equal(cachePrefix("95.169.12.201"), "95.169.12.0/24");
  assert.equal(cachePrefix("95.169.12.202"), "95.169.12.0/24");
  assert.equal(cachePrefix("95.169.13.1"), "95.169.13.0/24");
  assert.equal(cachePrefix("2606:4700:4700::1111"), "2606:4700:4700::/64");
  assert.equal(cachePrefix("2606:4700:4701::1111"), "2606:4700:4701::/64");
});

test("classifyCarrier detects CN2 GIA vs GT vs mixed by hop order", () => {
  // GIA: two 4809 hops, no 163 before
  assert.deepEqual(
    classifyCarrier([174, 6939, 4809, 4809, -1, -1], "CT").code,
    "cn2_gia",
  );
  assert.equal(classifyCarrier([174, 6939, 4809, 4809, -1, -1], "CT").reason, "cn2_gia");
  // delivery hop of 163 after 4809 still GIA
  assert.equal(
    classifyCarrier([4809, 4809, 4134], "CT").code,
    "cn2_gia",
  );
  // GT: 163 appears before 4809
  assert.equal(
    classifyCarrier([4134, 4134, 4809, 4809], "CT").code,
    "cn2_gt",
  );
  assert.equal(classifyCarrier([4134, 4134, 4809, 4809], "CT").reason, "cn2_gt");
  // single 4809 hop
  assert.equal(classifyCarrier([174, 4809, -1, -1], "CT").code, "cn2_mixed");
  assert.equal(classifyCarrier([174, 4809, -1, -1], "CT").reason, "cn2_single");
  // CTGNet
  assert.equal(classifyCarrier([174, 23764, 23764], "CT").code, "ctgnet");
  // plain 163
  assert.equal(classifyCarrier([174, 4134, 4134, -1], "CT").code, "163");
  assert.equal(classifyCarrier([174, 4134, 4134, -1], "CT").reason, "c163");
  // only one delivery 163 hop → inconclusive
  assert.equal(
    classifyCarrier([174, 6939, 4134], "CT").code,
    "inconclusive",
  );
});

test("classifyCarrier handles Unicom and Mobile lines", () => {
  assert.equal(classifyCarrier([174, 9929, 9929], "CU").code, "9929");
  assert.equal(
    classifyCarrier([4837, 4837, 9929], "CU").code,
    "9929_mixed",
  );
  assert.equal(classifyCarrier([174, 10099, 10099], "CU").code, "cug");
  assert.equal(classifyCarrier([174, 4837, 4837], "CU").code, "4837");
  assert.equal(classifyCarrier([174, 58807, 58807], "CM").code, "cmin2");
  assert.equal(
    classifyCarrier([58453, 58453, 58807], "CM").code,
    "cmin2_mixed",
  );
  assert.equal(classifyCarrier([174, 58453, 58453], "CM").code, "cmi");
  assert.equal(classifyCarrier([174, 9808, 9808], "CM").code, "cmnet");
});

test("mergeVerdicts drops inconclusive and merges by rank", () => {
  assert.equal(
    mergeVerdicts([
      { code: "inconclusive", rank: 0, confidence: "unverified" },
      { code: "cn2_gia", rank: 5, confidence: "confirmed" },
    ]).code,
    "cn2_gia",
  );
  assert.equal(
    mergeVerdicts([
      { code: "cn2_gia", rank: 5, confidence: "confirmed" },
      { code: "cn2_gia", rank: 5, confidence: "confirmed" },
    ]).code,
    "cn2_gia",
  );
  assert.equal(
    mergeVerdicts([
      { code: "cn2_gia", rank: 5, confidence: "confirmed" },
      { code: "163", rank: 2, confidence: "confirmed" },
    ]).code,
    "dynamic_mixed",
  );
  assert.equal(
    mergeVerdicts([{ code: "unknown", rank: 0, confidence: "unverified" }])
      .code,
    "unknown",
  );
});

const mtrResult = (probes) => ({
  status: "finished",
  target: "95.169.12.201",
  results: probes.map((probe) => ({
    probe: {
      asn: probe.asn,
      network: probe.network,
      location: { city: probe.city },
    },
    result: {
      status: "finished",
      hops: probe.hops.map((asn, index) => ({
        resolvedAddress: asn === -1 ? null : `10.0.0.${index}`,
        asn: Number.isInteger(asn) && asn > 0 ? [asn] : undefined,
        timings: [{ rtt: 10 }],
      })),
    },
  })),
});

test("classifyMeasurement groups probes by carrier and labels hops without ASN", () => {
  const data = classifyMeasurement(
    mtrResult([
      {
        asn: 4134,
        network: "China Telecom",
        city: "Shanghai",
        hops: [174, 6939, 4809, 4809, -1],
      },
      {
        asn: 4837,
        network: "China Unicom",
        city: "Beijing",
        hops: [174, 9929, 9929, -1],
      },
      {
        asn: 56040,
        network: "China Mobile",
        city: "Shenzhen",
        hops: [174, 58453, 58453, -1],
      },
    ]),
  );
  assert.equal(data.carriers.CT.code, "cn2_gia");
  assert.equal(data.carriers.CT.hits["4809"], 2);
  assert.equal(data.carriers.CU.code, "9929");
  assert.equal(data.carriers.CM.code, "cmi");
  assert.equal(data.probes.length, 3);
  assert.equal(data.probes[0].carrier, "CT");
});

test("classifyMeasurement falls back to CIDR lookup for hops missing ASN", () => {
  const data = classifyMeasurement(
    mtrResult([
      {
        asn: 4134,
        network: "China Telecom",
        city: "Chongqing",
        hops: [-1, -1, -1], // resolvedAddress stubs do not match China CIDRs
      },
    ]),
  );
  // hop fallback finds no backbone → inconclusive-ish path with 1-hop 163 also absent
  assert.ok(data.carriers.CT);
  assert.equal(data.probes[0].path_asns.filter((asn) => asn > 0).length, 0);
});
