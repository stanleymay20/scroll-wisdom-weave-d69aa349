/**
 * Canonical Stripe customer identity helpers.
 *
 * Ownership is bound by auth user_id <-> billing_customer_links. Email is
 * carried to Stripe as contact data only and is never used to resolve account
 * ownership.
 */

type DbClient = any;
type StripeClient = any;

async function getLinkByUser(sc: DbClient, userId: string): Promise<string | null> {
  const { data, error } = await sc
    .from("billing_customer_links")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Billing customer lookup failed: ${error.message}`);
  return data?.stripe_customer_id ?? null;
}

async function getLinkByCustomer(sc: DbClient, customerId: string): Promise<string | null> {
  const { data, error } = await sc
    .from("billing_customer_links")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(`Billing user lookup failed: ${error.message}`);
  return data?.user_id ?? null;
}

async function insertLink(
  sc: DbClient,
  userId: string,
  customerId: string,
  source: string,
): Promise<string> {
  const { error } = await sc.from("billing_customer_links").insert({
    user_id: userId,
    stripe_customer_id: customerId,
    source,
  });

  if (!error) return customerId;

  // Concurrent creation/backfill can legitimately win the unique race. Read
  // both directions and accept only an exact same identity; never overwrite.
  if (error.code === "23505") {
    const byUser = await getLinkByUser(sc, userId);
    const byCustomer = await getLinkByCustomer(sc, customerId);

    if (byUser === customerId && byCustomer === userId) return customerId;
    if (byUser && byCustomer === null) return byUser;
  }

  throw new Error(`Billing customer link failed: ${error.message}`);
}

export async function getBillingCustomerId(
  sc: DbClient,
  userId: string,
): Promise<string | null> {
  return await getLinkByUser(sc, userId);
}

export async function ensureBillingCustomer(
  sc: DbClient,
  stripe: StripeClient,
  user: { id: string; email?: string | null },
  source: string,
): Promise<string> {
  const existing = await getLinkByUser(sc, user.id);
  if (existing) return existing;

  const customer = await stripe.customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { scrolllibrary_user_id: user.id },
  });

  try {
    const linked = await insertLink(sc, user.id, customer.id, source);
    if (linked !== customer.id) {
      // Another request created the canonical customer first. The customer we
      // just created has never been used by ScrollLibrary and can be retired.
      try {
        await stripe.customers.del(customer.id);
      } catch {
        // Best-effort cleanup; ownership remains safe because it was never linked.
      }
    }
    return linked;
  } catch (error) {
    try {
      await stripe.customers.del(customer.id);
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

export async function resolveUserIdForBillingCustomer(
  sc: DbClient,
  customerId: string,
): Promise<string | null> {
  const linked = await getLinkByCustomer(sc, customerId);
  if (linked) return linked;

  // Runtime compatibility for an old database that has not yet materialized
  // billing_customer_links. Both fallback sources are server-owned Stripe
  // authority tables. Stripe email and Stripe metadata are deliberately not
  // accepted as ownership evidence.
  const [{ data: plan, error: planError }, { data: creator, error: creatorError }] =
    await Promise.all([
      sc.from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle(),
      sc.from("creator_entitlements")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle(),
    ]);

  if (planError) {
    throw new Error(`Legacy plan customer lookup failed: ${planError.message}`);
  }
  if (creatorError) {
    throw new Error(`Legacy creator customer lookup failed: ${creatorError.message}`);
  }

  const candidates = [...new Set(
    [plan?.user_id, creator?.user_id].filter((value): value is string => Boolean(value)),
  )];

  if (candidates.length > 1) {
    throw new Error("BILLING_CUSTOMER_SHARED_ACROSS_USERS");
  }
  if (candidates.length === 0) return null;

  const userId = candidates[0];
  const byUser = await getLinkByUser(sc, userId);
  if (byUser && byUser !== customerId) {
    throw new Error("BILLING_CUSTOMER_ID_CONFLICT_FOR_USER");
  }

  await insertLink(sc, userId, customerId, "legacy_runtime_backfill");
  return userId;
}
