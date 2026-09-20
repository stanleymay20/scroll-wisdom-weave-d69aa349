/**
 * Shared-secret authorization for scheduler-invoked endpoints.
 *
 * A pg_cron worker cannot present a user JWT, so functions like
 * materialize-release-schedules are deployed with `verify_jwt = false`. That
 * setting is the whole of their access control: without it they are reachable
 * by anyone who knows the URL, while holding the service-role key and writing
 * to tables no user may touch.
 *
 * The obvious fix — demand a secret header — has a failure mode worse than the
 * hole it closes. These workers are scheduled outside the repository, so a
 * deploy that starts rejecting unsigned calls would silently stop whatever was
 * calling them, and for a release scheduler that means an author's chapters
 * quietly never going live.
 *
 * So the secret is enforced only once it exists. With no CRON_SECRET set the
 * endpoint behaves exactly as before and says so in its logs; setting the
 * variable — and adding the header wherever the job is scheduled — closes the
 * hole with no code change and no window where the worker is broken.
 */

export type CronAuthResult =
  | { status: "authorized"; verified: true }
  /** No secret is configured, so the request is allowed but unverified. */
  | { status: "unconfigured"; verified: false }
  | { status: "rejected"; verified: false; reason: "missing_secret" | "bad_secret" };

/** Header a scheduler presents the shared secret in. */
export const CRON_SECRET_HEADER = "x-cron-secret";

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * A plain `===` returns as soon as two bytes differ, so an attacker can
 * recover a secret one character at a time by measuring responses. The length
 * is not secret — it leaks through the response either way — so only the
 * contents are compared in constant time.
 */
export function secretsMatch(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < presented.length; i++) {
    difference |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * Decide whether a scheduler-invoked request may proceed.
 *
 * `expected` is the configured secret, or null/undefined/"" when none is set.
 * An all-whitespace value counts as unset: a half-filled environment variable
 * must not be mistaken for protection.
 */
export function authorizeCronRequest(
  headers: Headers,
  expected: string | null | undefined,
): CronAuthResult {
  const secret = (expected ?? "").trim();
  if (!secret) return { status: "unconfigured", verified: false };

  const presented = headers.get(CRON_SECRET_HEADER);
  if (!presented) return { status: "rejected", verified: false, reason: "missing_secret" };
  if (!secretsMatch(presented, secret)) {
    return { status: "rejected", verified: false, reason: "bad_secret" };
  }
  return { status: "authorized", verified: true };
}
