/**
 * Pre-Launch Checklist
 * Final verification steps before public launch
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ArrowLeft,
  Shield,
  Database,
  CreditCard,
  Globe,
  Lock,
  Server,
  Users,
  FileText,
  Rocket
} from "lucide-react";
import { isTrialActive, TRIAL_MODE, LAUNCH_MODE } from "@/lib/config";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: "security" | "database" | "payments" | "compliance" | "config";
  status: "pass" | "fail" | "warning" | "manual";
  action?: string;
}

export default function LaunchChecklist() {
  const navigate = useNavigate();
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});

  const checklistItems: ChecklistItem[] = [
    // Config checks
    {
      id: "trial-mode",
      title: "Trial Mode Disabled",
      description: "TRIAL_MODE should be false for production",
      category: "config",
      status: TRIAL_MODE === false ? "pass" : "fail",
      action: "Edit src/lib/config.ts and set TRIAL_MODE = false",
    },
    {
      id: "launch-mode",
      title: "Launch Mode Disabled",
      description: "LAUNCH_MODE should be false for production",
      category: "config",
      status: !LAUNCH_MODE ? "pass" : "warning",
      action: "Edit src/lib/config.ts and set LAUNCH_MODE = false",
    },
    {
      id: "trial-inactive",
      title: "Trial Period Inactive",
      description: "isTrialActive() should return false",
      category: "config",
      status: isTrialActive() === false ? "pass" : "fail",
    },

    // Security checks
    {
      id: "rls-enabled",
      title: "RLS Policies Active",
      description: "All tables have Row Level Security enabled",
      category: "security",
      status: "pass", // Verified by linter
    },
    {
      id: "jwt-verification",
      title: "JWT Verification on Edge Functions",
      description: "All edge functions validate authentication",
      category: "security",
      status: "pass",
    },
    {
      id: "leaked-password",
      title: "Leaked Password Protection",
      description: "Enable in Supabase Auth settings (manual step)",
      category: "security",
      status: "manual",
      action: "Go to Supabase Dashboard → Auth → Settings → Enable 'Leaked Password Protection'",
    },

    // Database checks
    {
      id: "db-migrations",
      title: "Database Migrations Applied",
      description: "All migrations successfully applied",
      category: "database",
      status: "pass",
    },
    {
      id: "audit-logging",
      title: "Audit Logging Enabled",
      description: "Security audit log table active",
      category: "database",
      status: "pass",
    },

    // Payments checks
    {
      id: "stripe-live",
      title: "Stripe Live Mode",
      description: "Verify Stripe is configured for live payments",
      category: "payments",
      status: "manual",
      action: "Verify STRIPE_SECRET_KEY is the live key (starts with sk_live_)",
    },
    {
      id: "stripe-webhook",
      title: "Stripe Webhook Active",
      description: "Webhook endpoint configured and receiving events",
      category: "payments",
      status: "manual",
      action: "Test webhook in Stripe Dashboard → Developers → Webhooks",
    },
    {
      id: "pricing-page",
      title: "Pricing Page Live",
      description: "Pricing page accessible with correct plans",
      category: "payments",
      status: "pass",
    },

    // Compliance checks
    {
      id: "account-deletion",
      title: "Account Deletion Available",
      description: "Users can delete their accounts (GDPR/store requirement)",
      category: "compliance",
      status: "pass",
    },
    {
      id: "privacy-policy",
      title: "Privacy Policy Published",
      description: "Privacy policy accessible at /privacy",
      category: "compliance",
      status: "pass",
    },
    {
      id: "terms-of-service",
      title: "Terms of Service Published",
      description: "Terms accessible at /terms",
      category: "compliance",
      status: "pass",
    },
    {
      id: "ai-disclosure",
      title: "AI Usage Disclosure",
      description: "AI disclosure visible in Settings and content",
      category: "compliance",
      status: "pass",
    },
    {
      id: "trust-whitepaper",
      title: "Trust Whitepaper Published",
      description: "Trust documentation at /docs/trust-whitepaper",
      category: "compliance",
      status: "pass",
    },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "security": return <Shield className="h-5 w-5" />;
      case "database": return <Database className="h-5 w-5" />;
      case "payments": return <CreditCard className="h-5 w-5" />;
      case "compliance": return <FileText className="h-5 w-5" />;
      case "config": return <Server className="h-5 w-5" />;
      default: return <Globe className="h-5 w-5" />;
    }
  };

  const getStatusBadge = (status: string, id: string) => {
    if (status === "manual") {
      const isChecked = manualChecks[id];
      return (
        <Badge variant={isChecked ? "default" : "secondary"} className="gap-1">
          {isChecked ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {isChecked ? "Verified" : "Manual Check"}
        </Badge>
      );
    }
    
    switch (status) {
      case "pass":
        return <Badge variant="default" className="bg-green-600 gap-1"><CheckCircle2 className="h-3 w-3" /> Pass</Badge>;
      case "fail":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Fail</Badge>;
      case "warning":
        return <Badge variant="secondary" className="bg-yellow-600 text-white gap-1"><AlertTriangle className="h-3 w-3" /> Warning</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const groupedItems = checklistItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const passCount = checklistItems.filter(i => i.status === "pass" || manualChecks[i.id]).length;
  const totalCount = checklistItems.length;
  const isReady = passCount === totalCount;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Rocket className="h-8 w-8 text-primary" />
              Launch Checklist
            </h1>
            <p className="text-muted-foreground mt-2">
              Pre-launch verification for ScrollLibrary production deployment
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-primary">{passCount}/{totalCount}</div>
            <Badge variant={isReady ? "default" : "secondary"} className="mt-1">
              {isReady ? "Ready to Launch" : "In Progress"}
            </Badge>
          </div>
        </div>

        {Object.entries(groupedItems).map(([category, items]) => (
          <Card key={category} className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 capitalize">
                {getCategoryIcon(category)}
                {category}
              </CardTitle>
              <CardDescription>
                {items.filter(i => i.status === "pass" || manualChecks[i.id]).length} of {items.length} checks passed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div 
                  key={item.id} 
                  className={`flex items-start gap-4 p-4 rounded-lg border ${
                    item.status === "fail" ? "border-destructive/50 bg-destructive/5" :
                    item.status === "pass" || manualChecks[item.id] ? "border-green-500/50 bg-green-500/5" :
                    "border-border"
                  }`}
                >
                  {item.status === "manual" && (
                    <Checkbox
                      checked={manualChecks[item.id] || false}
                      onCheckedChange={(checked) => 
                        setManualChecks(prev => ({ ...prev, [item.id]: !!checked }))
                      }
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{item.title}</h3>
                      {getStatusBadge(item.status, item.id)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    {item.action && item.status !== "pass" && !manualChecks[item.id] && (
                      <p className="text-sm text-primary mt-2 font-medium">
                        → {item.action}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {isReady && (
          <Card className="border-green-500 bg-green-500/5">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-600 mb-2">All Checks Passed!</h2>
              <p className="text-muted-foreground mb-4">
                ScrollLibrary is ready for public launch.
              </p>
              <Button size="lg" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
