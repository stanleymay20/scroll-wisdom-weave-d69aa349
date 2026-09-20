import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  enforceDurableRateLimit,
  json,
  preflight,
  requireUser,
  serverError,
  serviceClient,
  validateBody,
  z,
} from "../_shared/http.ts";
import {
  payoutMethodForStatus,
  payoutStatusFromAccount,
  payoutStatusMessage,
} from "../_shared/stripe-connect.ts";

/**
 * Stripe Connect onboarding for creators.
 *
 * Until now ScrollLibrary could take money and never send any: the payout
 * profile reserved 'stripe_connect' as a value, the settings page showed
 * "Coming soon", and the edge function accepted only 'unset' and 'manual'. A
 * creator could sell a book and had no way to be paid for it.
 *
 * Two operations:
 *   POST { action: "start" }   — create or reuse the creator's Express account
 *                                and return a Stripe-hosted onboarding link.
 *   POST { action: "refresh" } — re-read the account from Stripe and return
 *                                the current status; also used to recover from
 *                                an expired onboarding link.
 *
 * The account id is never accepted from the client and never returned to it.
 * The browser gets a status word, a sentence, and a URL to visit.
 */

const BodySchema = z.object({
  action: z.enum(["start", "refresh"]),
  /**
   * Where Stripe should send the creator when onboarding finishes or is
   * abandoned. Validated against the request's own origin below — an
   * attacker-supplied return URL is how an onboarding flow becomes a phishing
   * hop.
   */
  return_path: z.string().max(512).optional(),
});

/** Paths a completed or abandoned onboarding may return to. */
const ALLOWED_RETURN_PATHS = new Set([
  "/settings/payouts",
  "/payout-profile",
  "/creator/payouts",
]);

function safeReturnUrl(origin: string, path: string | undefined): string {
  const candidate = path && ALLOWED_RETURN_PATHS.has(path) ? path : "/payout-profile";
  return `${origin}${candidate}`;
}

function appOrigin(req: Request): string {
  // The onboarding link must come back to the app the creator started from.
  // Origin is set by the browser and cannot be spoofed by page script; a
  // missing one falls back to the configured site URL.
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/+$/, "");
  const configured = Deno.env.get("PUBLIC_SITE_URL") || "";
  return configured.replace(/\/+$/, "");
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const admin = serviceClient();

    // Creating Connect accounts is a Stripe-side write and an onboarding link
    // is a credential; neither should be obtainable in a loop.
    const limited = await enforceDurableRateLimit(admin, {
      name: "stripe-connect-onboarding",
      key: auth.userId,
      limit: 20,
      windowSec: 3600,
    });
    if (limited) return limited;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return serverError(new Error("STRIPE_SECRET_KEY not configured"), "stripe_misconfigured");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const origin = appOrigin(req);
    if (!origin) {
      return serverError(new Error("No app origin for return URL"), "origin_unresolved");
    }

    // The profile row is the server's record of this creator's payout state.
    const { data: existing, error: readError } = await admin
      .from("creator_payout_profiles")
      .select("user_id, payout_method, stripe_connect_account_id, stripe_connect_status, country_code")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (readError) return serverError(readError, "profile_read_failed");

    let accountId = existing?.stripe_connect_account_id ?? null;

    if (!accountId) {
      if (body.action === "refresh") {
        // Nothing to refresh yet; say so rather than creating an account as a
        // side effect of a status poll.
        return json({
          status: "not_started",
          message: payoutStatusMessage("not_started"),
          can_receive_payouts: false,
        });
      }

      const created = await stripe.accounts.create({
        type: "express",
        // Stripe infers the country from onboarding when it is not supplied;
        // passing a stale or guessed one is harder to correct afterwards than
        // letting the creator state it.
        ...(existing?.country_code ? { country: existing.country_code } : {}),
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: "Books published on ScrollLibrary" },
        metadata: { scrolllibrary_user_id: auth.userId },
      });
      accountId = created.id;

      // Persist before returning the link. If the creator completes onboarding
      // and this write had not happened, the webhook would arrive carrying an
      // account id belonging to nobody.
      const { error: writeError } = await admin
        .from("creator_payout_profiles")
        .upsert({
          user_id: auth.userId,
          stripe_connect_account_id: accountId,
          stripe_connect_status: "pending",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (writeError) return serverError(writeError, "profile_write_failed");
    }

    // Read the live account so the status reflects Stripe, not our last
    // webhook. Onboarding can complete while a webhook is delayed or lost.
    const account = await stripe.accounts.retrieve(accountId);
    const status = payoutStatusFromAccount(account);
    const payoutMethod = payoutMethodForStatus(status, existing?.payout_method ?? "unset");

    const { error: syncError } = await admin
      .from("creator_payout_profiles")
      .upsert({
        user_id: auth.userId,
        stripe_connect_account_id: accountId,
        stripe_connect_status: status,
        payout_method: payoutMethod,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (syncError) return serverError(syncError, "profile_sync_failed");

    // A verified account needs no onboarding link, and issuing one anyway
    // sends a finished creator back into a form.
    if (body.action === "refresh" || status === "verified") {
      return json({
        status,
        message: payoutStatusMessage(status),
        can_receive_payouts: status === "verified",
      });
    }

    const returnUrl = safeReturnUrl(origin, body.return_path);
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // Stripe calls refresh_url when its link has expired; pointing it back
      // at the app lets the page request a fresh one instead of dead-ending.
      refresh_url: returnUrl,
      return_url: returnUrl,
    });

    return json({
      status,
      message: payoutStatusMessage(status),
      can_receive_payouts: false,
      onboarding_url: link.url,
      expires_at: link.expires_at,
    });
  } catch (err) {
    return serverError(err, "connect_onboarding_failed");
  }
});
