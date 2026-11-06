import { HttpError, boundedText, target } from "./http.js";

// Opt-in server-side subscription fetch for the airport audit. Browsers cannot
// read most subscription links because panels send no CORS headers. The link
// is used for this one request only: it is never cached, stored or logged.
const SUBSCRIPTION_UA = "clash-verge/v2.2.0";
const MAX_SUBSCRIPTION_BYTES = 3_000_000;

export function parseUserinfo(header) {
  if (typeof header !== "string" || !header) return null;
  const values = {};
  for (const part of header.split(";")) {
    const [key, value] = part.split("=").map((item) => item?.trim());
    const number = Number(value);
    if (["upload", "download", "total", "expire"].includes(key))
      values[key] = Number.isFinite(number) && number >= 0 ? number : null;
  }
  return Object.keys(values).length ? values : null;
}

export function subscriptionUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new HttpError(400, "请输入有效的订阅链接");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new HttpError(400, "订阅链接只支持 http 或 https");
  if (url.username || url.password)
    throw new HttpError(400, "订阅链接不能包含账号密码");
  // Reuses the public-host validation: rejects private, loopback and
  // reserved addresses as well as local-only domains.
  target(url.hostname.replace(/^\[|\]$/g, ""));
  return url;
}

export async function fetchSubscription(input) {
  let url = subscriptionUrl(input?.url);
  let response;
  // Follow redirects by hand so every hop passes the public-host check.
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(url, {
        headers: { "User-Agent": SUBSCRIPTION_UA, Accept: "*/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new HttpError(502, "订阅服务器连接失败或超时");
    }
    const location = response.headers.get("Location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    await response.body?.cancel();
    if (hop >= 3) throw new HttpError(502, "订阅链接重定向次数过多");
    url = subscriptionUrl(new URL(location, url).href);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(502, `订阅服务器返回错误 (${response.status})`);
  }
  const content = await boundedText(response, MAX_SUBSCRIPTION_BYTES);
  // Keep this from acting as a generic page proxy: subscriptions are base64,
  // URI lists, YAML or JSON, never HTML documents.
  if (/^\s*<(?:!doctype|html|head|body)/i.test(content))
    throw new HttpError(422, "链接返回的是网页而不是订阅内容");
  return {
    content,
    userinfo: parseUserinfo(response.headers.get("subscription-userinfo")),
  };
}
