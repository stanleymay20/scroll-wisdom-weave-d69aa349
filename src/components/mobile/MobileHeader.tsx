/**
 * CONTRACT 4A — MOBILE HEADER PERFORMANCE
 * 
 * Header must be pure UI with zero data or auth hooks.
 * No blocking calls allowed in this component.
 */

import { memo, useCallback } from "react";
import { Search, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

/**
 * Pure UI component - NO data fetching, NO auth checks
 * This is critical for Contract 4A compliance
 */
function MobileHeaderComponent() {
  const navigate = useNavigate();

  // Memoize navigation handlers
  const goToExplore = useCallback(() => navigate("/explore"), [navigate]);
  const goToProfile = useCallback(() => navigate("/profile"), [navigate]);

  return (
    <header 
      className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/20"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      role="banner"
    >
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center min-h-11" aria-label="ScrollLibrary home">
          <img 
            src={logo} 
            alt="" 
            className="h-8 w-auto" 
            loading="eager"
          />
          <span className="sr-only">ScrollLibrary</span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground active:text-foreground"
            onClick={goToExplore}
            aria-label="Search and explore"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground active:text-foreground"
            onClick={goToProfile}
            aria-label="Profile and settings"
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

export const MobileHeader = memo(MobileHeaderComponent);
