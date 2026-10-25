import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../.worker-test/index.js";
import {
  abuserLabelScore,
  cidrMatch,
  computeTrust,
  ipQuality,
} from "../public/worker/ip-quality.js";

test("abuser score labels map to penalty points", () => {
  assert.equal(abuserLabelScore("0.001 (Very Low)"), 0);
  assert.equal(abuserLabelScore("0.0015 (Low)"), 0);
  assert.equal(abuserLabelScore("0.0206 (Elevated)"), 15);
  assert.equal(abuserLabelScore("0.1016 (High)"), 40);
  assert.equal(abuserLabelScore("1 (Very High)"), 75);
  assert.equal(abuserLabelScore("garbage"), null);
  assert.equal(abuserLabelScore(undefined), null);
});

test("cidrMatch handles IPv4 prefixes and rejects everything else", () => {
  assert.equal(cidrMatch("1.1.1.1", "1.1.1.0/24"), true);
  assert.equal(cidrMatch("1.1.2.1", "1.1.1.0/24"), false);
  assert.equal(cidrMatch("8.8.8.8", "8.8.8.0/24"), true);
  assert.equal(cidrMatch("1.255.255.255", "1.0.0.0/8"), true);
  assert.equal(cidrMatch("11.0.0.1", "1.0.0.0/8"), false);
  assert.equal(cidrMatch("2606:4700::1", "1.1.1.0/24"), false);
  assert.equal(cidrMatch("1.1.1.1", "2606:4700::/32"), false);
});

test("computeTrust takes the strongest penalty, adds extras and caps at 100", () => {
  const base = { riskSources: 3 };
  assert.deepEqual(computeTrust({ ...base, tor: true }), {
    trust_score: 10,
    risk: 90,
    confidence: "high",
    penalties: [{ score: 90, label: "Tor 出口节点" }],
    extras: [],
  });
  assert.equal(computeTrust({ ...base, hosting: true }).trust_score, 85);
  assert.equal(
    computeTrust({ ...base, companyType: "business" }).trust_score,
    90,
  );
  assert.equal(computeTrust({ ...base }).trust_score, 100);
  assert.equal(
    computeTrust({ ...base, hosting: true, registeredCc: "ca", geoCc: "US" })
      .trust_score,
    80,
  );
  assert.equal(
    computeTrust({ ...base, hosting: true, rpkiStatus: "Invalid" }).trust_score,
    75,
  );
  assert.equal(computeTrust({ ...base, abuseConfidence: 100 }).trust_score, 0);
  assert.equal(
    computeTrust({ ...base, pcRisk: 50, pcConfidence: 50, pcFlagged: true })
      .trust_score,
    75,
  );
  assert.equal(
    computeTrust({ ...base, vpnService: "Example VPN" }).trust_score,
    50,
  );
  assert.equal(
    computeTrust({ riskSources: 0, hosting: true }).trust_score,
    null,
  );
  assert.equal(computeTrust({ riskSources: 0 }).confidence, "low");
  assert.equal(
    computeTrust({ ...base, pcRisk: 33, pcConfidence: 100 }).trust_score,
    100,
  );
  assert.equal(
    computeTrust({ riskSources: 0, typeOnly: true, hosting: true }).trust_score,
    85,
  );
  assert.equal(
    computeTrust({ riskSources: 0, typeOnly: true, hosting: true }).confidence,
    "low",
  );
  assert.equal(computeTrust({ riskSources: 1 }).confidence, "medium");
});

const dnsResponse = (answers) => Response.json({ Status: 0, Answer: answers });
const txt = (record) => ({ type: 16, TTL: 14400, data: `"${record}"` });

function defaultIpapi(ip) {
  return {
    ip,
    is_bogon: false,
    is_datacenter: true,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_crawler: false,
    is_abuser: false,
    is_mobile: false,
    is_anycast: false,
    company: {
      name: "Cluster Logic Inc",
      type: "hosting",
      abuser_score: "0.0015 (Low)",
    },
    asn: {
      asn: 25820,
      descr: "IT7NET - IT7 Networks Inc",
      org: "IT7 Networks Inc",
    },
    datacenter: { datacenter: "IT7 Networks Inc" },
    location: {
      country: "United States",
      country_code: "US",
      region: "California",
      city: "Los Angeles",
      latitude: 34.05,
      longitude: -118.24,
    },
    vpn: {},
  };
}

function defaultProxycheck(ip) {
  return {
    ip,
    network: { asn: "AS25820", type: "Hosting", provider: "IT7 Networks Inc" },
    detections: {
      proxy: false,
      vpn: false,
      compromised: false,
      scraper: false,
      tor: false,
      hosting: true,
      anonymous: false,
      risk: 10,
      confidence: 100,
    },
  };
}

function sourceRouter({
  ip = "95.169.12.201",
  ipapi,
  proxycheck,
  abuse,
  ipwho,
  ptr,
  rpki,
} = {}) {
  return async (url) => {
    url = String(url);
    if (url.startsWith("https://api.ipapi.is/"))
      return ipapi instanceof Response
        ? ipapi
        : Response.json(ipapi ?? defaultIpapi(ip));
    if (url.startsWith("https://proxycheck.io/"))
      return proxycheck instanceof Response
        ? proxycheck
        : Response.json(proxycheck ?? defaultProxycheck(ip));
    if (url.startsWith("https://api.abuseipdb.com/"))
      return abuse instanceof Response
        ? abuse
        : Response.json({
            data: abuse ?? {
              abuseConfidenceScore: 0,
              totalReports: 0,
              numDistinctUsers: 0,
              isTor: false,
              usageType: "Data Center/Web Hosting",
            },
          });
    if (url.startsWith("https://ipwho.is/"))
      return ipwho instanceof Response
        ? ipwho
        : Response.json({
            ip,
            success: true,
            country: "United States",
            country_code: "US",
            region: "California",
            city: "Los Angeles",
            latitude: 34.05,
            longitude: -118.24,
            connection: { isp: "IT7 Networks Inc", asn: 25820 },
          });
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      if (name.endsWith(".origin.asn.cymru.com"))
        return dnsResponse([
          txt("25820 | 95.169.0.0/20 | ca | arin | 2018-01-25"),
        ]);
      if (name.startsWith("AS"))
        return dnsResponse([
          txt("25820 | ca | arin | 2013-01-15 | IT7NET - IT7 Networks Inc, CA"),
        ]);
      return ptr
        ? dnsResponse([{ type: 12, data: ptr }])
        : dnsResponse([{ type: 12, data: "95.169.12.201.16clouds.com." }]);
    }
    if (url.startsWith("https://stat.ripe.net/"))
      return Response.json({ status: "ok", data: { status: rpki ?? "valid" } });
    return Response.json({});
  };
}

const allKeys = {
  IPAPI_IS_KEY: "k",
  PROXYCHECK_KEY: "k",
  ABUSEIPDB_KEY: "k",
};

test("ipQuality aggregates every source into a CoffeeIp-compatible result", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter());
  const data = await ipQuality("95.169.12.201", allKeys);
  assert.equal(data.ip, "95.169.12.201");
  assert.equal(data.sources_ok, 5);
  // risk = max(abuser Low 5, proxycheck 10, hosting 15) = 15, +5 registered/geo mismatch
  assert.equal(data.trust_score, 80);
  assert.equal(data.confidence, "high");
  assert.equal(data.asn, 25820);
  assert.equal(data.asOrganization, "IT7NET - IT7 Networks Inc");
  assert.equal(data.asname, "IT7NET");
  assert.equal(data.rdns, "95.169.12.201.16clouds.com");
  assert.equal(data.is_datacenter, true);
  assert.equal(data.is_vpn, false);
  assert.equal(data.isResidential, false);
  assert.equal(data.company_type, "hosting");
  assert.equal(data.company_name, "Cluster Logic Inc");
  assert.equal(data.abuser_score, "0.0015 (Low)");
  assert.equal(data.datacenter_name, "IT7 Networks Inc");
  assert.equal(data.registered_country_code, "ca");
  assert.equal(data.cidr, "95.169.0.0/20");
  assert.deepEqual(data.range, {
    first: "95.169.0.0",
    last: "95.169.15.255",
    count: 4096,
    prefix: 20,
  });
  assert.equal(data.rpki_status, "valid");
  assert.deepEqual(
    data.geo_sources.map((source) => source.src),
    ["ipapi.is", "ipwho.is"],
  );
  assert.equal(data.source_detail.ipapi_is.state, "ok");
  assert.equal(data.source_detail.proxycheck.state, "ok");
  assert.equal(data.source_detail.abuseipdb.state, "ok");
  assert.equal(data.source_detail.cymru.state, "ok");
  assert.equal(data.source_detail.geo.state, "ok");
  assert.equal(data.source_detail.geo.source, "ipwho.is");
  const labels = data.intelligence.threats.map((threat) => threat.label);
  assert.ok(labels.includes("数据中心 IP"));
  assert.ok(labels.includes("注册国与定位国不一致"));
});

test("ipQuality degrades when a keyed source fails and skips sources without keys", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    sourceRouter({ abuse: new Response("denied", { status: 401 }) }),
  );
  const data = await ipQuality("95.169.12.201", allKeys);
  assert.equal(data.sources_ok, 4);
  assert.equal(data.source_detail.abuseipdb.state, "unavailable");
  assert.equal(data.source_detail.ip_api_fallback.state, "skipped");
  assert.equal(data.trust_score, 80);

  t.mock.method(globalThis, "fetch", sourceRouter());
  const keyless = await ipQuality("95.169.12.201", {});
  assert.equal(keyless.sources_ok, 2);
  assert.equal(keyless.source_detail.ipapi_is.state, "skipped");
  assert.equal(keyless.source_detail.ip_api_fallback.state, "unavailable");
  assert.equal(keyless.trust_score, null);
  assert.equal(keyless.confidence, "low");
  assert.equal(keyless.is_datacenter, undefined);
});

test("ipQuality falls back to ip-api type classification without keys", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url) => {
      url = String(url);
      if (url.startsWith("http://ip-api.com/"))
        return Response.json({
          status: "success",
          query: "95.169.12.201",
          hosting: true,
          mobile: false,
          proxy: true,
        });
      return sourceRouter()(url);
    },
  );
  const data = await ipQuality("95.169.12.201", {});
  assert.equal(data.source_detail.ip_api_fallback.state, "ok");
  assert.equal(data.is_datacenter, true);
  assert.equal(data.is_proxy, undefined);
  assert.equal(data.company_type, "hosting");
  assert.equal(data.confidence, "low");
  // type-only risk 15 + registered/geo mismatch 5
  assert.equal(data.trust_score, 80);
  assert.equal(data.sources_ok, 3);
});

test("ipQuality refuses to score anycast public services", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter({ ip: "1.1.1.1" }));
  const data = await ipQuality("1.1.1.1", {});
  assert.equal(data.is_public_service, true);
  assert.equal(data.trust_score, null);
});

test("ipQuality builds IPv6 reverse names and handles v6 prefixes", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    url = String(url);
    calls.push(url);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      if (name.endsWith(".origin.asn.cymru.com"))
        return dnsResponse([
          txt("13335 | 2606:4700::/32 | US | arin | 2011-08-16"),
        ]);
      if (name.startsWith("AS"))
        return dnsResponse([
          txt(
            "13335 | US | arin | 2010-07-01 | CLOUDFLARENET - Cloudflare, Inc.",
          ),
        ]);
      return dnsResponse([]);
    }
    if (url.startsWith("https://ipwho.is/"))
      return Response.json({
        ip: "2606:4700:4700::1111",
        success: true,
        country: "United States",
        country_code: "US",
        connection: { isp: "CLOUDFLARENET", asn: 13335 },
      });
    return Response.json({});
  });
  const data = await ipQuality("2606:4700:4700::1111", {});
  const origin = calls.find((url) => url.includes(".origin.asn.cymru.com"));
  const name = new URL(origin).searchParams.get("name");
  const labels = name.slice(0, -".origin.asn.cymru.com".length).split(".");
  assert.equal(labels.length, 32);
  assert.equal(
    labels.slice().reverse().join(""),
    "26064700470000000000000000001111",
  );
  assert.ok(
    calls.some((url) => url.includes("type=PTR") && url.includes(".ip6.arpa")),
  );
  assert.equal(data.asn, 13335);
  assert.deepEqual(data.range, { prefix: 32 });
  assert.equal(data.sources_ok, 2);
});

test("route /api/ip/quality serves the aggregated payload", async (t) => {
  t.mock.method(globalThis, "fetch", sourceRouter());
  const response = await worker.fetch(
    new Request("https://example.com/api/ip/quality/95.169.12.201"),
    allKeys,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const data = await response.json();
  assert.equal(data.sources_ok, 5);
  assert.equal(data.trust_score, 80);

  assert.equal(
    (
      await worker.fetch(
        new Request("https://example.com/api/ip/quality/127.0.0.1"),
        allKeys,
      )
    ).status,
    400,
  );
});
