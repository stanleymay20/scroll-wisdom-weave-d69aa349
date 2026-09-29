/**
 * GA release switches for external financial writes.
 *
 * Production defaults fail closed. Disposable Stripe lifecycle tests explicitly
 * set GA_PAYMENTS_ENABLED=true so the exact payment code can still be exercised
 * before this switch is opened in a real environment.
 */
export function externalPaymentWritesEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PAYMENTS_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}
