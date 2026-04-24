/**
 * useAccessGate — React hook that wires checkAccess() to the live user,
 * subscription tier, and current usage snapshot.
 *
 * Returns a memoized `check(feature, opts)` plus the modal-trigger helpers
 * from useUsageGate(), so any feature can do:
 *
 *   const { check, modal } = useAccessGate();
 *   const onPlay = () => {
 *     const r = check("tts_audio", { pendingCost: 5 });
 *     if (r.warning) toast(r.warning);              // soft warning
 *     if (!r.allowed) return modal.trigger(r);      // hard gate
 *     // ... proceed
 *   };
 */
import { useCallback, useMemo } from "react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useUsageSnapshot } from "@/hooks/useUsageSnapshot";
import { useUsageGate } from "@/components/subscription/UsageGateModal";
import {
  checkAccess,
  checkAccessWithTelemetry,
  type AccessOptions,
  type AccessUsageInput,
  type GatedFeature,
  type AccessUser,
} from "@/lib/checkAccess";

export function useAccessGate() {
  const { user, tier } = useSubscription();
  const { snapshot, refresh: refreshUsage } = useUsageSnapshot();
  const modal = useUsageGate();

  const accessUser = useMemo<AccessUser | null>(() => {
    if (!user) return null;
    // Admin bypass is enforced server-side; client treats all users uniformly.
    return { id: user.id, tier };
  }, [user, tier]);

  const baseUsage = useMemo<AccessUsageInput>(() => ({
    booksThisMonth: snapshot?.booksThisMonth ?? 0,
    ttsMinutesUsed: snapshot?.ttsMinutesUsed ?? 0,
  }), [snapshot]);

  const check = useCallback(
    (feature: GatedFeature, opts: AccessOptions & { extraUsage?: AccessUsageInput } = {}) => {
      const merged = { ...baseUsage, ...(opts.extraUsage ?? {}) };
      return checkAccessWithTelemetry(accessUser, feature, merged, opts);
    },
    [accessUser, baseUsage],
  );

  /** Synchronous, no-telemetry variant for render-time checks. */
  const peek = useCallback(
    (feature: GatedFeature, opts: AccessOptions & { extraUsage?: AccessUsageInput } = {}) => {
      const merged = { ...baseUsage, ...(opts.extraUsage ?? {}) };
      return checkAccess(accessUser, feature, merged, opts);
    },
    [accessUser, baseUsage],
  );

  return { check, peek, modal, snapshot, refreshUsage, user: accessUser };
}
