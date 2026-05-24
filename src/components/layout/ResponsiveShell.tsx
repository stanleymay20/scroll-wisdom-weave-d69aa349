import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "@/components/layout/MobileLayout";

/**
 * ResponsiveShell — wraps a page in MobileLayout (header + bottom nav)
 * when on a mobile viewport, otherwise renders children unchanged.
 *
 * Use on public/storefront pages that need consistent mobile chrome
 * (header, back-to-home logo, bottom tab nav).
 */
export function ResponsiveShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileLayout>{children}</MobileLayout>;
  return <>{children}</>;
}
