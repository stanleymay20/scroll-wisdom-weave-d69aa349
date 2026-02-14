import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, BookOpen, Download, Volume2, Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * PMF MODE: Simplified pricing
 * Free (1 book/month) + Pro ($5/month unlimited)
 */

const PMF_PRICE_ID = SUBSCRIPTION_TIERS.student.price_id; // Use student tier as $5 PMF tier

interface PlanConfig {
  name: string;
  description: string;
  price: string;
  period: string;
  icon: typeof BookOpen;
  popular?: boolean;
  features: { text: string; included: boolean }[];
  tierKey: string;
}

const plans: PlanConfig[] = [
  {
    name: "Free",
    description: "Try ScrollLibrary — no credit card needed",
    price: "$0",
    period: "forever",
    icon: BookOpen,
    tierKey: "free",
    features: [
      { text: "1 book per month (up to 5 chapters)", included: true },
      { text: "Full reader with text-to-speech", included: true },
      { text: "1 quiz per book", included: true },
      { text: "1 competency certificate", included: true },
      { text: "AI Q&A per chapter", included: true },
      { text: "Export (PDF/EPUB)", included: false },
      { text: "Unlimited books", included: false },
      { text: "AI-generated covers", included: false },
    ],
  },
  {
    name: "Pro",
    description: "Unlimited study guides with full features",
    price: "$5",
    period: "/month",
    icon: Zap,
    popular: true,
    tierKey: "student",
    features: [
      { text: "Unlimited books per month", included: true },
      { text: "Up to 30 chapters per book", included: true },
      { text: "Full reader with text-to-speech", included: true },
      { text: "Unlimited quizzes", included: true },
      { text: "Unlimited certificates", included: true },
      { text: "PDF, EPUB, DOCX exports", included: true },
      { text: "AI-generated covers", included: true },
      { text: "Priority support", included: true },
    ],
  },
];

export default function Pricing() {
  const { user, tier, isSubscribed } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleSelectPlan = async (planTierKey: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (planTierKey === "free") {
      navigate("/generate");
      return;
    }

    setCheckoutLoading(planTierKey);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: PMF_PRICE_ID },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Error",
        description: error.message || "Unable to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (error: any) {
      toast({
        title: "Billing Portal Unavailable",
        description: "Please contact support for subscription management.",
        variant: "default",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="text-center mb-16">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Simple Pricing
              </h1>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                Start free. Upgrade when you need more.
              </p>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-16">
              {plans.map((plan, index) => {
                const isCurrentPlan = (plan.tierKey === "free" && !isSubscribed) || 
                  (plan.tierKey !== "free" && isSubscribed);
                
                return (
                  <motion.div
                    key={plan.tierKey}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative"
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <Badge className="bg-primary text-primary-foreground">
                          Most Popular
                        </Badge>
                      </div>
                    )}
                    <Card className={`h-full bg-card border ${
                      plan.popular ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border"
                    }`}>
                      <CardHeader className="text-center pb-4">
                        <div className={`mx-auto p-3 rounded-xl w-fit ${
                          plan.popular ? "bg-primary/20" : "bg-muted/50"
                        }`}>
                          <plan.icon className={`h-8 w-8 ${
                            plan.popular ? "text-primary" : "text-foreground"
                          }`} />
                        </div>
                        <CardTitle className="text-2xl font-display mt-4">
                          {plan.name}
                        </CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                        <div className="mt-4">
                          <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                          <span className="text-muted-foreground">{plan.period}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ul className="space-y-3">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <Check className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                                feature.included ? "text-primary" : "text-muted-foreground/30"
                              }`} />
                              <span className={feature.included ? "text-foreground" : "text-muted-foreground/50 line-through"}>
                                {feature.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={plan.popular ? "default" : "outline"}
                          className="w-full mt-6"
                          onClick={() => handleSelectPlan(plan.tierKey)}
                          disabled={isCurrentPlan || !!checkoutLoading}
                        >
                          {checkoutLoading === plan.tierKey ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                          ) : isCurrentPlan ? (
                            "Current Plan"
                          ) : plan.tierKey === "free" ? (
                            "Get Started Free"
                          ) : (
                            "Upgrade to Pro"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {/* Manage Subscription */}
            {isSubscribed && (
              <div className="text-center mb-16">
                <Button
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opening...</>
                  ) : (
                    "Manage Subscription"
                  )}
                </Button>
              </div>
            )}

            {/* Trust */}
            <div className="flex flex-wrap justify-center gap-8 text-muted-foreground border-t border-border/50 pt-8">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-sm">Secure payments via Stripe</span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <span className="text-sm">Instant access</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-primary" />
                <span className="text-sm">Cancel anytime</span>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
