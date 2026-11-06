// Split-routing rule engine. Parses a proxy config (sing-box JSON, Clash /
// mihomo YAML, Surge / Shadowrocket conf) into an ordered rule list and
// predicts which outbound a destination domain takes. Runs in the browser;
// only rule conditions and outbound names are kept, never credentials.
import { parse as parseYaml } from "yaml";

export type RuleFormat = "sing-box" | "clash" | "surge" | "unknown";

export interface InboundInfo {
  tag: string;
  type: string;
  port: number | null;
}

export interface OutboundInfo {
  tag: string;
  type: string;
  server: string | null;
}

export interface SplitRule {
  index: number;
  /** Human-readable rule text for display. */
  text: string;
  outbound: string;
  inbound?: string[];
  domain?: string[];
  suffix?: string[];
  keyword?: string[];
  regex?: string[];
  /** Conditions we cannot evaluate from a domain alone (rule sets, GEOIP…). */
  opaque?: string[];
  /** Rule has non-domain conditions that make a domain-only match uncertain. */
  extra?: string[];
}

export interface RuleConfig {
  format: RuleFormat;
  inbounds: InboundInfo[];
  outbounds: OutboundInfo[];
  rules: SplitRule[];
  final: string;
  warnings: string[];
}

export interface RouteMatch {
  outbound: string;
  rule: SplitRule | null;
  /** Earlier rules that might match but cannot be evaluated offline. */
  uncertain: SplitRule[];
}

const asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];

function summarize(rule: Omit<SplitRule, "text" | "index">) {
  const parts: string[] = [];
  const show = (label: string, list?: string[]) => {
    if (!list?.length) return;
    parts.push(
      `${label} ${list.slice(0, 3).join(", ")}${list.length > 3 ? ` +${list.length - 3}` : ""}`,
    );
  };
  show("inbound", rule.inbound);
  show("domain", rule.domain);
  show("suffix", rule.suffix);
  show("keyword", rule.keyword);
  show("regex", rule.regex);
  show("", rule.opaque);
  show("", rule.extra);
  return parts.join(" · ").replace(/ {2,}/g, " ").trim() || "*";
}

// sing-box fields that do not depend on the destination domain.
const SINGBOX_NEUTRAL = new Set([
  "outbound",
  "action",
  "inbound",
  "invert",
  "domain",
  "domain_suffix",
  "domain_keyword",
  "domain_regex",
  "rule_set",
  "geosite",
  "type",
]);

function parseSingBox(data: Record<string, unknown>): RuleConfig {
  const warnings: string[] = [];
  const inbounds = (Array.isArray(data.inbounds) ? data.inbounds : []).map(
    (item: Record<string, unknown>) => ({
      tag: String(item.tag ?? item.type ?? "?"),
      type: String(item.type ?? "?"),
      port: Number.isInteger(item.listen_port)
        ? (item.listen_port as number)
        : null,
    }),
  );
  const outbounds = (Array.isArray(data.outbounds) ? data.outbounds : []).map(
    (item: Record<string, unknown>) => ({
      tag: String(item.tag ?? item.type ?? "?"),
      type: String(item.type ?? "?"),
      server: typeof item.server === "string" ? item.server : null,
    }),
  );
  const route = (data.route ?? {}) as Record<string, unknown>;
  const rules: SplitRule[] = [];
  (Array.isArray(route.rules) ? route.rules : []).forEach(
    (raw: Record<string, unknown>, index: number) => {
      const action = String(raw.action ?? "route");
      // sniff / resolve / hijack-dns never pick an outbound.
      if (!["route", "reject", "bypass"].includes(action)) return;
      if (raw.type === "logical") {
        warnings.push(`rule ${index + 1}: logical rule not evaluated`);
        return;
      }
      const outbound =
        action === "reject" ? "reject" : String(raw.outbound ?? "?");
      const extra = Object.keys(raw)
        .filter((key) => !SINGBOX_NEUTRAL.has(key))
        .map((key) => key);
      const base = {
        outbound,
        inbound: asList(raw.inbound),
        domain: asList(raw.domain),
        suffix: asList(raw.domain_suffix),
        keyword: asList(raw.domain_keyword),
        regex: asList(raw.domain_regex),
        opaque: [
          ...asList(raw.rule_set).map((tag) => `rule_set:${tag}`),
          ...asList(raw.geosite).map((tag) => `geosite:${tag}`),
        ],
        extra,
      };
      if (raw.invert) base.extra.push("invert");
      rules.push({ ...base, index: index + 1, text: summarize(base) });
    },
  );
  const firstOutbound = outbounds[0]?.tag ?? "direct";
  return {
    format: "sing-box",
    inbounds,
    outbounds,
    rules,
    final: typeof route.final === "string" ? route.final : firstOutbound,
    warnings,
  };
}

// Clash / Surge share the "TYPE,payload,target[,options]" rule syntax.
function parseRuleLines(lines: string[], format: RuleFormat): RuleConfig {
  const rules: SplitRule[] = [];
  const warnings: string[] = [];
  let final = "DIRECT";
  lines.forEach((line, index) => {
    const parts = line.split(",").map((part) => part.trim());
    const type = parts[0]?.toUpperCase();
    if (!type) return;
    if (type === "MATCH" || type === "FINAL") {
      final = parts[1] ?? final;
      return;
    }
    const payload = parts[1] ?? "";
    const outbound = parts[2] ?? "?";
    const base: Omit<SplitRule, "text" | "index"> = { outbound };
    if (type === "DOMAIN") base.domain = [payload];
    else if (type === "DOMAIN-SUFFIX") base.suffix = [payload];
    else if (type === "DOMAIN-KEYWORD") base.keyword = [payload];
    else if (type === "DOMAIN-REGEX") base.regex = [payload];
    else if (
      [
        "RULE-SET",
        "GEOSITE",
        "DOMAIN-SET",
        "GEOIP",
        "IP-CIDR",
        "IP-CIDR6",
        "IP-ASN",
        "SRC-IP-CIDR",
        "PROCESS-NAME",
        "DST-PORT",
        "AND",
        "OR",
        "NOT",
        "SUB-RULE",
      ].includes(type)
    )
      base.opaque = [`${type.toLowerCase()}:${payload}`];
    else {
      warnings.push(`line ${index + 1}: ${type} not evaluated`);
      return;
    }
    rules.push({ ...base, index: index + 1, text: `${type},${payload}` });
  });
  return { format, inbounds: [], outbounds: [], rules, final, warnings };
}

function parseSurge(text: string): RuleConfig {
  const lines: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) {
      inRules = /^\[rule\]$/i.test(line);
      continue;
    }
    if (inRules && line && !/^[#;/]/.test(line)) lines.push(line);
  }
  return parseRuleLines(lines, "surge");
}

export function parseRuleConfig(input: string): RuleConfig {
  const text = input.replace(/^﻿/, "").trim();
  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data.route || data.outbounds) return parseSingBox(data);
    } catch {
      /* not JSON */
    }
  }
  if (/^\[rule\]\s*$/im.test(text)) return parseSurge(text);
  if (/^rules\s*:/m.test(text)) {
    try {
      const data = parseYaml(text) as {
        rules?: unknown[];
        proxies?: { name?: string; type?: string; server?: string }[];
        "proxy-groups"?: { name?: string; type?: string }[];
      };
      const config = parseRuleLines(
        (data.rules ?? []).filter(
          (rule): rule is string => typeof rule === "string",
        ),
        "clash",
      );
      config.outbounds = [
        ...(data["proxy-groups"] ?? []).map((group) => ({
          tag: String(group.name ?? "?"),
          type: String(group.type ?? "group"),
          server: null,
        })),
        ...(data.proxies ?? []).map((proxy) => ({
          tag: String(proxy.name ?? "?"),
          type: String(proxy.type ?? "?"),
          server: typeof proxy.server === "string" ? proxy.server : null,
        })),
      ];
      return config;
    } catch {
      /* fall through */
    }
  }
  return {
    format: "unknown",
    inbounds: [],
    outbounds: [],
    rules: [],
    final: "",
    warnings: [],
  };
}

function suffixMatch(host: string, suffix: string) {
  const value = suffix.toLowerCase();
  // sing-box: ".example.com" matches subdomains only.
  if (value.startsWith(".")) return host.endsWith(value);
  return host === value || host.endsWith(`.${value}`);
}

function domainHit(rule: SplitRule, host: string) {
  if (rule.domain?.some((item) => host === item.toLowerCase())) return true;
  if (rule.suffix?.some((item) => suffixMatch(host, item))) return true;
  if (rule.keyword?.some((item) => host.includes(item.toLowerCase())))
    return true;
  return Boolean(
    rule.regex?.some((item) => {
      try {
        return new RegExp(item, "i").test(host);
      } catch {
        return false;
      }
    }),
  );
}

const hasDomainCondition = (rule: SplitRule) =>
  Boolean(
    rule.domain?.length ||
    rule.suffix?.length ||
    rule.keyword?.length ||
    rule.regex?.length,
  );

/** Walk rules in order, as the proxy core does, for one destination. */
export function matchRoute(
  config: RuleConfig,
  domain: string,
  inbound?: string,
): RouteMatch {
  const host = domain.toLowerCase().replace(/\.$/, "");
  const uncertain: SplitRule[] = [];
  for (const rule of config.rules) {
    if (rule.inbound?.length && !(inbound && rule.inbound.includes(inbound)))
      continue;
    const domainKnown = hasDomainCondition(rule);
    const hit = domainKnown && domainHit(rule, host);
    const opaque = Boolean(rule.opaque?.length);
    if (hit) {
      if (rule.extra?.length) {
        uncertain.push(rule);
        continue;
      }
      return { outbound: rule.outbound, rule, uncertain };
    }
    if (opaque && !hit) {
      // Rule sets / GEOSITE may contain this domain; we cannot tell.
      uncertain.push(rule);
      continue;
    }
    if (!domainKnown && !opaque) {
      // Catch-all for this inbound (e.g. "inbound X → outbound Y").
      if (rule.extra?.length) {
        uncertain.push(rule);
        continue;
      }
      return { outbound: rule.outbound, rule, uncertain };
    }
  }
  return { outbound: config.final, rule: null, uncertain };
}

/**
 * Services checked by the rule audit. `echo` is a domain the proxy routes the
 * same way that also returns the visitor IP through a CORS-readable
 * Cloudflare trace, so the predicted outbound can be checked against reality.
 */
export interface AuditService {
  name: string;
  domain: string;
  category: string;
  echo?: string;
}

export const AUDIT_SERVICES: AuditService[] = [
  {
    name: "ChatGPT",
    domain: "chatgpt.com",
    category: "ai",
    echo: "chatgpt.com",
  },
  {
    name: "OpenAI API",
    domain: "api.openai.com",
    category: "ai",
    echo: "api.openai.com",
  },
  { name: "Claude", domain: "claude.ai", category: "ai", echo: "claude.ai" },
  {
    name: "Anthropic API",
    domain: "api.anthropic.com",
    category: "ai",
    echo: "api.anthropic.com",
  },
  { name: "Gemini", domain: "gemini.google.com", category: "ai" },
  { name: "Grok", domain: "grok.com", category: "ai", echo: "grok.com" },
  {
    name: "Perplexity",
    domain: "www.perplexity.ai",
    category: "ai",
    echo: "www.perplexity.ai",
  },
  { name: "X", domain: "x.com", category: "social", echo: "x.com" },
  {
    name: "Discord",
    domain: "discord.com",
    category: "social",
    echo: "gateway.discord.gg",
  },
  { name: "Telegram", domain: "web.telegram.org", category: "social" },
  { name: "TikTok", domain: "www.tiktok.com", category: "social" },
  { name: "Google", domain: "www.google.com", category: "tools" },
  { name: "YouTube", domain: "www.youtube.com", category: "media" },
  { name: "Netflix", domain: "www.netflix.com", category: "media" },
  { name: "Disney+", domain: "www.disneyplus.com", category: "media" },
  { name: "Spotify", domain: "open.spotify.com", category: "media" },
  { name: "GitHub", domain: "github.com", category: "dev" },
  {
    name: "npm",
    domain: "registry.npmjs.org",
    category: "dev",
    echo: "registry.npmjs.org",
  },
  { name: "Apple", domain: "www.apple.com", category: "tools" },
  { name: "Microsoft", domain: "www.microsoft.com", category: "tools" },
  { name: "Amazon", domain: "www.amazon.com", category: "ecommerce" },
  { name: "Binance", domain: "www.binance.com", category: "crypto" },
  {
    name: "Coinbase",
    domain: "coinbase.com",
    category: "crypto",
    echo: "coinbase.com",
  },
];

export interface ServiceVerdict {
  service: AuditService;
  match: RouteMatch;
  /** IP seen through the echo domain, when the browser could read one. */
  observed: string | null;
  /** Majority exit IP observed for the predicted outbound. */
  expected: string | null;
  status: "match" | "mismatch" | "inferred" | "unknown";
}

/**
 * Join config predictions with live observations: learn each outbound's exit
 * IP from the services that echo it, then flag echoed services whose IP
 * differs from their outbound's exit (rules not what the config says, or
 * the browser is not on this config's inbound).
 */
export function auditServices(
  config: RuleConfig,
  inbound: string | undefined,
  observed: Record<string, string | null>,
  services: AuditService[] = AUDIT_SERVICES,
): { verdicts: ServiceVerdict[]; exits: Record<string, string> } {
  const matches = services.map((service) => ({
    service,
    match: matchRoute(config, service.domain, inbound),
    observed: service.echo ? (observed[service.echo] ?? null) : null,
  }));
  const votes = new Map<string, Map<string, number>>();
  for (const item of matches) {
    if (!item.observed) continue;
    const tally = votes.get(item.match.outbound) ?? new Map<string, number>();
    tally.set(item.observed, (tally.get(item.observed) ?? 0) + 1);
    votes.set(item.match.outbound, tally);
  }
  const exits: Record<string, string> = {};
  for (const [outbound, tally] of votes)
    exits[outbound] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const verdicts = matches.map((item) => {
    const expected = exits[item.match.outbound] ?? null;
    const status: ServiceVerdict["status"] = item.observed
      ? item.observed === expected
        ? "match"
        : "mismatch"
      : expected
        ? "inferred"
        : "unknown";
    return { ...item, expected, status };
  });
  return { verdicts, exits };
}
