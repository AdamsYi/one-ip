import assert from "node:assert/strict";

export const pingVerification = {
  provider: "turnstile",
  token: "ping-test-token",
};
export const pingVerificationEnv = {
  TURNSTILE_SITE_KEY: "ping-test-sitekey",
  TURNSTILE_SECRET: "ping-test-secret",
  TURNSTILE_HOSTNAMES: "tools.example.com",
};

export function mockPingVerification(fetchUpstream) {
  return async (url, options) => {
    if (url !== "https://challenges.cloudflare.com/turnstile/v0/siteverify")
      return fetchUpstream(url, options);
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.method, "POST");
    assert.ok(options.body instanceof URLSearchParams);
    assert.deepEqual(Object.fromEntries(options.body), {
      secret: pingVerificationEnv.TURNSTILE_SECRET,
      response: pingVerification.token,
    });
    return Response.json({
      success: true,
      hostname: pingVerificationEnv.TURNSTILE_HOSTNAMES,
      action: "ping_start",
    });
  };
}
