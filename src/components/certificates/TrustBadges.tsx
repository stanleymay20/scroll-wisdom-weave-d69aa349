import { Badge } from "@/components/ui/badge";
import { CheckCircle, Shield, Eye, Award } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrustBadgeType = 
  | "verifiable" 
  | "integrity-scored" 
  | "publicly-accessible" 
  | "authority-issued";

interface TrustBadgeProps {
  type: TrustBadgeType;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

const badgeConfig: Record<TrustBadgeType, {
  label: string;
  description: string;
  icon: typeof CheckCircle;
  colorClass: string;
}> = {
  "verifiable": {
    label: "Verifiable Certificate",
    description: "Can be verified by anyone using the certificate number",
    icon: CheckCircle,
    colorClass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
  },
  "integrity-scored": {
    label: "Integrity Scored",
    description: "Behavioral integrity measured during assessments",
    icon: Shield,
    colorClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
  },
  "publicly-accessible": {
    label: "Public Verification",
    description: "No login required to verify authenticity",
    icon: Eye,
    colorClass: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
  },
  "authority-issued": {
    label: "Authority Issued",
    description: "Issued by ScrollLibrary Certification Authority",
    icon: Award,
    colorClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
  }
};

const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-base px-3 py-1.5"
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5"
};

export function TrustBadge({ 
  type, 
  size = "md", 
  showIcon = true,
  className 
}: TrustBadgeProps) {
  const config = badgeConfig[type];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-medium border",
        config.colorClass,
        sizeClasses[size],
        className
      )}
      title={config.description}
    >
      {showIcon && <Icon className={cn(iconSizes[size], "mr-1")} />}
      {config.label}
    </Badge>
  );
}

interface TrustBadgeGroupProps {
  badges?: TrustBadgeType[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function TrustBadgeGroup({ 
  badges = ["verifiable", "integrity-scored", "publicly-accessible", "authority-issued"],
  size = "sm",
  className 
}: TrustBadgeGroupProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {badges.map((badge) => (
        <TrustBadge key={badge} type={badge} size={size} />
      ))}
    </div>
  );
}

// Embeddable badge for external websites
export function EmbeddableTrustBadge({ 
  certificateNumber,
  verificationUrl 
}: { 
  certificateNumber: string;
  verificationUrl: string;
}) {
  return (
    <a 
      href={verificationUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/30 rounded-lg hover:border-amber-500/50 transition-colors no-underline"
    >
      <Shield className="h-5 w-5 text-amber-600" />
      <div className="text-left">
        <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          Verified by ScrollLibrary
        </div>
        <div className="text-xs text-muted-foreground">
          {certificateNumber}
        </div>
      </div>
    </a>
  );
}

// Generate embeddable HTML for institutions
export function generateEmbedCode(certificateNumber: string, baseUrl: string): string {
  const verificationUrl = `${baseUrl}/certificate/${certificateNumber}`;
  
  return `<!-- ScrollLibrary Verification Badge -->
<a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:linear-gradient(to right,rgba(245,158,11,0.1),rgba(217,119,6,0.1));border:1px solid rgba(245,158,11,0.3);border-radius:8px;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  <span style="text-align:left;">
    <span style="display:block;font-size:11px;font-weight:600;color:#b45309;">Verified by ScrollLibrary</span>
    <span style="display:block;font-size:10px;color:#6b7280;">${certificateNumber}</span>
  </span>
</a>`;
}
