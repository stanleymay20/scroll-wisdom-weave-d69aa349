import { SubscriptionTier, SUBSCRIPTION_TIERS } from "./subscription";

/**
 * Library limits per subscription tier.
 * Defines max books a user can store in their library.
 */
export const LIBRARY_LIMITS: Record<SubscriptionTier, number> = {
  free: 10,        // Free users: 10 books max
  student: 50,     // Student tier: 50 books
  premium: 200,    // Premium tier: 200 books
  prophet_tier: -1 // Prophet tier: unlimited (-1 = no limit)
};

/**
 * Get the library limit for a given tier.
 * Returns -1 for unlimited.
 */
export function getLibraryLimit(tier: SubscriptionTier): number {
  return LIBRARY_LIMITS[tier] ?? 10;
}

/**
 * Check if user can add more books to their library.
 */
export function canAddToLibrary(tier: SubscriptionTier, currentBookCount: number): boolean {
  const limit = getLibraryLimit(tier);
  if (limit === -1) return true; // Unlimited
  return currentBookCount < limit;
}

/**
 * Check if a user is an admin (has unlimited access).
 */
export function isAdminUser(roles: string[]): boolean {
  return roles.includes('admin');
}

/**
 * Get remaining slots in user's library.
 * Returns -1 for unlimited.
 */
export function getRemainingLibrarySlots(tier: SubscriptionTier, currentBookCount: number): number {
  const limit = getLibraryLimit(tier);
  if (limit === -1) return -1; // Unlimited
  return Math.max(0, limit - currentBookCount);
}

/**
 * Format library limit display text.
 */
export function formatLibraryLimit(tier: SubscriptionTier): string {
  const limit = getLibraryLimit(tier);
  if (limit === -1) return "Unlimited";
  return limit.toString();
}
