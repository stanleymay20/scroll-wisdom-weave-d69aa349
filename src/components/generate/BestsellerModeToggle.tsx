import { Crown, Sparkles, Zap, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const isLocked = !isPaidTier;
  const effectiveEnabled = isPaidTier ? enabled : false;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300",
        effectiveEnabled
          ? "bg-primary/5 border-primary/30"
          : "bg-muted/30 border-border/50",
        isLocked && "opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-lg transition-colors",
              effectiveEnabled
                ? "bg-primary/10 text-primary"
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
                  effectiveEnabled && "text-primary"
                )}
              >
                Enhanced Quality Mode
              </Label>
              {effectiveEnabled && (
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/30 text-xs"
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
                ? "Enhanced quality: stronger structure, clearer writing, better engagement techniques."
                : isLocked
                ? "Upgrade to unlock enhanced content quality with improved structure and engagement."
                : "Enable for improved content quality with better structure and writing clarity."}
            </p>

            {effectiveEnabled && (
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  "Stronger Hooks",
                  "Clear Structure",
                  "Engaging Writing",
                  "Better Examples",
                ].map((feature) => (
                  <span
                    key={feature}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
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
        />
      </div>
    </div>
  );
}
