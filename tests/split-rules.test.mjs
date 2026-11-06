import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditServices,
  matchRoute,
  parseRuleConfig,
} from "../src/lib/split-rules.ts";

const SECRET = "11111111-2222-3333-4444-555555555555";

// Shape of a self-built relay: per-inbound split, AI suffixes → home
// broadband exit, everything else direct.
const singBox = JSON.stringify({
  inbounds: [
    {
      type: "vless",
      tag: "reality-direct",
      listen_port: 26001,
      users: [{ uuid: SECRET }],
    },
    {
      type: "vless",
      tag: "reality-split",
      listen_port: 26003,
      users: [{ uuid: SECRET }],
    },
    {
      type: "hysteria2",
      tag: "hy2-split",
      listen_port: 26003,
      users: [{ password: SECRET }],
    },
  ],
  outbounds: [
    { type: "direct", tag: "direct" },
    {
      type: "vless",
      tag: "jiakuan-reality",
      server: "home.example.net",
      uuid: SECRET,
    },
    { type: "vless", tag: "macau", server: "203.0.113.5", uuid: SECRET },
  ],
  route: {
    final: "direct",
    rules: [
      { action: "sniff" },
      {
        inbound: ["reality-split", "hy2-split"],
        domain_suffix: ["hk.example"],
        outbound: "macau",
      },
      {
        inbound: ["reality-split", "hy2-split"],
        domain_suffix: [
          "openai.com",
          "chatgpt.com",
          "claude.ai",
          "anthropic.com",
          "x.com",
        ],
        outbound: "jiakuan-reality",
      },
      { inbound: ["reality-direct"], outbound: "direct" },
      { rule_set: ["geosite-netflix"], outbound: "macau" },
      { domain_suffix: ["github.com"], port: [22], outbound: "macau" },
    ],
  },
});

test("sing-box configs keep rule conditions and outbound names, never credentials", () => {
  const config = parseRuleConfig(singBox);
  assert.equal(config.format, "sing-box");
  assert.equal(config.final, "direct");
  assert.equal(config.rules.length, 5); // sniff dropped
  assert.deepEqual(
    config.inbounds.map((item) => [item.tag, item.port]),
    [
      ["reality-direct", 26001],
      ["reality-split", 26003],
      ["hy2-split", 26003],
    ],
  );
  assert.deepEqual(
    config.outbounds.map((item) => item.tag),
    ["direct", "jiakuan-reality", "macau"],
  );
  assert.ok(!JSON.stringify(config).includes(SECRET));
});

test("matchRoute walks rules in order with inbound scoping and suffix semantics", () => {
  const config = parseRuleConfig(singBox);
  const split = (domain) => matchRoute(config, domain, "reality-split");
  assert.equal(split("chatgpt.com").outbound, "jiakuan-reality");
  assert.equal(split("api.openai.com").outbound, "jiakuan-reality");
  assert.equal(split("notopenai.com").outbound, "direct"); // suffix needs a label boundary
  assert.equal(split("www.hk.example").outbound, "macau");
  // Netflix may be inside the rule set: final is direct but flagged uncertain.
  const netflix = split("www.netflix.com");
  assert.equal(netflix.outbound, "direct");
  assert.equal(netflix.uncertain[0].text, "rule_set:geosite-netflix");
  // Port-qualified rule cannot be decided from the domain alone.
  assert.equal(split("github.com").uncertain.at(-1).outbound, "macau");
  // Another inbound skips the split rules entirely.
  assert.equal(
    matchRoute(config, "chatgpt.com", "reality-direct").outbound,
    "direct",
  );
  assert.equal(
    matchRoute(config, "chatgpt.com", "reality-direct").rule.inbound[0],
    "reality-direct",
  );
});

test("Clash and Surge rule lists use the same matcher", () => {
  const clash = parseRuleConfig(`proxies:
  - { name: home, type: vless, server: home.example.net, uuid: ${SECRET} }
proxy-groups:
  - { name: AI, type: select, proxies: [home] }
rules:
  - DOMAIN-SUFFIX,openai.com,AI
  - DOMAIN-KEYWORD,claude,AI
  - GEOSITE,netflix,AI
  - GEOIP,CN,DIRECT
  - MATCH,DIRECT
`);
  assert.equal(clash.format, "clash");
  assert.equal(clash.final, "DIRECT");
  assert.equal(matchRoute(clash, "api.openai.com").outbound, "AI");
  assert.equal(matchRoute(clash, "claude.ai").outbound, "AI");
  assert.equal(matchRoute(clash, "github.com").outbound, "DIRECT");
  assert.equal(matchRoute(clash, "github.com").uncertain.length, 2);
  assert.deepEqual(
    clash.outbounds.map((item) => item.tag),
    ["AI", "home"],
  );
  assert.ok(!JSON.stringify(clash).includes(SECRET));

  const surge = parseRuleConfig(`[General]
loglevel = notify
[Rule]
# AI
DOMAIN-SUFFIX,anthropic.com,US-Home
DOMAIN,x.com,US-Home
FINAL,Proxy
`);
  assert.equal(surge.format, "surge");
  assert.equal(matchRoute(surge, "api.anthropic.com").outbound, "US-Home");
  assert.equal(matchRoute(surge, "x.com").outbound, "US-Home");
  assert.equal(matchRoute(surge, "www.x.com").outbound, "Proxy");
  assert.equal(parseRuleConfig("not a config").format, "unknown");
});

test("auditServices learns outbound exits from echo domains and flags mismatches", () => {
  const config = parseRuleConfig(singBox);
  const services = [
    {
      name: "ChatGPT",
      domain: "chatgpt.com",
      category: "ai",
      echo: "chatgpt.com",
    },
    { name: "Claude", domain: "claude.ai", category: "ai", echo: "claude.ai" },
    { name: "X", domain: "x.com", category: "social", echo: "x.com" },
    {
      name: "npm",
      domain: "registry.npmjs.org",
      category: "dev",
      echo: "registry.npmjs.org",
    },
    { name: "YouTube", domain: "www.youtube.com", category: "media" },
    { name: "Gemini", domain: "gemini.google.com", category: "ai" },
  ];
  const { verdicts, exits } = auditServices(
    config,
    "reality-split",
    {
      "chatgpt.com": "104.247.120.205",
      "claude.ai": "104.247.120.205",
      "x.com": "38.244.25.149", // leaked out of the home exit
      "registry.npmjs.org": "38.244.25.149",
    },
    services,
  );
  assert.deepEqual(exits, {
    "jiakuan-reality": "104.247.120.205",
    direct: "38.244.25.149",
  });
  const status = Object.fromEntries(
    verdicts.map((item) => [item.service.name, item.status]),
  );
  assert.deepEqual(status, {
    ChatGPT: "match",
    Claude: "match",
    X: "mismatch",
    npm: "match",
    YouTube: "inferred",
    Gemini: "inferred",
  });
  assert.equal(
    verdicts.find((item) => item.service.name === "Gemini").expected,
    "38.244.25.149",
  );
});
