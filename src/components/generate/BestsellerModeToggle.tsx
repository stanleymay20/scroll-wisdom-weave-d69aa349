import { Crown, Sparkles, Zap, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface BestsellerModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isPaidTier: boolean;
  disabled?: boolean;
}

export function BestsellerModeToggle({
  enabled,
  onToggle,
  isPaidTier,
  disabled = false,
}: BestsellerModeToggleProps) {
  const { t } = useLanguage();
  const isLocked = !isPaidTier;
  const effectiveEnabled = isPaidTier ? enabled : false;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300",
        effectiveEnabled
          ? "bg-gradient-to-r from-scroll-gold/10 via-amber-500/5 to-scroll-gold/10 border-scroll-gold/50 shadow-lg shadow-scroll-gold/10"
          : "bg-muted/30 border-border/50",
        isLocked && "opacity-70"
      )}
    >
      {/* Glow effect when enabled */}
      {effectiveEnabled && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-scroll-gold/5 to-amber-500/5 blur-xl -z-10" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-lg transition-colors",
              effectiveEnabled
                ? "bg-scroll-gold/20 text-scroll-gold"
                : "bg-muted text-muted-foreground"
            )}
          >
            {effectiveEnabled ? (
              <Zap className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="bestseller-mode"
                className={cn(
                  "text-base font-semibold cursor-pointer",
                  effectiveEnabled && "text-scroll-gold"
                )}
              >
                Bestseller Mode
              </Label>
              {effectiveEnabled && (
                <Badge
                  variant="outline"
                  className="bg-scroll-gold/20 text-scroll-gold border-scroll-gold/30 text-xs"
                >
                  <Crown className="h-3 w-3 mr-1" />
                  ACTIVE
                </Badge>
              )}
              {isLocked && (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-border text-xs"
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground max-w-sm">
              {effectiveEnabled
                ? "Maximum quality enforcement: NYT-level writing, aggressive hooks, quotable lines, zero AI fatigue."
                : isLocked
                ? "Upgrade to unlock bestseller-grade content generation with market-dominant quality standards."
                : "Enable for maximum quality enforcement with bestseller-grade output standards."}
            </p>

            {effectiveEnabled && (
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  "Aggressive Hooks",
                  "Named Principles",
                  "Quotable Lines",
                  "Reader Psychology",
                ].map((feature) => (
                  <span
                    key={feature}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-scroll-gold/10 text-scroll-gold border border-scroll-gold/20"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <Switch
          id="bestseller-mode"
          checked={effectiveEnabled}
          onCheckedChange={onToggle}
          disabled={disabled || isLocked}
          className={cn(
            effectiveEnabled && "data-[state=checked]:bg-scroll-gold"
          )}
        />
      </div>
    </div>
  );
}
