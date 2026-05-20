// Phase 2.1d.1 — First-touch attribution helpers.
// Holds the session id, captures first-touch UTM/referrer/landing path on the
// client, and exposes a small payload that checkout flows attach to Stripe
// metadata so we can join attribution_sessions → book_purchases server-side.

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "sl_session_id";
const FIRST_TOUCH_KEY = "sl_first_touch_v1";
const FIRED_KEY_PREFIX = "sl_attr_fired_v1:"; // per-path dedupe within session
const LAST_TAG_AT_KEY = "sl_attr_last_at"; // soft throttle on subsequent pings

export interface AttributionContext {
  session_id: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  referrer: string | null;
  landing_path: string | null;
}

export function getSessionId(): string {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "anon-" + Date.now().toString(36);
  }
}

function captureFromUrl(): AttributionContext {
  const url = new URL(window.location.href);
  const qp = url.searchParams;
  const ref = document.referrer || null;
  const refHost = (() => { try { return ref ? new URL(ref).hostname : null; } catch { return null; } })();
  const sameOrigin = refHost && refHost === window.location.hostname;

  const utm_source = qp.get("utm_source");
  const utm_medium = qp.get("utm_medium");
  const utm_campaign = qp.get("utm_campaign");
  const utm_term = qp.get("utm_term");
  const utm_content = qp.get("utm_content");

  let source = utm_source ?? null;
  let medium = utm_medium ?? null;
  if (!source) {
    if (!ref || sameOrigin) source = "direct";
    else if (refHost?.includes("google.")) { source = "google"; medium = medium ?? "organic"; }
    else if (refHost?.includes("twitter.") || refHost?.includes("x.com")) { source = "twitter"; medium = medium ?? "social"; }
    else if (refHost?.includes("facebook.")) { source = "facebook"; medium = medium ?? "social"; }
    else if (refHost?.includes("linkedin.")) { source = "linkedin"; medium = medium ?? "social"; }
    else { source = refHost ?? "referral"; medium = medium ?? "referral"; }
  }

  return {
    session_id: getSessionId(),
    source: source ?? "direct",
    medium,
    campaign: utm_campaign,
    term: utm_term,
    content: utm_content,
    referrer: ref,
    landing_path: url.pathname + (url.search || ""),
  };
}

/**
 * First-touch attribution: persisted in sessionStorage. Subsequent calls in
 * the same browser session return the same payload — never overwritten.
 */
export function getAttributionContext(): AttributionContext {
  try {
    const cached = sessionStorage.getItem(FIRST_TOUCH_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as AttributionContext;
      // Make sure session_id is fresh-tied to current sessionStorage.
      parsed.session_id = getSessionId();
      return parsed;
    }
    const fresh = captureFromUrl();
    sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return captureFromUrl();
  }
}

/** Has the beacon for this exact path already fired this session? */
function alreadyFired(path: string): boolean {
  try { return sessionStorage.getItem(FIRED_KEY_PREFIX + path) === "1"; } catch { return false; }
}
function markFired(path: string): void {
  try { sessionStorage.setItem(FIRED_KEY_PREFIX + path, "1"); } catch { /* ignore */ }
}

/** Soft throttle so we don't hammer the edge function on quick route changes. */
function recentlyTagged(): boolean {
  try {
    const ts = parseInt(sessionStorage.getItem(LAST_TAG_AT_KEY) ?? "0", 10);
    return Date.now() - ts < 5000;
  } catch { return false; }
}
function markTagged(): void {
  try { sessionStorage.setItem(LAST_TAG_AT_KEY, String(Date.now())); } catch { /* ignore */ }
}

/**
 * Fire-and-forget call to attribution-tag.
 * - First call per session inserts the first-touch row.
 * - Subsequent calls only bump last_seen_at + events_count server-side.
 */
export async function tagAttribution(extra?: { listing_id?: string | null; book_id?: string | null }): Promise<void> {
  try {
    const path = (extra?.listing_id ? `L:${extra.listing_id}` : extra?.book_id ? `B:${extra.book_id}` : window.location.pathname);
    if (alreadyFired(path) && recentlyTagged()) return;
    markFired(path);
    markTagged();

    const ctx = getAttributionContext();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("attribution-tag", {
      body: {
        session_id: ctx.session_id,
        user_id: user?.id ?? null,
        source: ctx.source,
        medium: ctx.medium ?? undefined,
        campaign: ctx.campaign ?? undefined,
        term: ctx.term ?? undefined,
        content: ctx.content ?? undefined,
        referrer: ctx.referrer ?? undefined,
        landing_path: ctx.landing_path ?? undefined,
        user_agent_family: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : undefined,
        // Server ignores these; included only so the beacon can carry context
        // through edge function logs for debugging.
        listing_id: extra?.listing_id ?? null,
        book_id: extra?.book_id ?? null,
      },
    });
  } catch {
    /* swallow — analytics never breaks UX */
  }
}
