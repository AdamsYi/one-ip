import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupIp } from "../src/views/ip/api.ts";
import { adaptCoffee } from "../src/views/ip/coffee.ts";

test("adaptCoffee preserves score and residential flag, null coordinates are skipped", () => {
  const result = adaptCoffee({
    ip: "124.127.77.179",
    trust_score: 97,
    isResidential: true,
    is_mobile: false,
    isp: "China Telecom",
    geo_sources: [
      { src: "g1", lat: null, lon: null },
      { src: "g2", lat: 39.911, lon: 116.395 },
    ],
  });
  assert.equal(result.coffee.trust_score, 97);
  assert.equal(result.coffee.isResidential, true);
  assert.equal(result.geo.latitude, 39.911);
  assert.equal(result.geo.isp, "China Telecom");
  assert.equal(result.risk.source, "OneGlance");
});
test("lookupIp queries the aggregated quality endpoint without cookies and rejects mismatches", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ ip: "8.8.8.8" });
  };
  try {
    await assert.rejects(lookupIp("1.1.1.1"));
    assert.equal(calls[0].url, "/api/ip/quality/1.1.1.1");
    assert.equal(calls[0].options.credentials, "omit");
  } finally {
    globalThis.fetch = original;
  }
});
test("lookupIp adapts a matching aggregated response", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      ip: "1.1.1.1",
      trust_score: 75,
      country: "Australia",
      countryCode: "AU",
      geo_sources: [
        {
          src: "ipwho.is",
          country: "Australia",
          country_code: "AU",
          lat: -33.87,
          lon: 151.21,
        },
      ],
    });
  try {
    const result = await lookupIp("1.1.1.1");
    assert.equal(result.coffee.trust_score, 75);
    assert.equal(result.geo.country, "Australia");
    assert.equal(result.geo.latitude, -33.87);
    assert.equal(result.sources[0].source, "OneGlance / ipwho.is");
  } finally {
    globalThis.fetch = original;
  }
});
