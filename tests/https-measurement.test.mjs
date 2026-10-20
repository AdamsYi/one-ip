import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../.worker-test/index.js";
import {
  mockPingVerification,
  pingVerification,
  pingVerificationEnv,
} from "./ping-verification-fixture.mjs";

async function startPing(input) {
  const response = await worker.fetch(
    new Request("https://tools.example.com/api/ping/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, verification: pingVerification }),
    }),
    { APP_ENV: "prod", ...pingVerificationEnv },
  );
  if (!response.ok)
    throw Object.assign(new Error(String(response.status)), {
      status: response.status,
    });
  return response.json();
}

test("HTTPS measurements are fixed-port HEAD requests and do not alter ICMP defaults", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = mockPingVerification(async (url, init) => {
      assert.equal(url, "https://api.globalping.io/v1/measurements");
      requests.push(JSON.parse(init.body));
      return Response.json({ id: "measurement-123" });
    });
    await startPing({
      host: "1.1.1.1",
      protocol: "https",
      regions: ["AS", "EU", "NA"],
      perRegion: 1,
    });
    assert.equal(requests[0].type, "http");
    assert.deepEqual(requests[0].measurementOptions, {
      protocol: "HTTPS",
      port: 443,
      request: { method: "HEAD", path: "/" },
    });
    await startPing({ host: "1.1.1.1", regions: ["AS"], perRegion: 1 });
    assert.equal(requests[1].type, "ping");
    assert.equal(requests[1].measurementOptions.packets, 3);
    await assert.rejects(
      () =>
        startPing({
          host: "127.0.0.1",
          protocol: "https",
          regions: ["AS"],
          perRegion: 1,
        }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () =>
        startPing({
          host: "1.1.1.1",
          protocol: "ssh",
          regions: ["AS"],
          perRegion: 1,
        }),
      (error) => error.status === 400,
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
