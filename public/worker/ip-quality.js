import { geoIp, secondaryGeo } from "./geo.js";
import { HttpError, publicIp, upstream } from "./http.js";
import { ipType } from "./ip-type.js";

// Aggregated IP reputation. Keyed sources (ipapi.is, proxycheck.io, AbuseIPDB)
// are skipped without their secret; keyless lookups (geo via ipwho.is with an
// ip.sb fallback, Team Cymru origin/ASN over DoH, PTR, RPKI via RIPEstat)
// always run. The result stays compatible with the legacy CoffeeIp shape
// consumed by src/views/ip/coffee.ts.

const ABUSER_LABEL_SCORE = {
  "very low": 0,
  low: 5,
  elevated: 30,
  high: 60,
  "very high": 85,
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

function expandIpv6(ip) {
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

async function ptrLookup(ip) {
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

async function cymruOrigin(ip) {
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

async function cymruAsnInfo(asn) {
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
  if (Number.isFinite(m.pcRisk) && m.pcRisk > 0) {
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
    hosting: isDatacenter === true,
    companyType,
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
  if (isDatacenter === true)
    threats.push({ label: "数据中心 IP", severity: "info" });
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
    is_datacenter: isDatacenter,
    isResidential:
      isDatacenter === true || isMobile === true
        ? false
        : companyType === "isp" || networkType === "residential"
          ? true
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
    confidence: trust.confidence,
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
