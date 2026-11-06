import { geoIp, secondaryGeo } from "./geo.js";
import { HttpError, publicIp, upstream } from "./http.js";
import { ipType } from "./ip-type.js";

// Aggregated IP reputation. Keyed sources (ipapi.is, proxycheck.io, AbuseIPDB)
// are skipped without their secret; keyless lookups (geo via ipwho.is with an
// ip.sb fallback, Team Cymru origin/ASN over DoH, PTR, RPKI via RIPEstat)
// always run. The result stays compatible with the legacy CoffeeIp shape
// consumed by src/views/ip/coffee.ts.

// ipapi.is rates abuse per network block (often a whole ISP), so the
// common Low label carries no signal for a single address.
const ABUSER_LABEL_SCORE = {
  "very low": 0,
  low: 0,
  elevated: 15,
  high: 40,
  "very high": 75,
};
const PUBLIC_SERVICE_PREFIXES = [
  "1.1.1.0/24",
  "1.0.0.0/24",
  "8.8.8.0/24",
  "8.8.4.0/24",
  "9.9.9.0/24",
  "149.112.112.0/24",
  "208.67.222.0/24",
  "208.67.220.0/24",
];

function ipv4ToInt(ip) {
  const [a, b, c, d] = ip.split(".").map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export function cidrMatch(ip, prefix) {
  if (ip.includes(":") || !prefix?.includes(".")) return false;
  const [base, lenStr] = prefix.split("/");
  const len = Number(lenStr);
  if (!base || !Number.isInteger(len) || len < 0 || len > 32) return false;
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function expandIpv6(ip) {
  const [headRaw, tailRaw] = ip.split("::");
  const head = headRaw ? headRaw.split(":").filter(Boolean) : [];
  const tail = tailRaw !== undefined ? tailRaw.split(":").filter(Boolean) : [];
  const missing = 8 - head.length - tail.length;
  if (ip.includes("::") && missing < 0) return null;
  const groups = [
    ...head,
    ...Array(ip.includes("::") ? Math.max(0, missing) : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  return groups
    .map((group) => group.padStart(4, "0"))
    .join("")
    .toLowerCase();
}

function reverseLabels(ip) {
  if (ip.includes(":")) {
    const expanded = expandIpv6(ip);
    return expanded ? expanded.split("").reverse().join(".") : null;
  }
  return ip.split(".").reverse().join(".");
}

async function dohQuery(name, type) {
  const data = await upstream(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  return Array.isArray(data?.Answer) ? data.Answer : [];
}

export async function ptrLookup(ip) {
  const labels = reverseLabels(ip);
  if (!labels) return null;
  const arpa = `${labels}.${ip.includes(":") ? "ip6" : "in-addr"}.arpa`;
  const answers = await dohQuery(arpa, "PTR");
  const data = answers.find((answer) => answer.type === 12)?.data;
  if (typeof data !== "string" || !data) return null;
  return data.replace(/^"|"$/g, "").replace(/\.$/, "");
}

function cymruRecord(answers) {
  const data = answers.find((answer) => answer.type === 16)?.data;
  if (typeof data !== "string" || !data) return null;
  return data
    .replace(/^"|"$/g, "")
    .split("|")
    .map((part) => part.trim());
}

export async function cymruOrigin(ip) {
  const labels = reverseLabels(ip);
  if (!labels) return null;
  const parts = cymruRecord(
    await dohQuery(`${labels}.origin.asn.cymru.com`, "TXT"),
  );
  if (!parts || parts.length < 2) return null;
  const asn = Number(parts[0]);
  if (!Number.isInteger(asn) || !parts[1].includes("/")) return null;
  return {
    asn,
    prefix: parts[1],
    cc: parts[2]?.toLowerCase() ?? "",
    rir: parts[3] ?? "",
    allocated: parts[4] ?? "",
  };
}

export async function cymruAsnInfo(asn) {
  const parts = cymruRecord(await dohQuery(`AS${asn}.asn.cymru.com`, "TXT"));
  if (!parts || parts.length < 5) return null;
  const holder = parts[4];
  const separator = holder.indexOf(" - ");
  return {
    asname: separator > 0 ? holder.slice(0, separator) : undefined,
    holder: separator > 0 ? holder.slice(separator + 3) : holder,
    allocated: parts[3] ?? "",
  };
}

async function rpkiValidation(prefix, asn) {
  const data = await upstream(
    `https://stat.ripe.net/data/rpki-validation/data.json?resource=${asn}&prefix=${encodeURIComponent(prefix)}`,
  );
  const status = data?.data?.status;
  return typeof status === "string" ? status : null;
}

function sameIp(a, b) {
  try {
    return publicIp(a) === publicIp(b);
  } catch {
    return false;
  }
}

async function fetchIpapi(ip, key) {
  const data = await upstream(
    `https://api.ipapi.is/?q=${encodeURIComponent(ip)}&key=${encodeURIComponent(key)}`,
  );
  if (!data || typeof data !== "object" || !sameIp(data.ip, ip))
    throw new Error("ipapi.is response does not match the requested address");
  return data;
}

function proxycheckPayload(data, ip) {
  if (data?.detections) return data;
  const nested = data?.[ip];
  return nested?.detections ? nested : null;
}

async function fetchProxycheck(ip, key) {
  const data = await upstream(
    `https://proxycheck.io/v3/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`,
  );
  const payload = proxycheckPayload(data, ip);
  if (!payload) throw new Error("proxycheck.io response missing detections");
  return payload;
}

async function fetchAbuseipdb(ip, key) {
  // The current APIv2 expects ipAddress=, not the older documented ip=.
  const data = await upstream(
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
    { headers: { Key: key, Accept: "application/json" } },
  );
  if (!data?.data || typeof data.data !== "object")
    throw new Error("AbuseIPDB response missing data");
  return data.data;
}

export function abuserLabelScore(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/\(([^)]+)\)/);
  if (!match) return null;
  const label = match[1].trim().toLowerCase();
  return Object.hasOwn(ABUSER_LABEL_SCORE, label)
    ? ABUSER_LABEL_SCORE[label]
    : null;
}

export function computeTrust(m) {
  const penalties = [];
  if (m.tor) penalties.push({ score: 90, label: "Tor 出口节点" });
  if (m.proxy || m.compromised)
    penalties.push({ score: 85, label: "代理或被入侵标记" });
  if (Number.isFinite(m.abuseConfidence) && m.abuseConfidence > 0)
    penalties.push({
      score: Math.min(100, m.abuseConfidence),
      label: `AbuseIPDB 滥用置信度 ${m.abuseConfidence}`,
    });
  if (Number.isFinite(m.abuserLabelScore) && m.abuserLabelScore > 0)
    penalties.push({ score: m.abuserLabelScore, label: "IP 段滥用风险标记" });
  if (m.vpn || m.vpnService)
    penalties.push({
      score: 50,
      label: m.vpnService ? `VPN 出口（${m.vpnService}）` : "VPN 出口",
    });
  // proxycheck assigns every hosting IP a baseline risk; only count it when
  // it actually flags the address, otherwise it double-counts the type base.
  if (m.pcFlagged && Number.isFinite(m.pcRisk) && m.pcRisk > 0) {
    const confidence = Number.isFinite(m.pcConfidence)
      ? Math.min(100, Math.max(0, m.pcConfidence))
      : 100;
    penalties.push({
      score: Math.round((m.pcRisk * confidence) / 100),
      label: "proxycheck 风险分",
    });
  }
  const hosting = m.hosting || m.companyType === "hosting";
  const typeBase = hosting ? 15 : m.companyType === "business" ? 10 : 0;
  let risk = penalties.length
    ? Math.max(...penalties.map((penalty) => penalty.score))
    : 0;
  if (typeBase > risk) risk = typeBase;
  const extras = [];
  if (
    m.registeredCc &&
    m.geoCc &&
    m.registeredCc.toUpperCase() !== m.geoCc.toUpperCase()
  ) {
    risk += 5;
    extras.push("注册国与定位国不一致");
  }
  if (String(m.rpkiStatus ?? "").toLowerCase() === "invalid") {
    risk += 10;
    extras.push("RPKI 验证无效");
  }
  risk = Math.min(100, Math.max(0, risk));
  const riskSources = Number.isInteger(m.riskSources) ? m.riskSources : 0;
  const scored = m.typeOnly === true || riskSources > 0;
  return {
    trust_score: scored ? 100 - risk : null,
    risk,
    confidence:
      riskSources >= 2 ? "high" : riskSources === 1 ? "medium" : "low",
    penalties,
    extras,
  };
}

/**
 * One IP-type verdict from per-source votes. Each source says what it sees:
 * ipapi.is reads the block's registered owner (company.type) and the ASN
 * type separately; proxycheck and AbuseIPDB classify the network.
 * - isp_hosted: the ASN is an ISP and at least one source sees a residential
 *   / ISP network, but the block is registered to a hosting company — the
 *   "ISP / native" VPS products sold as 家宽 VPS.
 * - residential / datacenter / mobile / business when sources agree.
 */
export function classifyIpType(votes) {
  const count = (type) => votes.filter((vote) => vote.type === type).length;
  if (count("mobile") > 0 && count("mobile") >= count("residential"))
    return "mobile";
  const homeLike = count("residential") + count("isp");
  const hosting = count("hosting");
  const asnIsp = votes.some(
    (vote) => vote.source === "asn" && vote.type === "isp",
  );
  if (hosting > 0 && homeLike > 0) return asnIsp ? "isp_hosted" : "mixed";
  if (hosting > 0) return "datacenter";
  if (count("residential") > 0) return "residential";
  if (count("isp") > 0) return "residential";
  if (count("business") > 0) return "business";
  return "unknown";
}

function normalizeType(value) {
  const text = String(value ?? "").toLowerCase();
  if (!text) return null;
  if (/mobile|cellular|wireless/.test(text)) return "mobile";
  if (
    /data ?center|hosting|web hosting|transit|content delivery|cdn/.test(text)
  )
    return "hosting";
  if (/residential|fixed line isp|home/.test(text)) return "residential";
  if (/^isp$|isp/.test(text)) return "isp";
  if (/business|commercial|education|government|university|banking/.test(text))
    return "business";
  return null;
}

function boolOr(...values) {
  return values.find((value) => typeof value === "boolean");
}

function textOr(...values) {
  return values.find((value) => typeof value === "string" && value);
}

function rangeFromPrefix(prefix) {
  const [base, lenStr] = prefix.split("/");
  const len = Number(lenStr);
  if (base.includes(":"))
    return { prefix: Number.isInteger(len) ? len : undefined };
  if (!Number.isInteger(len) || len < 0 || len > 32) return undefined;
  const first = ipv4ToInt(base);
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  const last = (first | ~mask) >>> 0;
  const toIp = (value) =>
    [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
  return {
    first: toIp(first & mask),
    last: toIp(last),
    count: 2 ** (32 - len),
    prefix: len,
  };
}

function sourceState(key, result, detail, failure) {
  if (result && detail) return { state: "ok", ...detail(result) };
  if (result) return { state: "ok" };
  if (!key) return { state: "skipped" };
  return failure
    ? { state: "unavailable", error: failure }
    : { state: "unavailable" };
}

export async function ipQuality(
  ip,
  env = {},
  requestOrigin = "https://ipquality.local",
) {
  ip = publicIp(ip);
  const failures = {};
  const keyed = (name, key, run) =>
    key
      ? Promise.resolve()
          .then(run)
          .catch((error) => {
            failures[name] =
              error instanceof HttpError
                ? `HTTP ${error.status}`
                : String(error?.message ?? error).slice(0, 80);
            return null;
          })
      : null;
  const [ipapi, proxycheck, abuse, origin, ptr, geo] = await Promise.all([
    keyed("ipapi_is", env.IPAPI_IS_KEY, () => fetchIpapi(ip, env.IPAPI_IS_KEY)),
    keyed("proxycheck", env.PROXYCHECK_KEY, () =>
      fetchProxycheck(ip, env.PROXYCHECK_KEY),
    ),
    keyed("abuseipdb", env.ABUSEIPDB_KEY, () =>
      fetchAbuseipdb(ip, env.ABUSEIPDB_KEY),
    ),
    cymruOrigin(ip).catch(() => null),
    ptrLookup(ip).catch(() => null),
    // ipwho.is blocks Cloudflare Worker egress, so fall back to ip.sb.
    geoIp(ip)
      .catch(() => secondaryGeo(ip))
      .catch(() => null),
  ]);
  const [asnInfo, rpki] = origin?.asn
    ? await Promise.all([
        cymruAsnInfo(origin.asn).catch(() => null),
        origin.prefix
          ? rpkiValidation(origin.prefix, origin.asn).catch(() => null)
          : null,
      ])
    : [null, null];

  // Without any keyed risk source, ip-api.com supplies a type-only fallback
  // (hosting/mobile). Its crude proxy bit never enters the score.
  let ipApi = null;
  if (!ipapi && !proxycheck && !abuse) {
    const response = await ipType(ip, requestOrigin).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    if (data?.available === true) ipApi = data;
  }

  const detections = proxycheck?.detections ?? {};
  const network = proxycheck?.network ?? {};
  const networkType = textOr(network.type)?.toLowerCase() ?? "";
  const companyType = textOr(
    typeof ipapi?.company === "object" ? ipapi.company.type : undefined,
    networkType === "hosting" ? "hosting" : networkType || undefined,
    ipApi?.hosting === true ? "hosting" : undefined,
  );
  const isDatacenter = boolOr(
    ipapi?.is_datacenter,
    typeof detections.hosting === "boolean" ? detections.hosting : undefined,
    abuse?.usageType?.includes("Data Center") ? true : undefined,
    ipApi?.hosting,
  );
  const isVpn = boolOr(ipapi?.is_vpn, detections.vpn);
  const isProxy = boolOr(
    ipapi?.is_proxy,
    detections.proxy,
    ipApi?.proxy && !ipApi.hosting ? true : undefined,
  );
  const isTor = boolOr(
    ipapi?.is_tor,
    detections.tor,
    typeof abuse?.isTor === "boolean" ? abuse.isTor : undefined,
  );
  const isCrawler = boolOr(ipapi?.is_crawler, detections.scraper);
  const isAbuser = boolOr(
    ipapi?.is_abuser,
    detections.compromised,
    Number.isFinite(abuse?.abuseConfidenceScore) &&
      abuse.abuseConfidenceScore >= 25
      ? true
      : undefined,
  );
  const isMobile = boolOr(ipapi?.is_mobile, ipApi?.mobile);
  const isPublicService =
    ipapi?.is_anycast === true ||
    PUBLIC_SERVICE_PREFIXES.some((prefix) => cidrMatch(ip, prefix)) ||
    undefined;

  const location = ipapi?.location ?? {};
  const geoCountryCode = textOr(
    location.country_code,
    geo?.country_code,
  )?.toUpperCase();
  const geoSources = [];
  if (ipapi && (location.country || location.city)) {
    geoSources.push({
      src: "ipapi.is",
      country: location.country,
      country_code: location.country_code,
      region: location.region,
      city: location.city,
      lat: typeof location.latitude === "number" ? location.latitude : null,
      lon: typeof location.longitude === "number" ? location.longitude : null,
    });
  }
  if (geo) {
    geoSources.push({
      src: geo.source,
      country: geo.country,
      country_code: geo.country_code,
      region: geo.region,
      city: geo.city,
      lat: typeof geo.latitude === "number" ? geo.latitude : null,
      lon: typeof geo.longitude === "number" ? geo.longitude : null,
    });
  }

  const typeVotes = [
    {
      source: "ipapi_is",
      raw: typeof ipapi?.company === "object" ? ipapi.company.type : undefined,
    },
    {
      source: "asn",
      raw: typeof ipapi?.asn === "object" ? ipapi.asn.type : undefined,
    },
    { source: "proxycheck", raw: network.type },
    { source: "abuseipdb", raw: abuse?.usageType },
    {
      source: "ip_api",
      raw: ipApi
        ? ipApi.mobile
          ? "mobile"
          : ipApi.hosting
            ? "hosting"
            : undefined
        : undefined,
    },
  ]
    .map((vote) => ({ ...vote, type: normalizeType(vote.raw) }))
    .filter((vote) => vote.type);
  const typeVerdict = classifyIpType(typeVotes);
  // Missing keyed sources make the type and score less certain; say so
  // instead of silently scoring higher.
  const keyedMissing = [
    ["ipapi_is", env.IPAPI_IS_KEY, ipapi],
    ["proxycheck", env.PROXYCHECK_KEY, proxycheck],
    ["abuseipdb", env.ABUSEIPDB_KEY, abuse],
  ]
    .filter(([, key, result]) => key && !result)
    .map(([name]) => name);

  const abuserScore =
    typeof ipapi?.company === "object" ? ipapi.company.abuser_score : undefined;
  const riskSources = [ipapi, proxycheck, abuse].filter(Boolean).length;
  const trust = computeTrust({
    tor: isTor === true,
    proxy: isProxy === true,
    compromised: detections.compromised === true,
    abuseConfidence: abuse?.abuseConfidenceScore,
    abuserLabelScore: abuserLabelScore(abuserScore),
    vpn: isVpn === true,
    vpnService: ipapi?.vpn?.service,
    pcRisk: detections.risk,
    pcConfidence: detections.confidence,
    pcFlagged: [
      detections.proxy,
      detections.vpn,
      detections.compromised,
      detections.scraper,
      detections.tor,
      detections.anonymous,
    ].some((flag) => flag === true),
    // ISP-hosted blocks carry the business baseline, not the datacenter one.
    hosting: typeVerdict === "datacenter",
    companyType: typeVerdict === "isp_hosted" ? "business" : companyType,
    registeredCc: origin?.cc,
    geoCc: geoCountryCode,
    rpkiStatus: rpki,
    riskSources,
    typeOnly: ipApi !== null,
  });

  const threats = trust.penalties.map((penalty) => ({
    label: penalty.label,
    severity:
      penalty.score >= 60 ? "high" : penalty.score >= 30 ? "medium" : "low",
  }));
  for (const extra of trust.extras)
    threats.push({ label: extra, severity: "low" });
  if (typeVerdict === "datacenter")
    threats.push({ label: "数据中心 IP", severity: "info" });
  if (typeVerdict === "isp_hosted")
    threats.push({
      label: "运营商段托管（网段登记在托管商名下）",
      severity: "info",
    });
  if (isPublicService === true)
    threats.push({ label: "公共 DNS / 任播服务", severity: "info" });

  const holder = asnInfo?.holder;
  return {
    ip,
    country: textOr(location.country, geo?.country),
    countryCode: textOr(location.country_code, geo?.country_code),
    region: textOr(location.region, geo?.region),
    city: textOr(location.city, geo?.city),
    isp: textOr(
      geo?.isp,
      typeof ipapi?.asn === "object" ? ipapi.asn.org : undefined,
    ),
    asn: Number.isInteger(origin?.asn)
      ? origin.asn
      : typeof ipapi?.asn === "object" && Number.isInteger(ipapi.asn.asn)
        ? ipapi.asn.asn
        : Number.isInteger(network.asn)
          ? network.asn
          : typeof network.asn === "string" && /^AS\d+$/i.test(network.asn)
            ? Number(network.asn.slice(2))
            : geo?.asn,
    asOrganization: textOr(
      typeof ipapi?.asn === "object" ? ipapi.asn.descr : undefined,
      holder,
      network.provider,
      geo?.isp,
    ),
    asname: asnInfo?.asname,
    asn_allocated: asnInfo?.allocated || undefined,
    rdns: ptr ?? undefined,
    is_bogon: ipapi?.is_bogon,
    ip_type: typeVerdict,
    type_votes: typeVotes.map(({ source, raw, type }) => ({
      source,
      raw: String(raw),
      type,
    })),
    sources_missing: keyedMissing.length ? keyedMissing : undefined,
    is_datacenter:
      typeVerdict === "datacenter"
        ? true
        : ["residential", "isp_hosted", "mobile"].includes(typeVerdict)
          ? false
          : isDatacenter,
    isResidential:
      typeVerdict === "residential"
        ? true
        : ["datacenter", "mobile", "isp_hosted"].includes(typeVerdict)
          ? false
          : undefined,
    is_vpn: isVpn,
    is_proxy: isProxy,
    is_tor: isTor,
    is_crawler: isCrawler,
    is_abuser: isAbuser,
    is_mobile: isMobile,
    is_public_service: isPublicService,
    company_type: companyType,
    company_name: textOr(
      typeof ipapi?.company === "object" ? ipapi.company.name : undefined,
      typeof ipapi?.company === "string" ? ipapi.company : undefined,
    ),
    abuser_score: abuserScore,
    datacenter_name: textOr(ipapi?.datacenter?.datacenter),
    cidr: origin?.prefix,
    range: origin ? rangeFromPrefix(origin.prefix) : undefined,
    asn_kind: companyType,
    rpki_status: rpki ?? undefined,
    registered_country_code: origin?.cc || undefined,
    registered_country: origin?.cc || undefined,
    geo_sources: geoSources.length ? geoSources : undefined,
    trust_score: isPublicService === true ? null : trust.trust_score,
    confidence: keyedMissing.length ? "low" : trust.confidence,
    sources_ok: [ipapi, proxycheck, abuse, origin, geo, ipApi].filter(Boolean)
      .length,
    source_detail: {
      ipapi_is: sourceState(
        env.IPAPI_IS_KEY,
        ipapi,
        (result) => ({
          abuser_score:
            typeof result?.company === "object"
              ? result.company.abuser_score
              : undefined,
          company_type:
            typeof result?.company === "object"
              ? result.company.type
              : undefined,
        }),
        failures.ipapi_is,
      ),
      proxycheck: sourceState(
        env.PROXYCHECK_KEY,
        proxycheck,
        (result) => ({
          risk: result?.detections?.risk,
          network_type: result?.network?.type,
        }),
        failures.proxycheck,
      ),
      abuseipdb: sourceState(
        env.ABUSEIPDB_KEY,
        abuse,
        (result) => ({
          abuse_confidence: result?.abuseConfidenceScore,
          reports: result?.totalReports,
        }),
        failures.abuseipdb,
      ),
      ip_api_fallback:
        ipapi || proxycheck || abuse
          ? { state: "skipped" }
          : ipApi
            ? {
                state: "ok",
                hosting: ipApi.hosting,
                mobile: ipApi.mobile,
              }
            : { state: "unavailable" },
      cymru: origin
        ? {
            state: "ok",
            asn: origin.asn,
            prefix: origin.prefix,
            rir: origin.rir,
          }
        : { state: "unavailable" },
      geo: geo ? { state: "ok", source: geo.source } : { state: "unavailable" },
    },
    intelligence: {
      threats,
      abuser_level:
        abuserLabelScore(abuserScore) === null
          ? undefined
          : abuserScore?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase(),
    },
  };
}
