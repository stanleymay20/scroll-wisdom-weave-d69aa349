/**
 * CONTRACT 4A — MOBILE NAVIGATION PERFORMANCE
 * 
 * Menu must be pure UI with zero data or auth hooks.
 * No blocking calls allowed in this component.
 */

import { memo } from "react";
import { Home, BookOpen, Library as LibraryIcon, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

// Static nav items - no computation needed
const NAV_ITEMS = [
  { icon: Home, label: "Home", path: "/" },
  { icon: BookOpen, label: "Books", path: "/explore" },
  { icon: LibraryIcon, label: "Library", path: "/library" },
  { icon: Settings, label: "Settings", path: "/settings" },
] as const;

/**
 * Pure UI component - NO data fetching, NO auth checks
 * This is critical for Contract 4A compliance
 */
function MobileBottomNavComponent() {
  // Only hook allowed: location for active state
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/30 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path || 
            (item.path === "/" && pathname === "/") ||
            (item.path !== "/" && pathname.startsWith(item.path.split("?")[0]));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-colors",
                isActive 
                  ? "text-scroll-gold" 
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "fill-scroll-gold/20")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const MobileBottomNav = memo(MobileBottomNavComponent);