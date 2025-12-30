import React from "react";
import { Home, BookOpen, Headphones, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: Home, label: "Home", path: "/" },
  { icon: BookOpen, label: "Books", path: "/explore" },
  { icon: Headphones, label: "Audio", path: "/library?filter=audio" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const MobileBottomNav = React.forwardRef<HTMLElement>((_, ref) => {
  const location = useLocation();

  return (
    <nav 
      ref={ref}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/30 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
            (item.path === "/" && location.pathname === "/") ||
            (item.path !== "/" && location.pathname.startsWith(item.path.split("?")[0]));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-all duration-200",
                isActive 
                  ? "text-scroll-gold" 
                  : "text-muted-foreground hover:text-foreground"
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
});

MobileBottomNav.displayName = "MobileBottomNav";
