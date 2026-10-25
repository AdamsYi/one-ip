import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../.worker-test/index.js";

const dnsResponse = (answers) => Response.json({ Status: 0, Answer: answers });
const txt = (record) => ({ type: 16, TTL: 14400, data: `"${record}"` });

const request = (query = "", headers = {}) =>
  new Request(`https://example.com/api/ip/health${query}`, { headers });

function sourceRouter(opts = {}) {
  const ipv6 = opts.ipv6 === true;
  const pcRisk = () =>
    typeof opts.pcRisk === "function" ? opts.pcRisk() : (opts.pcRisk ?? 10);
  const ip = ipv6 ? "2606:4700:4700::1111" : "95.169.12.201";
  return async (url) => {
    url = String(url);
    if (url.startsWith("https://api.ipapi.is/"))
      return Response.json({
        ip,
        is_bogon: false,
        is_datacenter: true,
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_crawler: false,
        is_abuser: false,
        is_mobile: false,
        company: {
          name: "Cluster Logic Inc",
          type: "hosting",
          abuser_score: "0.0015 (Low)",
        },
        asn: { asn: 25820, descr: "IT7NET - IT7 Networks Inc" },
        location: {
          country: "United States",
          country_code: "US",
          region: "California",
          city: "Los Angeles",
        },
      });
    if (url.startsWith("https://proxycheck.io/v3/"))
      return Response.json({
        ip,
        network: {
          asn: "AS25820",
          type: "Residential",
          provider: "IT7 Networks Inc",
        },
        detections: {
          proxy: false,
          vpn: false,
          compromised: false,
          scraper: false,
          tor: false,
          hosting: false,
          risk: pcRisk(),
          confidence: 100,
        },
      });
    if (url.startsWith("https://api.abuseipdb.com/"))
      return Response.json({
        data: {
          abuseConfidenceScore: 0,
          totalReports: 0,
          numDistinctUsers: 0,
          isTor: false,
          usageType: "Data Center/Web Hosting",
        },
      });
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      if (name.endsWith(".origin.asn.cymru.com"))
        return dnsResponse([
          txt(
            ipv6
              ? "13335 | 2606:4700::/32 | US | arin | 2011-08-16"
              : "25820 | 95.169.0.0/20 | US | arin | 2018-01-25",
          ),
        ]);
      if (name.startsWith("AS"))
        return dnsResponse([
          txt(
            ipv6
              ? "13335 | US | arin | 2010-07-01 | CLOUDFLARENET - Cloudflare, Inc."
              : "25820 | US | arin | 2013-01-15 | IT7NET - IT7 Networks Inc, US",
          ),
        ]);
      return dnsResponse([]);
    }
    if (url.startsWith("https://ipwho.is/"))
      return Response.json({
        ip,
        success: true,
        country: "United States",
        country_code: "US",
        region: "California",
        city: "Los Angeles",
        connection: {
          isp: ipv6 ? "Example\u001b[31m\nInjected" : "IT7 Networks Inc",
          asn: ipv6 ? 13335 : 25820,
        },
      });
    return Response.json({});
  };
}

const allKeys = {
  IPAPI_IS_KEY: "k",
  PROXYCHECK_KEY: "k",
  ABUSEIPDB_KEY: "k",
};

test("health API aggregates sources, keeps flags and returns uncached JSON", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter());
  const response = await worker.fetch(request("?ip=95.169.12.201"), allKeys);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const data = await response.json();
  assert.equal(data.ip, "95.169.12.201");
  // risk = max(abuser Low 5, proxycheck 10, hosting 15) = 15
  assert.equal(data.score, 85);
  assert.equal(data.status, "good");
  assert.equal(data.country, "United States");
  assert.equal(data.asn, 25820);
  assert.equal(data.flags.vpn, false);
  assert.equal(data.flags.tor, false);
  assert.equal(data.flags.datacenter, true);
  assert.equal(data.source, undefined);
});

test("health score boundaries match the UI thresholds", async (t) => {
  let pcRisk;
  t.mock.method(globalThis, "fetch", sourceRouter({ pcRisk: () => pcRisk }));
  for (const [risk, score, status] of [
    [25, 75, "good"],
    [26, 74, "moderate"],
    [55, 45, "moderate"],
    [56, 44, "poor"],
    [100, 0, "poor"],
  ]) {
    pcRisk = risk;
    const response = await worker.fetch(request("?ip=95.169.12.201"), {
      PROXYCHECK_KEY: "k",
    });
    const data = await response.json();
    assert.equal(data.score, score);
    assert.equal(data.status, status);
  }
});

test("health reports unknown when no risk source is configured", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter());
  const response = await worker.fetch(request("?ip=95.169.12.201"), {});
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.score, null);
  assert.equal(data.status, "unknown");
});

test("health text handles IPv6 and strips terminal control characters", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter({ ipv6: true }));
  const response = await worker.fetch(
    request("?ip=2606:4700:4700::1111&format=text"),
    {},
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/plain/);
  const body = await response.text();
  assert.match(body, /ip: 2606:4700:4700::1111/);
  assert.match(body, /score: unknown\nstatus: unknown/);
  assert.ok(!body.includes("\u001b"));
  assert.ok(!body.includes("\nInjected"));
});

test("health rejects invalid targets, local caller detection and rate limits before fetching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  for (const query of [
    "?ip=",
    "?ip=127.0.0.1",
    "?ip=https://example.com",
    "?ip=1.1.1.1&format=html",
  ])
    assert.equal((await worker.fetch(request(query), {})).status, 400);
  assert.equal((await worker.fetch(request(), {})).status, 503);
  assert.equal(
    (
      await worker.fetch(request("", { "CF-Connecting-IP": "1.1.1.1" }), {
        LOCAL_DEV: "true",
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await worker.fetch(request("?ip=1.1.1.1"), {
        API_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
});

test("health returns 502 with a stable message when every source fails", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private upstream body", { status: 500 }),
  );
  const result = await worker.fetch(request("?ip=1.1.1.1"), {});
  assert.equal(result.status, 502);
  const body = await result.text();
  assert.ok(body.includes("IP 数据源暂不可用"));
  assert.ok(!body.includes("private upstream body"));
});
