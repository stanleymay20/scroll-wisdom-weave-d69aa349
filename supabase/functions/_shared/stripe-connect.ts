/**
 * Mapping between a Stripe Connect account and a creator's payout status.
 *
 * ScrollLibrary stores five states — not_started, pending, verified,
 * restricted, disabled — while Stripe reports an account through several
 * independent signals: whether payouts are enabled, whether charges are,
 * whether onboarding was submitted, and what the requirements object is
 * currently asking for and by when.
 *
 * Collapsing those into one word is the only decision in this file, and it is
 * the decision that determines whether a person gets paid, so it lives here as
 * a pure function rather than inline in a webhook handler that cannot be run
 * in CI. The rule is deliberately pessimistic: a state is only 'verified' when
 * Stripe says payouts are enabled AND nothing is overdue or disabling the
 * account. Reporting "verified" to a creator who cannot actually be paid is a
 * worse failure than making them look again at an onboarding form.
 */

export type PayoutStatus = 'not_started' | 'pending' | 'verified' | 'restricted' | 'disabled';

/** The subset of a Stripe Account this decision depends on. */
export interface StripeAccountSignals {
  payouts_enabled?: boolean | null;
  charges_enabled?: boolean | null;
  details_submitted?: boolean | null;
  requirements?: {
    disabled_reason?: string | null;
    currently_due?: string[] | null;
    past_due?: string[] | null;
    pending_verification?: string[] | null;
  } | null;
}

function nonEmpty(list: string[] | null | undefined): boolean {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Decide a creator's payout status from a Stripe account.
 *
 * Order matters: the checks run from most severe to least, because Stripe can
 * report several at once — an account can have payouts_enabled true while a
 * disabled_reason is set and a deadline has passed, and the answer there is
 * not "verified".
 */
export function payoutStatusFromAccount(account: StripeAccountSignals | null | undefined): PayoutStatus {
  if (!account) return 'not_started';

  const requirements = account.requirements ?? {};
  const disabledReason = requirements.disabled_reason ?? null;

  // Stripe has turned the account off. `rejected.*` reasons are terminal;
  // everything else under a disabled_reason is recoverable by the creator
  // supplying what is being asked for, which is 'restricted', not 'disabled'.
  if (disabledReason) {
    return disabledReason.startsWith('rejected') ? 'disabled' : 'restricted';
  }

  // Something was due and the deadline has passed. Stripe may not have flipped
  // payouts off yet, but it will, and telling the creator they are fine until
  // it does is how a payout fails silently.
  if (nonEmpty(requirements.past_due)) return 'restricted';

  // Nothing has been started: no onboarding submitted and nothing outstanding.
  if (!account.details_submitted && !nonEmpty(requirements.currently_due)) {
    return 'not_started';
  }

  if (account.payouts_enabled === true) {
    // Payouts work now, but Stripe is still asking for something. That is a
    // future restriction, not a present one, and the creator should see it
    // while it is still cheap to fix.
    if (nonEmpty(requirements.currently_due)) return 'restricted';
    return 'verified';
  }

  // Onboarding submitted and Stripe is checking, or still collecting.
  return 'pending';
}

/**
 * Whether a creator in this state can actually be paid.
 *
 * Kept separate from the status word so that no caller has to remember which
 * of five strings mean "yes". Only one does.
 */
export function canReceivePayouts(status: PayoutStatus): boolean {
  return status === 'verified';
}

/**
 * A short, honest explanation for the creator.
 *
 * Written to be shown as-is in the payout settings page: it says what is true
 * and what to do, without repeating Stripe's requirement identifiers, which
 * are internal strings like `individual.verification.document`.
 */
export function payoutStatusMessage(status: PayoutStatus): string {
  switch (status) {
    case 'verified':
      return 'Your payout account is active. Earnings will be sent to it.';
    case 'pending':
      return 'Stripe is reviewing your details. This usually takes a few minutes, occasionally a day or two.';
    case 'restricted':
      return 'Stripe needs more information before it can pay you. Continue onboarding to provide it.';
    case 'disabled':
      return 'Stripe cannot pay out to this account. Contact support so we can help you sort it out.';
    case 'not_started':
    default:
      return 'Connect a payout account to receive your earnings.';
  }
}

/**
 * The payout_method a profile should carry for a given status.
 *
 * A creator is only recorded as taking Stripe payouts once Stripe will
 * actually make them; before that the profile keeps whatever it had, so a
 * half-finished onboarding does not present as a configured payout route.
 */
export function payoutMethodForStatus(
  status: PayoutStatus,
  current: string,
): string {
  // Keeping `current` covers both remaining cases: a creator who has not
  // finished onboarding keeps whatever they had, and one who was already on
  // stripe_connect stays there rather than being quietly rerouted to a manual
  // process they never asked for because verification lapsed.
  return status === 'verified' ? 'stripe_connect' : current;
}
