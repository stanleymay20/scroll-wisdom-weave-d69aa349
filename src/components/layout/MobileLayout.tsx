import { ReactNode } from "react";
import { MobileHeader, MobileBottomNav, MobileGenerateButton } from "@/components/mobile";

interface MobileLayoutProps {
  children: ReactNode;
  showGenerateButton?: boolean;
}

/**
 * Persistent mobile layout shell that wraps all mobile pages.
 * Ensures consistent header, bottom nav, and generate button across navigation.
 */
export function MobileLayout({ children, showGenerateButton = true }: MobileLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <MobileHeader />
      <main className="pb-24" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}>
        {children}
      </main>
      {showGenerateButton && <MobileGenerateButton />}
      <MobileBottomNav />
    </div>
  );
}
