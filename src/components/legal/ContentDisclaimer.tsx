import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type DisclaimerType = "medical" | "legal" | "financial" | "ai" | "general";

interface ContentDisclaimerProps {
  type: DisclaimerType;
  className?: string;
}

const disclaimers: Record<DisclaimerType, { icon: any; title: string; description: string }> = {
  medical: {
    icon: AlertTriangle,
    title: "Medical Disclaimer",
    description: "This content is for informational purposes only and should not be considered medical advice. Always consult a qualified healthcare professional before making any health-related decisions.",
  },
  legal: {
    icon: AlertTriangle,
    title: "Legal Disclaimer",
    description: "This content is for informational purposes only and does not constitute legal advice. Consult a licensed attorney for legal matters specific to your situation.",
  },
  financial: {
    icon: AlertTriangle,
    title: "Financial Disclaimer",
    description: "This content is for educational purposes only and should not be considered financial advice. Consult a qualified financial advisor before making investment decisions.",
  },
  ai: {
    icon: Info,
    title: "AI-Generated Content",
    description: "This content was generated with AI assistance. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. Please verify important information independently.",
  },
  general: {
    icon: Info,
    title: "Disclaimer",
    description: "The views and information presented in this content are for educational purposes. ScrollLibrary does not guarantee the accuracy, completeness, or usefulness of any information provided.",
  },
};

export function ContentDisclaimer({ type, className = "" }: ContentDisclaimerProps) {
  const { icon: Icon, title, description } = disclaimers[type];

  return (
    <Alert className={`border-border/50 bg-muted/30 ${className}`}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="text-sm font-medium">{title}</AlertTitle>
      <AlertDescription className="text-xs text-muted-foreground">
        {description}
      </AlertDescription>
    </Alert>
  );
}