import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeCronRequest, CRON_SECRET_HEADER, secretsMatch } from "./cron-auth.ts";

function headers(secret?: string): Headers {
  const h = new Headers();
  if (secret !== undefined) h.set(CRON_SECRET_HEADER, secret);
  return h;
}

// ---------------------------------------------------------------------------
// The property that makes this safe to deploy: with no secret configured,
// behaviour is exactly what it was before.
// ---------------------------------------------------------------------------

Deno.test("no configured secret leaves the endpoint open, and says so", () => {
  for (const expected of [null, undefined, "", "   ", "\t\n"]) {
    const result = authorizeCronRequest(headers(), expected);
    assertEquals(result.status, "unconfigured", JSON.stringify(expected));
    assertEquals(result.verified, false);
  }
});

Deno.test("a half-filled environment variable is not mistaken for protection", () => {
  // "   " must not authorize a request presenting "   ".
  const result = authorizeCronRequest(headers("   "), "   ");
  assertEquals(result.status, "unconfigured");
  assertEquals(result.verified, false);
});

// ---------------------------------------------------------------------------
// Once configured, it is enforced.
// ---------------------------------------------------------------------------

Deno.test("the right secret authorizes", () => {
  const result = authorizeCronRequest(headers("s3cr3t"), "s3cr3t");
  assertEquals(result.status, "authorized");
  assertEquals(result.verified, true);
});

Deno.test("a missing header is rejected once a secret is configured", () => {
  const result = authorizeCronRequest(headers(), "s3cr3t");
  assertEquals(result.status, "rejected");
  assert(result.status === "rejected" && result.reason === "missing_secret");
});

Deno.test("a wrong secret is rejected", () => {
  for (const presented of ["", "wrong", "s3cr3", "S3CR3T", "s3cr3tt", "s3cr3t!"]) {
    const result = authorizeCronRequest(headers(presented), "s3cr3t");
    assertEquals(result.status, "rejected", `presented ${JSON.stringify(presented)}`);
    assertEquals(result.verified, false);
  }
});

Deno.test("surrounding whitespace never decides the outcome", () => {
  // The Headers API trims header values per the fetch spec, and the configured
  // value is trimmed here, so a stray newline in the dashboard's environment
  // variable cannot lock out the scheduler — and padding cannot let anyone in.
  assertEquals(authorizeCronRequest(headers("s3cr3t"), " s3cr3t\n").status, "authorized");
  assertEquals(authorizeCronRequest(headers("  s3cr3t  "), "s3cr3t").status, "authorized");
  assertEquals(authorizeCronRequest(headers("  wrong  "), "s3cr3t").status, "rejected");
});

Deno.test("the header name is matched case-insensitively", () => {
  // Headers are case-insensitive by spec; this guards the lookup, not the spec.
  const h = new Headers();
  h.set("X-Cron-Secret", "s3cr3t");
  assertEquals(authorizeCronRequest(h, "s3cr3t").status, "authorized");
});

// ---------------------------------------------------------------------------
// secretsMatch
// ---------------------------------------------------------------------------

Deno.test("secretsMatch agrees with equality on ordinary input", () => {
  const cases: Array<[string, string]> = [
    ["", ""],
    ["a", "a"],
    ["a", "b"],
    ["abc", "abd"],
    ["abc", "abcd"],
    ["abcd", "abc"],
    ["🔐", "🔐"],
    ["🔐", "🔑"],
  ];
  for (const [a, b] of cases) {
    assertEquals(secretsMatch(a, b), a === b, `${a} vs ${b}`);
  }
});

Deno.test("secretsMatch examines every character of an equal-length secret", () => {
  // The point of the constant-time loop: a difference in the final character
  // must be caught, not short-circuited past.
  assertEquals(secretsMatch("aaaaaaaaab", "aaaaaaaaaa"), false);
  assertEquals(secretsMatch("baaaaaaaaa", "aaaaaaaaaa"), false);
  assertEquals(secretsMatch("aaaaaaaaaa", "aaaaaaaaaa"), true);
});
