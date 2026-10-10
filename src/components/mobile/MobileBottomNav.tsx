/**
 * CONTRACT 4A — MOBILE NAVIGATION PERFORMANCE
 *
 * Navigation must remain pure UI with zero data or auth hooks.
 * No blocking calls are allowed in this component.
 */

import { memo } from "react";
import { Library as LibraryIcon, UserRound, Plus, Compass, Send } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const LEFT_NAV_ITEMS = [
  { icon: LibraryIcon, label: "Library", path: "/library" },
  { icon: Compass, label: "Explore", path: "/explore" },
] as const;

const RIGHT_NAV_ITEMS = [
  { icon: Send, label: "Publish", path: "/sell" },
  { icon: UserRound, label: "Profile", path: "/profile" },
] as const;

/**
 * PMF mode currently exposes one public creation type. Going straight to the
 * creation flow avoids a redundant one-choice popover. Reintroduce a chooser
 * only when more than one GA-qualified type is actually available.
 */
function MobileBottomNavInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const isActive = (path: string) =>
    pathname === path ||
    (path === "/" && pathname === "/") ||
    (path !== "/" && pathname.startsWith(path.split("?")[0]));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/30 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="flex items-center justify-around h-16">
        {LEFT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 min-w-[64px] min-h-[44px] rounded-lg transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-primary/20")} aria-hidden="true" />
              <span className="text-[11px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => navigate("/generate?type=text")}
          aria-label="Create new book"
          className="relative flex items-center justify-center w-14 h-14 -mt-6 rounded-full shadow-lg transition-all bg-primary text-primary-foreground shadow-primary/30 active:scale-95"
        >
          <Plus className="h-7 w-7" aria-hidden="true" />
        </button>

        {RIGHT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 min-w-[64px] min-h-[44px] rounded-lg transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-primary/20")} aria-hidden="true" />
              <span className="text-[11px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const MobileBottomNav = memo(MobileBottomNavInner);
