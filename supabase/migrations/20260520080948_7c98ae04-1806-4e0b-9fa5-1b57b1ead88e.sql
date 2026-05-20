
INSERT INTO public.alert_thresholds (key, description, warn_value, critical_value, window_seconds, enabled)
VALUES (
  'subscription.payment_failed_count_5m',
  'Number of subscription payment_failed Stripe events in the last 5 minutes',
  3, 10, 300, true
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    warn_value = EXCLUDED.warn_value,
    critical_value = EXCLUDED.critical_value,
    window_seconds = EXCLUDED.window_seconds,
    enabled = EXCLUDED.enabled,
    updated_at = now();
