import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beijingTime,
  cachePrefix,
  classifyCarrier,
  classifyMeasurement,
  lookupChinaRoute,
  mergeVerdicts,
  routeVerdict,
} from "../public/worker/route-verdict.js";
import { lookupRoute } from "../src/lib/china-route-rules.ts";

// Hops are {ip, asn}; helpers keep fixtures readable.
const h = (ip, asn = null) => ({ ip, asn });
const access = (asn) => h("10.255.0.1", asn); // provincial access hop
const cn2 = (n = 1) => h(`59.43.${n}.1`);
const c163 = (n = 1) => h(`202.97.${n}.1`, 4134);
const c169 = (n = 1) => h(`219.158.${n}.1`, 4837);
const cuii = (n = 1) => h(`218.105.${n}.1`, 9929);
const dest = (asn) => h("95.169.12.201", asn);

test("lookupRoute maps verified backbone prefixes with longest-prefix match", () => {
  const cases = {
    "59.43.1.1": 4809,
    "202.97.1.1": 4134,
    "202.97.200.1": null, // 202.97.128.0/17 is provincial Unicom
    "218.105.1.1": 9929,
    "210.51.3.1": 9929,
    "219.158.20.1": 4837,
    "219.158.130.1": null, // 219.158.128.0/17 is AS4808 Beijing Unicom
    "69.194.168.1": 23764, // CTGI-HK in whois though unannounced
    "69.194.1.1": null,
    "203.22.180.1": 23764,
    "203.22.1.1": null, // FOXTEL-AU collision
    "61.14.200.1": 10099,
    "61.14.203.1": 10099,
    "61.14.1.1": null,
    "61.140.1.1": null,
    "223.120.130.1": 58807,
    "223.120.100.1": 58453,
    "223.119.33.1": 58453, // not announced by AS58807
    "223.119.26.5": 58807,
    "223.121.200.1": 9808, // CMNET, not CMI
    "221.179.1.1": 9808,
    "8.8.8.8": null,
  };
  for (const [ip, asn] of Object.entries(cases))
    assert.equal(lookupChinaRoute(ip), asn, ip);
  assert.equal(lookupRoute("223.120.130.1").backbone, "cmin2");
});

test("cachePrefix groups IPv4 by /24 and IPv6 by /64", () => {
  assert.equal(cachePrefix("95.169.12.201"), "95.169.12.0/24");
  assert.equal(cachePrefix("95.169.13.1"), "95.169.13.0/24");
  assert.equal(cachePrefix("2606:4700:4700::1111"), "2606:4700:4700::/64");
});

test("Telecom verdicts count backbone hops and allow one user-side hand-over", () => {
  const fwd = (hops) => classifyCarrier(hops, "CT", "forward");
  // Live Nanjing → BandwagonHost path: access 4134 hops, one 202.97 hand-over,
  // then CN2 to the server. That is GIA, not GT.
  const gia = fwd([access(4134), access(4134), c163(5), cn2(1), cn2(2), cn2(3), cn2(4), dest(25820)]);
  assert.deepEqual([gia.code, gia.rank, gia.confidence, gia.reasonValues], ["cn2_gia", 5, "confirmed", [4]]);
  // Access hops alone never count as 163.
  assert.equal(fwd([access(4134), access(4134), cn2(1), cn2(2), dest(25820)]).code, "cn2_gia");
  // Riding 202.97 for two hops before CN2 is GT.
  assert.equal(fwd([c163(1), c163(2), cn2(1), cn2(2), dest(25820)]).code, "cn2_gt");
  // Leaving CN2 for 163 on the server side.
  assert.equal(fwd([cn2(1), cn2(2), c163(1), c163(2), dest(25820)]).code, "cn2_mixed");
  // Return direction: the user side is at the end of the path.
  const ret = (hops) => classifyCarrier(hops, "CT", "return");
  assert.equal(ret([h("1.1.1.1", 174), cn2(1), cn2(2), c163(1), h("219.141.140.10", 4134)]).code, "cn2_gia");
  assert.equal(ret([cn2(1), cn2(2), c163(1), c163(2)]).code, "cn2_gt");
  assert.equal(ret([c163(1), cn2(1), cn2(2)]).code, "cn2_gt"); // server-side 163 hop
  assert.equal(ret([h("1.1.1.1", 174), cn2(1)]).code, "cn2_mixed");
  assert.equal(ret([c163(1), c163(2), dest(16509)]).code, "163");
  assert.equal(ret([h("69.194.163.1", 23764), h("69.194.163.2")]).code, "ctgnet");
  assert.equal(ret([c163(1), c163(2), h("69.194.163.1")]).code, "ctgnet_mixed");
  assert.equal(fwd([access(4134), access(4134), dest(25820)]).code, "unknown");
  assert.equal(ret([h(null, 4809), h(null, 4809)]).code, "cn2_gia");
});

test("Unicom and Mobile verdicts apply hop thresholds and CUG/CUP rules", () => {
  const fwd = (hops, c = "CU") => classifyCarrier(hops, c, "forward");
  const ret = (hops, c = "CU") => classifyCarrier(hops, c, "return");
  // Live Nanning → BandwagonHost: 169 then 9929 to the server. Forward paths
  // from 4837 subscribers always cross 169 first → still 9929.
  assert.equal(fwd([access(4837), c169(1), c169(2), cuii(1), cuii(2), dest(25820)]).code, "9929");
  // 169 again after 9929 on the server side → mixed.
  const mixed = fwd([c169(1), c169(2), cuii(1), cuii(2), c169(3), dest(25820)]);
  assert.deepEqual([mixed.code, mixed.rank], ["9929_mixed", 3]);
  // Return: 9929 then one 169 delivery hop is CUP; more 169 hops are mixed.
  assert.equal(ret([cuii(1), cuii(2), c169(1)]).code, "9929");
  assert.equal(ret([cuii(1), cuii(2), c169(1), c169(2)]).code, "9929_mixed");
  assert.equal(ret([cuii(1), dest(25820)]).code, "9929_single");
  assert.equal(ret([c169(1), h("43.252.84.1", 10099)]).code, "4837");
  const cug = fwd([access(4837), h("43.252.84.1", 10099)]);
  assert.deepEqual([cug.code, cug.rank, cug.confidence], ["cug", 2, "unverified"]);
  assert.equal(fwd([access(4837), access(4837)]).code, "unknown");
  // Mobile: CMIN2 by announced subnet, CMI otherwise.
  assert.equal(fwd([h("221.183.1.1", 9808), h("223.120.130.1"), dest(25820)], "CM").code, "cmin2");
  assert.equal(fwd([h("223.120.130.1"), h("223.120.130.2"), h("223.120.10.1")], "CM").code, "cmin2_mixed");
  // Live Beijing → Vultr LA: CMIN2 transit then 3 CMI hops → the host is CMI.
  assert.equal(
    fwd([h("221.183.1.1"), h("223.120.130.1"), h("223.120.130.2"), h("223.120.10.1"), h("223.120.10.2"), h("223.120.10.3")], "CM").code,
    "cmi",
  );
  assert.equal(fwd([h("223.119.33.1"), h("223.120.10.1")], "CM").code, "cmi");
  assert.equal(fwd([h("221.183.1.1", 9808)], "CM").code, "cmnet");
});

test("mergeVerdicts keeps agreement and reports disagreement as varies", () => {
  const v = (code, rank, confidence = "confirmed") => ({ code, rank, confidence, reason: code });
  assert.equal(mergeVerdicts([v("unknown", 0, "unverified"), v("cn2_gia", 5)]).code, "cn2_gia");
  assert.equal(mergeVerdicts([v("cn2_gia", 5), v("cn2_gia", 5)]).code, "cn2_gia");
  const varies = mergeVerdicts([v("cn2_gia", 5), v("163", 2), v("cn2_gt", 3)]);
  assert.deepEqual([varies.code, varies.rank, varies.reasonValues], ["varies", 2, [3, 2, 5]]);
  assert.equal(mergeVerdicts([v("unknown", 0, "unverified")]).code, "unknown");
});

test("beijingTime flags the evening peak", () => {
  assert.deepEqual(beijingTime(new Date("2026-11-05T13:30:00Z")), { beijing_hour: 21, peak: true });
  assert.deepEqual(beijingTime(new Date("2026-11-05T02:00:00Z")), { beijing_hour: 10, peak: false });
});

const hop = (ip, asn, stats) => ({
  resolvedAddress: ip,
  asn: asn ? [asn] : [],
  ...(stats ? { stats } : {}),
});

const measurement = (results) => ({
  status: "finished",
  target: "95.169.12.201",
  results: results.map(({ probe, hops }) => ({
    probe,
    result: { status: "finished", hops },
  })),
});

test("classifyMeasurement uses eyeball probes, prefix backbones and end-to-end stats", () => {
  const data = classifyMeasurement(
    measurement([
      {
        probe: { asn: 4134, network: "Chinanet Backbone", city: "Nanjing", tags: ["eyeball-network"] },
        hops: [
          hop("10.0.0.1", 4134),
          hop("59.43.1.1", null),
          hop("59.43.2.1", null),
          hop("95.169.12.201", 25820, { avg: 142.3, loss: 0, rcv: 10 }),
        ],
      },
      {
        // IDC probe on Telecom must be ignored.
        probe: { asn: 23724, network: "IDC China Telecommunications", city: "Beijing", tags: ["datacenter-network"] },
        hops: [hop("59.43.9.1"), hop("59.43.9.2"), hop("95.169.12.201", 25820, { avg: 120, loss: 0, rcv: 10 })],
      },
      {
        probe: { asn: 4837, network: "CHINA UNICOM China169 Backbone", city: "Nanning", tags: [] },
        hops: [
          hop("219.158.1.1", 4837),
          hop("219.158.2.1", 4837),
          hop("218.105.1.1", 9929),
          hop("218.105.2.1", 9929),
          hop("95.169.12.201", 25820, { avg: 160.4, loss: 20, rcv: 8 }),
        ],
      },
    ]),
  );
  assert.equal(data.carriers.CT.code, "cn2_gia");
  assert.equal(data.carriers.CT.probes, 1);
  assert.equal(data.carriers.CT.rtt, 142.3);
  assert.equal(data.carriers.CU.code, "9929");
  assert.equal(data.carriers.CU.loss, 20);
  assert.equal(data.probes[2].rtt, 160.4);
  assert.equal(data.probes[1].carrier, null);
  assert.equal(data.probes[0].code, "cn2_gia");
  assert.deepEqual(data.probes[0].hops.map((x) => x.backbone), [null, "cn2", "cn2", null]);
});

test("routeVerdict treats mainland IPs as domestic entries without measuring", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    return Response.json({
      Status: 0,
      Answer: [{ type: 16, data: '"56040 | 120.232.1.0/24 | CN | apnic | 2008-04-14"' }],
    });
  });
  const data = await routeVerdict("120.232.1.1");
  assert.equal(data.domestic, true);
  assert.equal(data.method, "domestic");
  assert.ok(!calls.some((url) => url.includes("globalping")));
});

test("routeVerdict still measures carrier international space registered as CN", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("globalping")) {
      const body = JSON.parse(init.body);
      assert.equal(body.measurementOptions.packets, 10);
      assert.equal(body.locations.length, 3);
      return Response.json({ id: "abcdefgh1234" });
    }
    return Response.json({
      Status: 0,
      Answer: [{ type: 16, data: '"58807 | 223.120.128.0/17 | CN | apnic | 2010-01-01"' }],
    });
  });
  const data = await routeVerdict("223.120.130.9");
  assert.equal(data.status, "pending");
  assert.ok(calls.some((url) => url.includes("globalping")));
});
