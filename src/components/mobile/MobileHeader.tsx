/**
 * CONTRACT 4A — MOBILE HEADER PERFORMANCE
 *
 * Header must remain a pure UI shell with zero network or auth hooks.
 * Local language context is permitted because it performs no data fetch.
 */

import { memo, useCallback } from "react";
import { Search, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import logo from "@/assets/logo.png";

/** Pure UI component — no data fetching or auth checks. */
function MobileHeaderComponent() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const goToExplore = useCallback(() => navigate("/explore"), [navigate]);
  const goToProfile = useCallback(() => navigate("/profile"), [navigate]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/20"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      role="banner"
    >
      <div className="flex items-center justify-between h-14 px-4">
        <Link to="/" className="flex items-center min-h-11" aria-label="ScrollLibrary home">
          <img
            src={logo}
            alt=""
            className="h-8 w-auto"
            loading="eager"
          />
          <span className="sr-only">ScrollLibrary</span>
        </Link>

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground active:text-foreground"
            onClick={goToExplore}
            aria-label={t("mobile.header.search")}
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-muted-foreground active:text-foreground"
            onClick={goToProfile}
            aria-label={t("mobile.header.profile")}
          >
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

export const MobileHeader = memo(MobileHeaderComponent);
