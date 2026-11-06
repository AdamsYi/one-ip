import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nodeClaims,
  nodeMultiplier,
  nodeRegion,
  parseSubscription,
  parseUriLine,
} from "../src/lib/subscription.ts";
import {
  archetypeOf,
  auditAirport,
  costLevelOf,
  claimConflict,
  entryKind,
  providerLabel,
} from "../src/lib/airport-audit.ts";

const SECRET = "f2d8ad57-c730-469e-9db4-366005365fc1";
const b64 = (value) => Buffer.from(value, "utf8").toString("base64");

const uriList = [
  `hysteria2://${SECRET}@hk1.example.net:18445?insecure=0&sni=hk1.example.net#${encodeURIComponent("剩余流量：24.89 GB")}`,
  `hysteria2://${SECRET}@203.0.113.7:18445?sni=a.example#${encodeURIComponent("[Hong Kong] 香港 IPLC 01 x1.5")}`,
  `vless://${SECRET}@104.16.1.2:443?type=ws&security=tls&host=x.example#${encodeURIComponent("[Japan] 日本中转1")}`,
  `trojan://${SECRET}@[2001:4860::1]:443?sni=t.example#${encodeURIComponent("🇺🇸 美国 原生 2倍")}`,
  `vmess://${b64(JSON.stringify({ ps: "新加坡 直连", add: "198.51.100.9", port: "8080", id: SECRET, net: "ws", tls: "tls" }))}`,
  `ss://${b64(`aes-256-gcm:${SECRET}@192.0.2.44:8388`)}#${encodeURIComponent("台湾 01")}`,
  `ss://${b64(`chacha20-ietf-poly1305:${SECRET}`)}@192.0.2.45:8389#${encodeURIComponent("[Nepal] 尼泊尔稳定")}`,
  "unsupported://whatever",
].join("\n");

test("URI subscriptions decode base64, split info nodes and drop credentials", () => {
  const sub = parseSubscription(b64(uriList));
  assert.equal(sub.format, "uri");
  assert.deepEqual(sub.info, ["剩余流量：24.89 GB"]);
  assert.equal(sub.skipped, 1);
  assert.equal(sub.nodes.length, 6);
  assert.ok(!JSON.stringify(sub).includes(SECRET), "credentials must not survive parsing");
  const [hy2, vless, trojan, vmess, ss, ssSip002] = sub.nodes;
  assert.deepEqual(
    [hy2.protocol, hy2.server, hy2.port, hy2.tls, hy2.region, hy2.multiplier],
    ["hysteria2", "203.0.113.7", 18445, true, "HK", 1.5],
  );
  assert.deepEqual(hy2.claims, ["iplc"]);
  assert.deepEqual([vless.transport, vless.tls, vless.claims], ["ws", true, ["relay"]]);
  assert.equal(trojan.server, "2001:4860::1");
  assert.deepEqual(trojan.claims, ["residential"]);
  assert.equal(trojan.multiplier, 2);
  assert.deepEqual([vmess.server, vmess.port, vmess.claims, vmess.region], ["198.51.100.9", 8080, ["direct"], "SG"]);
  assert.deepEqual([ss.protocol, ss.server, ss.port, ss.region], ["ss", "192.0.2.44", 8388, "TW"]);
  assert.deepEqual([ssSip002.server, ssSip002.region], ["192.0.2.45", "Nepal"]);
});

test("Clash YAML and sing-box JSON subscriptions produce the same node shape", () => {
  const clash = parseSubscription(`mixed-port: 7890
proxies:
  - { name: "官网：example.com", type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: ${SECRET} }
  - { name: "[Korea] 韩国 专线", type: trojan, server: relay.example.cn, port: 443, password: ${SECRET} }
  - name: 美国 01
    type: vless
    server: 198.51.100.20
    port: 443
    uuid: ${SECRET}
    network: grpc
    tls: true
proxy-groups:
  - { name: auto, type: url-test, proxies: [美国 01] }
`);
  assert.equal(clash.format, "clash");
  assert.deepEqual(clash.info, ["官网：example.com"]);
  assert.deepEqual(
    clash.nodes.map((node) => [node.protocol, node.server, node.port, node.transport, node.tls, node.region]),
    [
      ["trojan", "relay.example.cn", 443, null, true, "KR"],
      ["vless", "198.51.100.20", 443, "grpc", true, "US"],
    ],
  );
  assert.deepEqual(clash.nodes[0].claims, ["iplc"]);
  assert.ok(!JSON.stringify(clash).includes(SECRET));

  const singBox = parseSubscription(
    JSON.stringify({
      outbounds: [
        { type: "selector", tag: "proxy", outbounds: ["hk"] },
        { type: "hysteria2", tag: "hk 香港", server: "203.0.113.9", server_port: 443, password: SECRET, tls: { enabled: true } },
        { type: "vless", tag: "jp", server: "jp.example.net", server_port: 8443, uuid: SECRET, transport: { type: "ws" } },
        { type: "direct", tag: "direct" },
      ],
    }),
  );
  assert.equal(singBox.format, "sing-box");
  assert.deepEqual(
    singBox.nodes.map((node) => [node.protocol, node.server, node.port, node.transport, node.tls]),
    [
      ["hysteria2", "203.0.113.9", 443, null, true],
      ["vless", "jp.example.net", 8443, "ws", false],
    ],
  );
  assert.ok(!JSON.stringify(singBox).includes(SECRET));
});

test("node name helpers read claims, regions and multipliers without false hits", () => {
  assert.deepEqual(nodeClaims("香港 IEPL 专线 01"), ["iplc"]);
  assert.deepEqual(nodeClaims("日本 原生 解锁 Netflix"), ["residential", "unlock"]);
  assert.deepEqual(nodeClaims("Japan Tokyo 01"), []);
  assert.equal(nodeRegion("🇸🇬 Singapore 03"), "SG");
  assert.equal(nodeRegion("[United States] 中转9洛杉矶1"), "US");
  assert.equal(nodeRegion("Node 7"), null);
  assert.equal(nodeMultiplier("香港 01 | 倍率:0.5"), 0.5);
  assert.equal(nodeMultiplier("HK x3"), 3);
  assert.equal(nodeMultiplier("美国 1.5x"), 1.5);
  assert.equal(nodeMultiplier("香港 01"), null);
  assert.equal(nodeMultiplier("Xbox 优化"), null);
  assert.equal(parseUriLine("vmess://not-base64!"), null);
  assert.deepEqual(parseSubscription(""), { format: "unknown", nodes: [], info: [], skipped: 0 });
});

test("entry kinds separate domestic relays, premium lines, CDN proxies and overseas hosts", () => {
  assert.equal(entryKind({ ip: "120.232.1.1", asn: 56040, cc: "CN" }), "domestic");
  assert.equal(entryKind({ ip: "8.210.1.1", asn: 45102, cc: "CN" }), "overseas");
  assert.equal(entryKind({ ip: "59.43.1.1", asn: 4809, cc: "CN" }), "premium_line");
  assert.equal(entryKind({ ip: "223.119.1.1", asn: 58453, cc: "HK" }), "premium_line");
  assert.equal(entryKind({ ip: "95.169.12.201", asn: 25820, cc: "US", roles: ["中转入口"] }), "premium_line");
  assert.equal(entryKind({ ip: "104.16.1.2", asn: 13335, cc: "US" }), "cdn");
  assert.equal(entryKind({ ip: "13.196.171.179", asn: 16509, cc: "US" }), "overseas");
  assert.equal(entryKind(undefined), "unknown");
  assert.equal(providerLabel({ ip: "x", asn: 212336, holder: "BYTEVIRTLLC - ByteVirt LLC, US" }), "ByteVirt LLC");
  assert.equal(providerLabel({ ip: "x", asn: 64500 }), "AS64500");
  assert.equal(claimConflict("iplc", "overseas"), true);
  assert.equal(claimConflict("iplc", "cdn"), true);
  assert.equal(claimConflict("iplc", "domestic"), false);
  assert.equal(claimConflict("relay", "cdn"), true);
  assert.equal(claimConflict("relay", "premium_line"), false);
  assert.equal(claimConflict("iplc", "unknown"), false);
  const kinds = (domestic, premium_line, cdn, overseas, unknown = 0) => ({ domestic, premium_line, cdn, overseas, unknown });
  assert.equal(archetypeOf(kinds(6, 2, 0, 2), 10), "line");
  assert.equal(archetypeOf(kinds(0, 2, 3, 15), 20), "partial_line");
  assert.equal(archetypeOf(kinds(0, 0, 92, 120), 212), "direct");
  assert.equal(archetypeOf(kinds(0, 0, 0, 0, 4), 4), "unknown");
  const tiers = (budget, mid, high, premium) => ({ budget, mid, high, premium, unknown: 0 });
  assert.equal(costLevelOf("line", tiers(5, 0, 0, 0)), "high");
  assert.equal(costLevelOf("partial_line", tiers(5, 0, 0, 0)), "mid");
  assert.equal(costLevelOf("direct", tiers(94, 91, 25, 0)), "low");
  assert.equal(costLevelOf("direct", tiers(1, 1, 3, 1)), "mid");
  assert.equal(costLevelOf("unknown", tiers(0, 0, 0, 0)), "unknown");
});

test("airport audit reproduces a budget direct-connect airport with fake relays", () => {
  const node = (name, server, claims = []) => ({ name, server, protocol: "vless", port: 443, transport: null, tls: true, claims, region: null, multiplier: null });
  const nodes = [
    ...Array.from({ length: 6 }, (_, i) => node(`日本中转${i}`, `cf${i}.example.com`, ["relay"])),
    node("新加坡1", "13.251.157.92"),
    node("新加坡2", "13.251.157.92"),
    node("日本1", "13.251.157.93"),
    node("香港 IPLC", "35.220.182.144", ["iplc"]),
    node("丢失节点", "gone.example.com"),
  ];
  const resolved = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`cf${i}.example.com`, [`104.21.${i}.1`]]));
  const entries = {
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`104.21.${i}.1`, { ip: `104.21.${i}.1`, asn: 13335, cc: "US", known: true, brand: "Cloudflare", cost_tier: "budget" }])),
    "13.251.157.92": { ip: "13.251.157.92", asn: 16509, cc: "US", known: true, brand: "AWS", cost_tier: "mid" },
    "13.251.157.93": { ip: "13.251.157.93", asn: 16509, cc: "US", known: true, brand: "AWS", cost_tier: "mid" },
    "35.220.182.144": { ip: "35.220.182.144", asn: 396982, cc: "US", known: true, brand: "Google Cloud", cost_tier: "high" },
  };
  const report = auditAirport(nodes, resolved, entries);
  assert.equal(report.nodes, 11);
  assert.equal(report.unresolved, 1);
  assert.equal(report.entryIps, 9);
  assert.deepEqual(report.kinds, { domestic: 0, premium_line: 0, cdn: 6, overseas: 4, unknown: 1 });
  assert.deepEqual(report.tiers, { budget: 6, mid: 3, high: 1, premium: 0, unknown: 1 });
  assert.equal(report.archetype, "direct");
  assert.equal(report.costLevel, "low");
  assert.deepEqual(
    report.providers.map((p) => [p.label, p.kind, p.nodes, p.ips]),
    [["Cloudflare", "cdn", 6, 6], ["AWS", "overseas", 3, 2], ["Google Cloud", "overseas", 1, 1]],
  );
  assert.equal(report.mismatches.length, 7);
  assert.deepEqual(report.mismatches.at(-1), { name: "香港 IPLC", claim: "iplc", kind: "overseas", provider: "Google Cloud" });
  assert.deepEqual(report.claimCounts, { relay: 6, iplc: 1 });
  // CDN edges are excluded from route samples; one sample per provider.
  assert.deepEqual(report.routeSamples, [
    { ip: "13.251.157.92", label: "AWS" },
    { ip: "35.220.182.144", label: "Google Cloud" },
  ]);
});

test("browser entry lookup reads Cymru records over DoH and matches the shared catalog", async (t) => {
  const { lookupEntry, parseCymruOrigin } = await import("../src/lib/entry-lookup.ts");
  const answer = (data, type = 16) => ({ Answer: [{ type, data }] });
  const records = {
    "92.157.251.13.origin.asn.cymru.com": answer('"16509 | 13.248.0.0/14 | US | arin | 2021-09-28"'),
    "92.157.251.13.in-addr.arpa": answer("ec2-13-251-157-92.compute.amazonaws.com.", 12),
    "9.9.9.198.origin.asn.cymru.com": answer('"402506 | 198.9.9.0/24 | US | arin | 1992-02-05"'),
    "AS402506.asn.cymru.com": answer('"402506 | US | arin | 2024-01-01 | ZENIX-AS - Zenixcloud LLC, US"'),
  };
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const name = new URL(String(url)).searchParams.get("name");
    seen.push(name);
    return Response.json(records[name] ?? { Answer: [] });
  });
  const aws = await lookupEntry("13.251.157.92");
  assert.deepEqual(
    [aws.asn, aws.cc, aws.known, aws.brand, aws.cost_tier],
    [16509, "US", true, "AWS / Lightsail", "mid"],
  );
  assert.ok(!seen.includes("AS16509.asn.cymru.com"), "catalogued ASNs skip the holder query");
  const unknown = await lookupEntry("198.9.9.9");
  assert.deepEqual([unknown.asn, unknown.known, unknown.holder], [402506, false, "ZENIX-AS - Zenixcloud LLC, US"]);
  assert.deepEqual(await lookupEntry("2001:4860::1"), { ip: "2001:4860::1", asn: null });
  assert.deepEqual(parseCymruOrigin([{ type: 16, data: '"13335 209242 | 104.16.0.0/13 | us | arin | x"' }]), { asn: 13335, prefix: "104.16.0.0/13", cc: "US" });
});
