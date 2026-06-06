/**
 * CONTRACT 4A — MOBILE NAVIGATION PERFORMANCE
 * 
 * Menu must be pure UI with zero data or auth hooks.
 * No blocking calls allowed in this component.
 */

import { memo, useState } from "react";
import { BookOpen, Library as LibraryIcon, Settings, Plus, Compass, DollarSign } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Left side nav items
const LEFT_NAV_ITEMS = [
  { icon: LibraryIcon, label: "Library", path: "/library" },
  { icon: Compass, label: "Explore", path: "/explore" },
] as const;

// Right side nav items
const RIGHT_NAV_ITEMS = [
  { icon: DollarSign, label: "Sell", path: "/sell" },
  { icon: Settings, label: "Profile", path: "/profile" },
] as const;

// PMF MODE: Only text books - no comics/workbooks in create menu
const BOOK_TYPES = [
  { id: "text", label: "Study Guide", icon: BookOpen },
] as const;

/**
 * Pure UI component - NO data fetching, NO auth checks
 * This is critical for Contract 4A compliance
 */
function MobileBottomNavInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const isActive = (path: string) => 
    pathname === path || 
    (path === "/" && pathname === "/") ||
    (path !== "/" && pathname.startsWith(path.split("?")[0]));

  const handleCreateBook = (type: string) => {
    setShowCreateMenu(false);
    navigate(`/generate?type=${type}`);
  };

  return (
    <>
      {/* Create Menu Overlay */}
      <AnimatePresence>
        {showCreateMenu && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] md:hidden"
              onClick={() => setShowCreateMenu(false)}
            />
            
            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[101] bg-card border border-border rounded-2xl p-4 shadow-2xl md:hidden"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <div className="flex flex-col gap-2 min-w-[200px]">
                <p className="text-sm font-medium text-muted-foreground text-center mb-2">
                  Create New Book
                </p>
                {BOOK_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => handleCreateBook(type.id)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="font-medium">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/30 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="flex items-center justify-around h-16">
          {/* Left Nav Items */}
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

          {/* Center Create Button */}
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            aria-label={showCreateMenu ? "Close create menu" : "Create new book"}
            aria-expanded={showCreateMenu}
            aria-haspopup="menu"
            className={cn(
              "relative flex items-center justify-center w-14 h-14 -mt-6 rounded-full shadow-lg transition-all",
              showCreateMenu
                ? "bg-destructive text-destructive-foreground rotate-45"
                : "bg-primary text-primary-foreground shadow-primary/30"
            )}
          >
            <Plus className="h-7 w-7 transition-transform" aria-hidden="true" />
          </button>

          {/* Right Nav Items */}
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
    </>
  );
}

export const MobileBottomNav = memo(MobileBottomNavInner);