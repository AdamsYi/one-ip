import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { HttpError, target, upstream } from "./http.js";

export function subdomainTarget(value) {
  // Reject URL syntax before IDN conversion, which can otherwise normalize it.
  if (typeof value !== "string" || /[\s/:@%*?#\\]/.test(value.trim()))
    throw new HttpError(400, "请输入公网域名，不包含协议、路径或端口");
  const domain = domainToASCII(value.trim().replace(/\.$/, ""));
  if (isIP(domain))
    throw new HttpError(400, "请输入公网域名，不包含协议、路径或端口");
  return target(domain);
}

export function certificateNames(records, domain) {
  if (
    !Array.isArray(records) ||
    records.some((r) => !r || typeof r.name_value !== "string")
  )
    throw new HttpError(502, "证书日志数据格式异常");
  const names = new Set();
  for (const record of records) {
    for (const raw of record.name_value.split(/\r?\n/)) {
      const wildcard = raw.trim().startsWith("*.");
      let host;
      try {
        host = subdomainTarget(wildcard ? raw.trim().slice(2) : raw.trim());
      } catch {
        continue;
      }
      if (host.endsWith(`.${domain}`) || (wildcard && host === domain))
        names.add(`${wildcard ? "*." : ""}${host}`);
    }
  }
  return [...names].sort();
}

function hostSearchNames(text, domain) {
  const body = text.trim();
  if (
    /api (?:count|limit).*exceeded|rate limit|quota|too many requests/i.test(
      body,
    )
  )
    throw new HttpError(429, "外部数据源限流，请稍后重试");
  if (/^no (?:dns |host )?(?:records|results|hosts) found[.!]?$/i.test(body))
    return [];
  if (!body) throw new HttpError(502, "子域名数据格式异常");
  const records = body.split(/\r?\n/).map((line) => {
    const fields = line.split(",");
    if (fields.length !== 2 || !isIP(fields[1].trim()))
      throw new HttpError(502, "子域名数据格式异常");
    return { name_value: fields[0] };
  });
  return certificateNames(records, domain);
}

async function lookupHostSearch(domain) {
  const url = new URL("https://api.hackertarget.com/hostsearch/");
  url.searchParams.set("q", domain);
  const text = await upstream(
    url.href,
    {
      signal: AbortSignal.timeout(4500),
      cf: { cacheTtl: 300, cacheEverything: true },
    },
    250_000,
    "text",
  );
  return {
    source: "HackerTarget",
    sourceUrl: url.href,
    limit: 50,
    names: hostSearchNames(text, domain),
  };
}

async function lookupCertificates(domain) {
  const url = new URL("https://crt.sh/");
  url.searchParams.set("q", `%.${domain}`);
  url.searchParams.set("output", "json");
  const records = await upstream(
    url.href,
    {
      signal: AbortSignal.timeout(5500),
      cf: { cacheTtl: 300, cacheEverything: true },
    },
    8_000_000,
  );
  return {
    source: "crt.sh",
    sourceUrl: url.href,
    names: certificateNames(records, domain),
  };
}

export async function lookupSubdomains(value) {
  const domain = subdomainTarget(value);
  let empty;
  let limited = false;
  // Both attempts fit inside the browser client's 12-second request deadline.
  for (const lookup of [lookupHostSearch, lookupCertificates]) {
    try {
      const result = {
        domain,
        ...(await lookup(domain)),
        checkedAt: new Date().toISOString(),
      };
      if (result.names.length) return result;
      empty ??= result;
    } catch (error) {
      limited ||= error instanceof HttpError && error.status === 429;
    }
  }
  if (empty) return empty;
  throw new HttpError(
    limited ? 429 : 502,
    limited ? "外部数据源限流，请稍后重试" : "子域名数据源暂不可用，请稍后重试",
  );
}
