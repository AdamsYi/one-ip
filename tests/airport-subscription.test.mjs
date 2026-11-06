import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchSubscription,
  parseUserinfo,
  subscriptionUrl,
} from "../public/worker/airport.js";

test("subscription URLs must be public http(s) links without embedded credentials", () => {
  assert.equal(subscriptionUrl(" https://sub.example.com/api?token=abc ").hostname, "sub.example.com");
  for (const bad of [
    "",
    "ftp://sub.example.com/x",
    "https://user:pass@sub.example.com/x",
    "http://127.0.0.1/sub",
    "http://10.0.0.8/sub",
    "http://[::1]/sub",
    "http://router.local/sub",
    "not a url",
  ])
    assert.throws(() => subscriptionUrl(bad), { status: 400 }, bad);
});

test("subscription-userinfo header parses plan usage and expiry", () => {
  assert.deepEqual(
    parseUserinfo("upload=28469303802; download=9225902938; total=64424509440; expire=1795181153"),
    { upload: 28469303802, download: 9225902938, total: 64424509440, expire: 1795181153 },
  );
  assert.equal(parseUserinfo(null), null);
  assert.equal(parseUserinfo("garbage"), null);
});

test("subscription fetch uses a client UA, re-validates redirects and rejects HTML", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push([String(url), init.headers["User-Agent"], init.redirect]);
    if (String(url).includes("/start"))
      return new Response(null, { status: 302, headers: { Location: "https://cdn.example.com/final" } });
    return new Response("proxies:\n  - {name: a}\n", {
      headers: { "subscription-userinfo": "upload=1; download=2; total=10; expire=99" },
    });
  });
  const data = await fetchSubscription({ url: "https://sub.example.com/start" });
  assert.equal(data.content, "proxies:\n  - {name: a}\n");
  assert.deepEqual(data.userinfo, { upload: 1, download: 2, total: 10, expire: 99 });
  assert.deepEqual(calls.map((call) => call[0]), ["https://sub.example.com/start", "https://cdn.example.com/final"]);
  assert.match(calls[0][1], /clash/);
  assert.equal(calls[0][2], "manual");

  t.mock.method(globalThis, "fetch", async () =>
    new Response(null, { status: 301, headers: { Location: "http://192.168.1.1/admin" } }),
  );
  await assert.rejects(fetchSubscription({ url: "https://sub.example.com/x" }), { status: 400 });

  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><title>login</title>"));
  await assert.rejects(fetchSubscription({ url: "https://sub.example.com/x" }), { status: 422 });

  t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 403 }));
  await assert.rejects(fetchSubscription({ url: "https://sub.example.com/x" }), { status: 502 });
});
