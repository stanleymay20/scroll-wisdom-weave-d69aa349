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
    <div className="min-h-dvh bg-background">
      <MobileHeader />
      <main
        id="main-content"
        className="pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
