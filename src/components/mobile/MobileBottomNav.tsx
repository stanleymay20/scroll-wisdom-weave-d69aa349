/**
 * CONTRACT 4A — MOBILE NAVIGATION PERFORMANCE
 * 
 * Menu must be pure UI with zero data or auth hooks.
 * No blocking calls allowed in this component.
 */

import React, { memo } from "react";
import { Home, BookOpen, Headphones, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

// Static nav items - no computation needed
const NAV_ITEMS = [
  { icon: Home, label: "Home", path: "/" },
  { icon: BookOpen, label: "Books", path: "/explore" },
  { icon: Headphones, label: "Audio", path: "/library?filter=audio" },
  { icon: Settings, label: "Settings", path: "/settings" },
] as const;

// Memoized nav item to prevent unnecessary re-renders
const NavItem = memo(function NavItem({ 
  icon: Icon, 
  label, 
  path, 
  isActive 
}: { 
  icon: typeof Home; 
  label: string; 
  path: string; 
  isActive: boolean; 
}) {
  return (
    <Link
      to={path}
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-colors",
        isActive 
          ? "text-scroll-gold" 
          : "text-muted-foreground active:text-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5", isActive && "fill-scroll-gold/20")} />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
});

/**
 * Pure UI component - NO data fetching, NO auth checks
 * This is critical for Contract 4A compliance
 */
const MobileBottomNavInner = React.forwardRef<HTMLElement>((_, ref) => {
  // Only hook allowed: location for active state
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav 
      ref={ref}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/30 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || 
            (item.path === "/" && pathname === "/") ||
            (item.path !== "/" && pathname.startsWith(item.path.split("?")[0]));

          return (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              isActive={isActive}
            />
          );
        })}
      </div>
    </nav>
  );
});

MobileBottomNavInner.displayName = "MobileBottomNav";

export const MobileBottomNav = memo(MobileBottomNavInner);
