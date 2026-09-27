import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invoiceSubscriptionId, subscriptionPeriod } from "./stripe-fields.ts";

const T0 = 1_790_000_000; // 2026-09-21T13:33:20Z
const MONTH = 30 * 86_400;
const iso = (s: number) => new Date(s * 1000).toISOString();

Deno.test("basil subscription: the period comes from its item", () => {
  // What stripe.subscriptions.retrieve returns under 2025-08-27.basil.
  const sub = { items: { data: [{ current_period_start: T0, current_period_end: T0 + MONTH }] } };
  assertEquals(subscriptionPeriod(sub), { start: iso(T0), end: iso(T0 + MONTH) });
});

Deno.test("pre-basil subscription: the top-level period still works", () => {
  const sub = { current_period_start: T0, current_period_end: T0 + MONTH, items: { data: [{}] } };
  assertEquals(subscriptionPeriod(sub), { start: iso(T0), end: iso(T0 + MONTH) });
});

Deno.test("item periods win over a stale top-level value", () => {
  const sub = { current_period_end: T0, items: { data: [{ current_period_start: T0, current_period_end: T0 + MONTH }] } };
  assertEquals(subscriptionPeriod(sub).end, iso(T0 + MONTH));
});

Deno.test("several items: access lasts until the last one ends", () => {
  const sub = { items: { data: [
    { current_period_start: T0, current_period_end: T0 + MONTH },
    { current_period_start: T0 + 5, current_period_end: T0 + 2 * MONTH },
  ] } };
  assertEquals(subscriptionPeriod(sub), { start: iso(T0), end: iso(T0 + 2 * MONTH) });
});

Deno.test("no period anywhere is null, not a date", () => {
  assertEquals(subscriptionPeriod({ items: { data: [] } }), { start: null, end: null });
  assertEquals(subscriptionPeriod(null), { start: null, end: null });
});

Deno.test("basil invoice: the subscription comes from parent.subscription_details", () => {
  assertEquals(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_123" } } }), "sub_123");
  assertEquals(invoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: "sub_456" } } } }), "sub_456");
});

Deno.test("pre-basil invoice: the top-level subscription still works", () => {
  assertEquals(invoiceSubscriptionId({ subscription: "sub_old" }), "sub_old");
});

Deno.test("a one-off invoice has no subscription", () => {
  assertEquals(invoiceSubscriptionId({ parent: null }), null);
  assertEquals(invoiceSubscriptionId({}), null);
  assertEquals(invoiceSubscriptionId(null), null);
});
