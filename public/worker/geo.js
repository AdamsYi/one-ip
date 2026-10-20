import { publicIp, upstream } from "./http.js";

function matchesIp(value, ip) {
  try {
    return publicIp(value) === ip;
  } catch {
    return false;
  }
}

export function cfGeo(request) {
  const cf = request.cf ?? {};
  return {
    ip: request.headers.get("CF-Connecting-IP") ?? "",
    country: cf.country,
    country_code: cf.country,
    region: cf.region,
    city: cf.city,
    isp: cf.asOrganization,
    asn: cf.asn,
    latitude: cf.latitude ? Number(cf.latitude) : undefined,
    longitude: cf.longitude ? Number(cf.longitude) : undefined,
    timezone: cf.timezone,
    source: "Cloudflare request.cf",
  };
}
export async function geoIp(ip) {
  ip = publicIp(ip);
  const data = await upstream(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!data?.success || !matchesIp(data.ip, ip))
    throw new Error("IP 归属地数据源未返回有效结果");
  return {
    ip: data.ip,
    country: data.country,
    country_code: data.country_code,
    region: data.region,
    city: data.city,
    isp: data.connection?.isp,
    asn: data.connection?.asn,
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone?.id,
    source: "ipwho.is",
  };
}
export async function secondaryGeo(ip) {
  ip = publicIp(ip);
  const data = await upstream(
    `https://api.ip.sb/geoip/${encodeURIComponent(ip)}`,
  );
  if (!matchesIp(data?.ip, ip)) throw new Error("第二归属地数据源未返回结果");
  return {
    ip: data.ip,
    country: data.country,
    country_code: data.country_code,
    city: data.city,
    isp: data.isp,
    asn: data.asn,
    latitude: data.latitude,
    longitude: data.longitude,
    source: "ip.sb",
  };
}
