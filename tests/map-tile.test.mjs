import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../.worker-test/index.js";

test("tile proxy fetches OSM with an identifying UA and returns PNG", async (t) => {
  let seen;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    seen = { url: String(url), ua: init?.headers?.["User-Agent"] };
    return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
  });
  const response = await worker.fetch(
    new Request("https://example.com/api/map/tile/7/21/50.png"),
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(seen.url, "https://tile.openstreetmap.org/7/21/50.png");
  assert.match(seen.ua, /OneGlance/);
});

test("tile proxy rejects out-of-range or malformed tiles before fetching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  for (const path of ["/api/map/tile/2/4/0.png", "/api/map/tile/20/0/0.png", "/api/map/tile/a/b/c.png"])
    assert.equal(
      (await worker.fetch(new Request(`https://example.com${path}`), {})).status,
      404,
    );
});

test("tile proxy maps upstream failures to 502", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("blocked", { status: 403 }));
  const response = await worker.fetch(
    new Request("https://example.com/api/map/tile/3/4/3.png"),
    {},
  );
  assert.equal(response.status, 502);
});
