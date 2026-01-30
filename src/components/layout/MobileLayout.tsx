import { ReactNode } from "react";
import { MobileHeader, MobileBottomNav } from "@/components/mobile";

interface MobileLayoutProps {
  children: ReactNode;
}

/**
 * Persistent mobile layout shell that wraps all mobile pages.
 * Ensures consistent header, bottom nav, and generate button across navigation.
 * Generate button is now integrated into the MobileBottomNav as a center FAB.
 */
export function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <MobileHeader />
      <main className="pb-24" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}>
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
