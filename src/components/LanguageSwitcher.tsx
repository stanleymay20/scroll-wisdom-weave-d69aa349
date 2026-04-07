import { forwardRef } from "react";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, Language } from "@/lib/i18n";

export const LanguageSwitcher = forwardRef<HTMLDivElement>(
  function LanguageSwitcher(_props, ref) {
    const { language, setLanguage } = useLanguage();

    return (
      <div ref={ref}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Globe className="h-5 w-5" />
              <span className="sr-only">Change language</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => setLanguage(lang.code as Language)}
                className={language === lang.code ? "bg-accent" : ""}
              >
                <span className="flex items-center justify-between w-full">
                  <span>{lang.nativeName}</span>
                  <span className="text-muted-foreground text-xs">{lang.name}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);
