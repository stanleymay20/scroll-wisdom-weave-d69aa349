import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";

type DisclaimerType = "medical" | "legal" | "financial" | "ai" | "general";

interface ContentDisclaimerProps {
  type: DisclaimerType;
  className?: string;
}

const ICONS: Record<DisclaimerType, any> = {
  medical: AlertTriangle,
  legal: AlertTriangle,
  financial: AlertTriangle,
  ai: Info,
  general: Info,
};

export function ContentDisclaimer({ type, className = "" }: ContentDisclaimerProps) {
  const { t } = useLanguage();
  const Icon = ICONS[type];

  const titleKey = `disclaimer.${type}.title`;
  const descKey = `disclaimer.${type}.description`;

  return (
    <Alert className={`border-border/50 bg-muted/30 ${className}`}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="text-sm font-medium">{t(titleKey)}</AlertTitle>
      <AlertDescription className="text-xs text-muted-foreground">
        {t(descKey)}
      </AlertDescription>
    </Alert>
  );
}
