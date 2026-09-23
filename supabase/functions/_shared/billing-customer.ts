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
  stripe: StripeClient,
  customerId: string,
): Promise<string | null> {
  const linked = await getLinkByCustomer(sc, customerId);
  if (linked) return linked;

  // Compatibility path for old Stripe customers created before the canonical
  // DB link existed. Only immutable application identity metadata is accepted;
  // customer email is deliberately ignored.
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return null;

  const metadataUserId = customer.metadata?.scrolllibrary_user_id;
  if (!metadataUserId) return null;

  const { data: userData, error: userError } =
    await sc.auth.admin.getUserById(metadataUserId);
  if (userError || !userData?.user?.id) return null;

  const byUser = await getLinkByUser(sc, metadataUserId);
  if (byUser && byUser !== customerId) {
    throw new Error("BILLING_CUSTOMER_ID_CONFLICT_FOR_USER");
  }

  return await insertLink(
    sc,
    metadataUserId,
    customerId,
    "stripe_customer_metadata_backfill",
  ).then(() => metadataUserId);
}
