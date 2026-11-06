// Parse an airport subscription (base64 / plain URI list, Clash YAML or
// sing-box JSON) into credential-free node descriptors. Runs entirely in the
// browser: passwords, UUIDs and keys are never kept on the returned objects.
import { parse as parseYaml } from "yaml";

export type Claim = "iplc" | "relay" | "direct" | "residential" | "unlock";

export interface SubscriptionNode {
  name: string;
  protocol: string;
  server: string;
  port: number | null;
  transport: string | null;
  tls: boolean;
  claims: Claim[];
  region: string | null;
  multiplier: number | null;
}

export interface ParsedSubscription {
  format: "uri" | "clash" | "sing-box" | "unknown";
  nodes: SubscriptionNode[];
  /** Pseudo-nodes carrying plan info (traffic left, expiry, website…). */
  info: string[];
  skipped: number;
}

const INFO_NAME =
  /剩余|流量|到期|过期|重置|官网|网址|客服|邮箱|订阅|套餐|公告|更新|群组|频道|expire|traffic|remaining|reset|website|e-?mail/i;

const CLAIM_PATTERNS: [Claim, RegExp][] = [
  ["iplc", /IPLC|IEPL|专线|内网|BGP\s*专线/i],
  ["relay", /中转|转发|隧道|relay|tunnel/i],
  ["direct", /直连|直通|direct/i],
  ["residential", /家宽|家庭宽带|住宅|原生|residential|native|ISP/],
  ["unlock", /解锁|unlock|流媒体|netflix|奈飞|disney/i],
];

// Common Chinese / English / emoji-flag spellings → ISO country code.
const REGION_NAMES: [string, RegExp][] = [
  ["HK", /香港|港|hong\s*kong|\bHK\b|🇭🇰/i],
  ["TW", /台湾|台灣|台北|taiwan|\bTW\b|🇹🇼/i],
  ["MO", /澳门|澳門|macau|macao|🇲🇴/i],
  ["JP", /日本|东京|東京|大阪|japan|tokyo|osaka|\bJP\b|🇯🇵/i],
  ["KR", /韩国|韓國|首尔|korea|seoul|\bKR\b|🇰🇷/i],
  ["SG", /新加坡|狮城|singapore|\bSG\b|🇸🇬/i],
  [
    "US",
    /美国|美國|洛杉矶|西雅图|圣何塞|圣荷西|纽约|芝加哥|达拉斯|亚特兰大|硅谷|united\s*states|\bUSA?\b|los\s*angeles|🇺🇸/i,
  ],
  ["GB", /英国|英國|伦敦|united\s*kingdom|britain|london|\bUK\b|🇬🇧/i],
  ["DE", /德国|德國|法兰克福|germany|frankfurt|\bDE\b|🇩🇪/i],
  ["FR", /法国|法國|巴黎|france|paris|🇫🇷/i],
  ["NL", /荷兰|荷蘭|阿姆斯特丹|netherlands|amsterdam|🇳🇱/i],
  ["CA", /加拿大|canada|🇨🇦/i],
  ["AU", /澳大利亚|澳洲|悉尼|australia|sydney|🇦🇺/i],
  ["IN", /印度|india|🇮🇳/i],
  ["MY", /马来西亚|馬來西亞|malaysia|🇲🇾/i],
  ["TH", /泰国|泰國|thailand|🇹🇭/i],
  ["VN", /越南|vietnam|🇻🇳/i],
  ["PH", /菲律宾|philippines|🇵🇭/i],
  ["ID", /印尼|印度尼西亚|indonesia|🇮🇩/i],
  ["TR", /土耳其|turkey|türkiye|🇹🇷/i],
  ["RU", /俄罗斯|俄羅斯|russia|🇷🇺/i],
  ["BR", /巴西|brazil|🇧🇷/i],
  ["AR", /阿根廷|argentina|🇦🇷/i],
];

function decodeBase64(value: string): string | null {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) return null;
  const compact = normalized.replace(/\s+/g, "");
  const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function nodeClaims(name: string): Claim[] {
  return CLAIM_PATTERNS.filter(([, pattern]) => pattern.test(name)).map(
    ([claim]) => claim,
  );
}

/** ISO code for common regions, else the bracketed label (e.g. "[Nepal]"). */
export function nodeRegion(name: string): string | null {
  const known = REGION_NAMES.find(([, pattern]) => pattern.test(name))?.[0];
  if (known) return known;
  const bracket = /^\s*[[【]([^\]】]{2,24})[\]】]/.exec(name)?.[1]?.trim();
  return bracket || null;
}

export function nodeMultiplier(name: string): number | null {
  const match =
    /(?:倍率|rate)\s*[:：]?\s*(\d+(?:\.\d+)?)/i.exec(name) ??
    /(?:^|[^a-z0-9.])[x×]\s?(\d+(?:\.\d+)?)(?![\d.])/i.exec(name) ??
    /(\d+(?:\.\d+)?)\s?(?:倍|[x×])(?![a-z0-9])/i.exec(name);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

function cleanHost(host: string): string {
  return host
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
}

function makeNode(input: {
  name: string;
  protocol: string;
  server: unknown;
  port: unknown;
  transport?: unknown;
  tls?: unknown;
}): SubscriptionNode | null {
  if (typeof input.server !== "string" || !input.server.trim()) return null;
  const name = input.name.trim() || input.server;
  const port = Number(input.port);
  return {
    name,
    protocol: input.protocol.toLowerCase().replace(/^hy2$/, "hysteria2"),
    server: cleanHost(input.server),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : null,
    transport:
      typeof input.transport === "string" && input.transport
        ? input.transport.toLowerCase()
        : null,
    tls: Boolean(input.tls),
    claims: nodeClaims(name),
    region: nodeRegion(name),
    multiplier: nodeMultiplier(name),
  };
}

// scheme://[userinfo@]host[:port][?query][#name]
function parseGenericUri(scheme: string, rest: string) {
  const hashIndex = rest.indexOf("#");
  const name = hashIndex >= 0 ? safeDecode(rest.slice(hashIndex + 1)) : "";
  const body = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const queryIndex = body.indexOf("?");
  const authority = (queryIndex >= 0 ? body.slice(0, queryIndex) : body)
    .replace(/\/+$/, "")
    .split("/")[0];
  const query = new URLSearchParams(
    queryIndex >= 0 ? body.slice(queryIndex + 1) : "",
  );
  const hostPart = authority.slice(authority.lastIndexOf("@") + 1);
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?/.exec(hostPart);
  if (!match) return null;
  const security = query.get("security") ?? "";
  const tls =
    ["tls", "reality", "xtls"].includes(security) ||
    ["trojan", "hysteria2", "hy2", "hysteria", "tuic", "anytls"].includes(
      scheme,
    ) ||
    query.get("tls") === "1";
  return makeNode({
    name,
    protocol: scheme,
    server: match[1],
    port: match[2],
    transport: query.get("type") ?? query.get("transport"),
    tls,
  });
}

function parseVmess(rest: string) {
  const decoded = decodeBase64(rest.split("#")[0]);
  if (!decoded) return null;
  try {
    const data = JSON.parse(decoded) as Record<string, unknown>;
    return makeNode({
      name: String(data.ps ?? ""),
      protocol: "vmess",
      server: data.add,
      port: data.port,
      transport: data.net,
      tls: data.tls === "tls",
    });
  } catch {
    return null;
  }
}

function parseShadowsocks(rest: string) {
  const hashIndex = rest.indexOf("#");
  const name = hashIndex >= 0 ? safeDecode(rest.slice(hashIndex + 1)) : "";
  let body = (hashIndex >= 0 ? rest.slice(0, hashIndex) : rest).split("?")[0];
  // Legacy form: ss://base64(method:password@host:port)#name
  if (!body.includes("@")) {
    const decoded = decodeBase64(body.replace(/\/$/, ""));
    if (!decoded) return null;
    body = decoded;
  }
  const hostPart = body.slice(body.lastIndexOf("@") + 1).replace(/\/$/, "");
  const match = /^(\[[^\]]+\]|[^:]+):(\d+)/.exec(hostPart);
  if (!match) return null;
  return makeNode({ name, protocol: "ss", server: match[1], port: match[2] });
}

function parseShadowsocksR(rest: string) {
  const decoded = decodeBase64(rest);
  if (!decoded) return null;
  const [main, params = ""] = decoded.split("/?");
  // host:port:protocol:method:obfs:password — host may be IPv6 with colons.
  const parts = main.split(":");
  if (parts.length < 6) return null;
  const server = parts.slice(0, parts.length - 5).join(":");
  const remarks = new URLSearchParams(params).get("remarks");
  return makeNode({
    name: remarks ? (decodeBase64(remarks) ?? "") : "",
    protocol: "ssr",
    server,
    port: parts[parts.length - 5],
  });
}

const URI_SCHEMES = new Set([
  "vless",
  "trojan",
  "hysteria2",
  "hy2",
  "hysteria",
  "tuic",
  "anytls",
  "socks",
  "socks5",
  "http",
  "https",
  "wireguard",
  "wg",
]);

export function parseUriLine(line: string): SubscriptionNode | null {
  const match = /^([a-z0-9]+):\/\/(.+)$/i.exec(line.trim());
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const rest = match[2];
  if (scheme === "vmess") return parseVmess(rest);
  if (scheme === "ss") return parseShadowsocks(rest);
  if (scheme === "ssr") return parseShadowsocksR(rest);
  if (URI_SCHEMES.has(scheme)) return parseGenericUri(scheme, rest);
  return null;
}

const SKIP_OUTBOUND = new Set([
  "selector",
  "urltest",
  "direct",
  "block",
  "dns",
  "loadbalance",
]);

function fromClash(proxies: unknown[]) {
  return proxies.map((item) => {
    if (!item || typeof item !== "object") return null;
    const proxy = item as Record<string, unknown>;
    return makeNode({
      name: String(proxy.name ?? ""),
      protocol: String(proxy.type ?? "unknown"),
      server: proxy.server,
      port: proxy.port,
      transport: proxy.network,
      tls:
        proxy.tls === true ||
        ["trojan", "hysteria2", "hysteria", "tuic", "anytls"].includes(
          String(proxy.type),
        ),
    });
  });
}

function fromSingBox(outbounds: unknown[]) {
  return outbounds.map((item) => {
    if (!item || typeof item !== "object") return null;
    const outbound = item as Record<string, unknown>;
    const type = String(outbound.type ?? "");
    if (SKIP_OUTBOUND.has(type)) return undefined;
    const transport = outbound.transport as Record<string, unknown> | undefined;
    const tls = outbound.tls as Record<string, unknown> | undefined;
    return makeNode({
      name: String(outbound.tag ?? ""),
      protocol: type,
      server: outbound.server,
      port: outbound.server_port,
      transport: transport?.type,
      tls: tls?.enabled === true,
    });
  });
}

function finish(
  format: ParsedSubscription["format"],
  candidates: (SubscriptionNode | null | undefined)[],
): ParsedSubscription {
  const nodes: SubscriptionNode[] = [];
  const info: string[] = [];
  let skipped = 0;
  for (const node of candidates) {
    if (node === undefined) continue;
    if (!node) {
      skipped++;
      continue;
    }
    if (INFO_NAME.test(node.name)) info.push(node.name);
    else nodes.push(node);
  }
  return { format, nodes, info, skipped };
}

export function parseSubscription(input: string): ParsedSubscription {
  let text = input.replace(/^﻿/, "").trim();
  if (!text) return { format: "unknown", nodes: [], info: [], skipped: 0 };
  if (!text.includes("://") && !/^[{[]/.test(text) && !/:\s/.test(text)) {
    const decoded = decodeBase64(text);
    if (decoded) text = decoded.trim();
  }
  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text) as { outbounds?: unknown[] };
      if (Array.isArray(data.outbounds))
        return finish("sing-box", fromSingBox(data.outbounds));
    } catch {
      /* fall through to the other formats */
    }
  }
  if (/^proxies\s*:/m.test(text)) {
    try {
      const data = parseYaml(text) as { proxies?: unknown[] } | null;
      if (Array.isArray(data?.proxies))
        return finish("clash", fromClash(data.proxies));
    } catch {
      /* fall through to the URI list */
    }
  }
  const lines = text.split(/\r?\n/).filter((line) => line.includes("://"));
  if (!lines.length)
    return { format: "unknown", nodes: [], info: [], skipped: 0 };
  return finish("uri", lines.map(parseUriLine));
}

/** True when the input looks like a subscription link rather than content. */
export function looksLikeSubscriptionUrl(input: string) {
  return /^https?:\/\/\S+$/i.test(input.trim());
}
