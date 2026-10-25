import assert from "node:assert/strict";
import { test } from "node:test";
import { datacenter } from "../public/worker/datacenter.js";

const dnsResponse = (answers) => Response.json({ Status: 0, Answer: answers });
const txt = (record) => ({ type: 16, TTL: 14400, data: `"${record}"` });

function originRouter({ asn, prefix, ptr } = {}) {
  return async (url) => {
    url = String(url);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      if (name.endsWith(".origin.asn.cymru.com"))
        return dnsResponse([
          txt(`${asn} | ${prefix} | US | arin | 2018-01-25`),
        ]);
      if (name.startsWith("AS"))
        return dnsResponse([
          txt(
            `${asn} | US | arin | 2013-01-15 | IT7NET - IT7 Networks Inc, US`,
          ),
        ]);
      return ptr
        ? dnsResponse([{ type: 12, data: ptr }])
        : dnsResponse([]);
    }
    return Response.json({});
  };
}

test("datacenter matches by ASN and reports the catalog entry", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    originRouter({ asn: 25820, prefix: "95.169.0.0/20", ptr: "95.169.12.201.16clouds.com." }),
  );
  const data = await datacenter("95.169.12.201");
  assert.equal(data.known, true);
  assert.equal(data.method, "asn");
  assert.equal(data.brand, "BandwagonHost");
  assert.ok(data.aliases.includes("搬瓦工"));
  assert.equal(data.cost_tier, "premium");
  assert.ok(data.roles.includes("落地"));
  assert.equal(data.asn, 25820);
  assert.equal(data.rdns, "95.169.12.201.16clouds.com");
});

test("datacenter falls back to rDNS patterns when ASN is uncatalogued", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    originRouter({
      asn: 20473, // AS20473 is catalogued, but the PTR should win the brand even without it
      prefix: "45.79.0.0/15",
      ptr: "li172-104-10-20.members.linode.com.",
    }),
  );
  // Simulate the uncatalogued path by forcing ASN mismatch: 63949 is in the
  // catalog, so use a fresh ASN not in datacenters.json.
  t.mock.method(globalThis, "fetch", async (url) => {
    url = String(url);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      const name = new URL(url).searchParams.get("name");
      if (name.endsWith(".origin.asn.cymru.com"))
        return dnsResponse([txt("400644 | 45.79.0.0/16 | US | arin | 2018-01-25")]);
      if (name.startsWith("AS"))
        return dnsResponse([txt("400644 | US | arin | 2018-01-25 | EXAMPLE - Example Net, US")]);
      return dnsResponse([{ type: 12, data: "172-104-10-20.ip.linodeusercontent.com." }]);
    }
    return Response.json({});
  });
  const data = await datacenter("172.104.10.20");
  assert.equal(data.known, true);
  assert.equal(data.method, "rdns");
  assert.equal(data.brand, "Linode/Akamai");
  assert.equal(data.cost_tier, "budget");
});

test("datacenter reports unknown entries with ASN context", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    originRouter({ asn: 64512, prefix: "203.0.113.0/24", ptr: "nope.example.com." }),
  );
  const data = await datacenter("203.0.113.10");
  assert.equal(data.known, false);
  assert.equal(data.asn, 64512);
});
