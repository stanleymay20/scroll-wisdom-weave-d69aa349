import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/stripe-webhook/index.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const i = source.indexOf(needle);
  if (i < 0) throw new Error(`${label}: source pattern not found`);
  if (source.indexOf(needle, i + needle.length) >= 0) throw new Error(`${label}: source pattern not unique`);
  source = source.slice(0, i) + replacement + source.slice(i + needle.length);
}

replaceOnce(
`    type ValidPlan = "free" | "premium" | "prophet_tier" | "student";
    const getTierFromProductId = (productId: string): ValidPlan => {
      const productMap: Record<string, ValidPlan> = {
        prod_TaQU3ILEUpbXOT: "premium",
        prod_U0fmlf14TPlMKj: "prophet_tier", // current Institutional product
        prod_TaQWA7MSUntiMy: "prophet_tier", // legacy Institutional product
        prod_TaQSrotoUkTuPC: "student",
      };
      return productMap[productId] || "free";
    };
`,
`    type ValidPlan = "free" | "premium" | "prophet_tier" | "student";
    type PaidPlan = Exclude<ValidPlan, "free">;
    const getPlanTierFromProductId = (productId: string | null | undefined): PaidPlan | null => {
      const productMap: Record<string, PaidPlan> = {
        prod_TaQU3ILEUpbXOT: "premium",
        prod_U0fmlf14TPlMKj: "prophet_tier", // current Institutional product
        prod_TaQWA7MSUntiMy: "prophet_tier", // legacy Institutional product
        prod_TaQSrotoUkTuPC: "student",
      };
      return productId ? productMap[productId] ?? null : null;
    };
`,
"plan product mapping",
);

replaceOnce(
`      // Only sync if this is a creator-tier product OR the subscription is canceled
      // (so we downgrade entitlements on cancel of any sub the user previously had).
      if (creatorTier === "free" && subscription.status === "active") return;
`,
`      // Generation-plan and creator subscriptions are independent authority
      // domains. Never revoke creator entitlement because an unrelated plan was
      // canceled or updated.
      if (creatorTier === "free") return;
`,
"creator entitlement domain guard",
);

replaceOnce(
`    const updateProfilePlan = async (authUserId: string, plan: ValidPlan) => {
      const { error } = await supabase.from("profiles")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("user_id", authUserId);
      if (error) logStep("Error updating profile plan", { error: error.message });
      return error;
    };
`,
`    const updateProfilePlan = async (authUserId: string, plan: ValidPlan) => {
      const { error } = await supabase.from("profiles")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("user_id", authUserId);
      if (error) logStep("Error updating profile plan", { error: error.message });
      return error;
    };

    const syncPlanSubscription = async (
      userId: string,
      subscription: Stripe.Subscription,
      tier: ValidPlan,
    ) => {
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
      const productId = subscription.items.data[0]?.price?.product as string | undefined;
      if (!getPlanTierFromProductId(productId)) return;
      const { error } = await supabase.from("subscriptions").upsert({
        user_id: userId,
        tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : null,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) logStep("Plan subscription sync failed", { userId, status: subscription.status });
    };
`,
"plan subscription sync helper",
);

replaceOnce(
`    const findUserByEmail = async (email: string) => {
      const { data: users, error } = await supabase.auth.admin.listUsers();
      if (error || !users?.users) return null;
      return users.users.find((u) => u.email === email) || null;
    };
`,
`    const findUserByEmail = async (email: string) => {
      const { data: users, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error || !users?.users) return null;
      return users.users.find((u) => u.email === email) || null;
    };

    const findUserIdByCustomer = async (customerId: string): Promise<string | null> => {
      const { data: linked } = await supabase.from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (linked?.user_id) return linked.user_id;

      const customer = await stripe.customers.retrieve(customerId);
      if (!customer || customer.deleted || !("email" in customer) || !customer.email) return null;
      return (await findUserByEmail(customer.email))?.id ?? null;
    };
`,
"customer identity helper",
);

replaceOnce(
`            const productId = subscription.items.data[0]?.price?.product as string;
            const tier = getTierFromProductId(productId);
            const customerEmail = session.customer_email;
            if (customerEmail) {
              const user = await findUserByEmail(customerEmail);
              if (user) {
                await updateProfilePlan(user.id, tier);
                await syncCreatorEntitlement(user.id, subscription);
                await logFinancialEvent(supabase, {
                  event_type: "subscription_started", severity: "info", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, user_id: user.id, payload: { tier, product_id: productId },
                });
              }
            }
`,
`            const productId = subscription.items.data[0]?.price?.product as string;
            const planTier = getPlanTierFromProductId(productId);
            const metadataUserId = session.metadata?.userId || null;
            const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;
            const userId = metadataUserId || (customerEmail ? (await findUserByEmail(customerEmail))?.id ?? null : null);
            if (userId) {
              if (planTier) {
                await updateProfilePlan(userId, planTier);
                await syncPlanSubscription(userId, subscription, planTier);
              }
              await syncCreatorEntitlement(userId, subscription);
              await logFinancialEvent(supabase, {
                event_type: "subscription_started", severity: "info", actor: "webhook",
                correlation_id: corr, stripe_event_id: event.id, user_id: userId,
                payload: { plan_tier: planTier, creator_tier: getCreatorTierFromProductId(productId), product_id: productId },
              });
            }
`,
"checkout subscription identity",
);

replaceOnce(
`            const productId = subscription.items.data[0]?.price?.product as string;
            const tier = getTierFromProductId(productId);
            const customer = await stripe.customers.retrieve(invoice.customer as string);
            if (customer && !customer.deleted && "email" in customer && customer.email) {
              const user = await findUserByEmail(customer.email);
              if (user) {
                await updateProfilePlan(user.id, tier);
                await syncCreatorEntitlement(user.id, subscription);
              }
            }
`,
`            const productId = subscription.items.data[0]?.price?.product as string;
            const planTier = getPlanTierFromProductId(productId);
            const userId = await findUserIdByCustomer(invoice.customer as string);
            if (userId) {
              if (planTier) {
                await updateProfilePlan(userId, planTier);
                await syncPlanSubscription(userId, subscription, planTier);
              }
              await syncCreatorEntitlement(userId, subscription);
            }
`,
"invoice paid subscription sync",
);

replaceOnce(
`          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = subscription.status === "active" ? getTierFromProductId(productId) : "free";
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (customer && !customer.deleted && "email" in customer && customer.email) {
            const user = await findUserByEmail(customer.email);
            if (user) {
              await updateProfilePlan(user.id, tier);
              await syncCreatorEntitlement(user.id, subscription);
            }
          }
`,
`          const productId = subscription.items.data[0]?.price?.product as string;
          const planTier = getPlanTierFromProductId(productId);
          const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          const userId = await findUserIdByCustomer(customerId);
          if (userId) {
            if (planTier) {
              const effectivePlan: ValidPlan = subscription.status === "active" ? planTier : "free";
              await updateProfilePlan(userId, effectivePlan);
              await syncPlanSubscription(userId, subscription, effectivePlan);
            }
            await syncCreatorEntitlement(userId, subscription);
          }
`,
"subscription updated domain separation",
);

replaceOnce(
`          const subscription = event.data.object as Stripe.Subscription;
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (customer && !customer.deleted && "email" in customer && customer.email) {
            const user = await findUserByEmail(customer.email);
            if (user) {
              await updateProfilePlan(user.id, "free");
              // Force-revoke creator entitlement (sub object reflects canceled status)
              await syncCreatorEntitlement(user.id, { ...subscription, status: "canceled" } as Stripe.Subscription);
            }
          }
`,
`          const subscription = event.data.object as Stripe.Subscription;
          const productId = subscription.items.data[0]?.price?.product as string;
          const planTier = getPlanTierFromProductId(productId);
          const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          const userId = await findUserIdByCustomer(customerId);
          if (userId) {
            if (planTier) {
              await updateProfilePlan(userId, "free");
              await syncPlanSubscription(userId, { ...subscription, status: "canceled" } as Stripe.Subscription, "free");
            }
            await syncCreatorEntitlement(userId, { ...subscription, status: "canceled" } as Stripe.Subscription);
          }
`,
"subscription deleted domain separation",
);

if (source.includes("getTierFromProductId")) throw new Error("legacy plan mapper still referenced");
await writeFile(path, source);
console.log("Stripe subscription authority domains separated.");
