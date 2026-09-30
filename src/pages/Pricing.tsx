import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, BookOpen, Download, Volume2, Shield, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { FEATURES } from "@/lib/config";

import { SEO } from "@/components/SEO";
interface PlanConfig {
  name: string;
  description: string;
  price: string;
  period: string;
  icon: typeof BookOpen;
  popular?: boolean;
  features: { text: string; included: boolean }[];
  tierKey: SubscriptionTier;
}

const plans: PlanConfig[] = [
  {
    name: "Free",
    description: "Start your first book — no credit card needed",
    price: "$0",
    period: "forever",
    icon: BookOpen,
    tierKey: "free",
    features: [
      { text: "1 book per month (up to 4,000 words/ch)", included: true },
      { text: "5 min text-to-speech", included: true },
      { text: "Voice AI after GA validation", included: false },
      { text: "PDF export after GA validation", included: FEATURES.enableExports },
      { text: "1 quiz & 1 certificate per book", included: true },
      { text: "AI-generated covers after provider validation", included: false },
      { text: "AI image generation after provider validation", included: false },
      { text: "Cinematic video after GA", included: false },
    ],
  },
  {
    name: SUBSCRIPTION_TIERS.student.name,
    description: "For authors creating books regularly",
    price: `$${SUBSCRIPTION_TIERS.student.monthlyPrice}`,
    period: "/month",
    icon: Zap,
    tierKey: "student",
    features: [
      { text: "Up to 10 books per month", included: true },
      { text: "Up to 4,000 words per chapter", included: true },
      { text: "30 min text-to-speech", included: true },
      { text: "AI images after provider validation", included: false },
      { text: "PDF, EPUB, DOCX exports after GA validation", included: FEATURES.enableExports },
      { text: "AI-generated covers after provider validation", included: false },
      { text: "Unlimited quizzes & certificates", included: true },
      { text: "Cinematic video after GA", included: false },
    ],
  },
  {
    name: SUBSCRIPTION_TIERS.premium.name,
    description: "For serious authors and publishing-ready projects",
    price: `$${SUBSCRIPTION_TIERS.premium.monthlyPrice}`,
    period: "/month",
    icon: Sparkles,
    popular: true,
    tierKey: "premium",
    features: [
      { text: "Up to 30 books per month", included: true },
      { text: "Up to 6,000 words per chapter", included: true },
      { text: "60 min text-to-speech", included: true },
      { text: "AI images after provider validation", included: false },
      { text: "PDF, EPUB & DOCX exports after GA validation", included: FEATURES.enableExports },
      { text: "Cinematic video after GA", included: false },
      { text: "Commercial publishing rights", included: true },
      { text: "Priority support", included: true },
    ],
  },
  {
    name: SUBSCRIPTION_TIERS.prophet_tier.name,
    description: "For publishers, universities & organizations",
    price: `$${SUBSCRIPTION_TIERS.prophet_tier.monthlyPrice}`,
    period: "/month",
    icon: Building2,
    tierKey: "prophet_tier",
    features: [
      { text: "Expanded book generation allowance", included: true },
      { text: "Expanded text-to-speech allowance", included: true },
      { text: "Premium voice providers after validation", included: false },
      { text: "Cinematic video after GA", included: false },
      { text: "Batch generation after GA", included: false },
      { text: "AI research assistant after provider validation", included: false },
      { text: "PDF, EPUB & DOCX exports after GA validation", included: FEATURES.enableExports },
      { text: "Dedicated support", included: true },
    ],
  },
];

export default function Pricing() {
  const { user, tier, isSubscribed, checkSubscription } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const visiblePlans = FEATURES.enableSubscriptionCheckout
    ? plans
    : plans.filter((plan) => plan.tierKey === "free");

  // Handle post-checkout redirect. The query string is not entitlement
  // authority: verify with the server before claiming activation.
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      void (async () => {
        const { data, error } = await supabase.functions.invoke("check-subscription");

        if (!error && data?.subscribed === true) {
          toast({
            title: "Subscription activated!",
            description: "Welcome! Your features are now unlocked.",
          });
        } else {
          toast({
            title: "Payment received — confirming subscription",
            description: "Stripe returned successfully, but your entitlement is still being confirmed. Refresh in a moment if it does not update automatically.",
            variant: "default",
          });
        }

        await checkSubscription(true);
        setSearchParams({}, { replace: true });
      })();
    } else if (searchParams.get("canceled") === "true") {
      toast({
        title: "Checkout canceled",
        description: "No charges were made. You can try again anytime.",
        variant: "default",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, checkSubscription, setSearchParams, toast]);

  const handleSelectPlan = async (planTierKey: SubscriptionTier) => {
    if (!user) {
      navigate("/auth", { state: { redirectTo: "/pricing" } });
      return;
    }

    if (planTierKey === "free") {
      navigate("/generate");
      return;
    }

    if (!FEATURES.enableSubscriptionCheckout) {
      toast({
        title: "Paid upgrades are temporarily unavailable",
        description: "The free GA experience remains available while the payment lifecycle completes validation.",
      });
      return;
    }

    const tierConfig = SUBSCRIPTION_TIERS[planTierKey];
    if (!tierConfig.price_id) return;

    setCheckoutLoading(planTierKey);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: tierConfig.price_id, tier: planTierKey },
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

  // Determine if a plan is the user's current plan
  const isCurrentPlan = (planTierKey: SubscriptionTier) => {
    if (planTierKey === "free" && !isSubscribed) return true;
    return planTierKey === tier;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Pricing | ScrollLibrary"
        description="Free GA access for creating, reading, assessing, and listing AI-native books on ScrollLibrary. Paid upgrades and external publishing remain gated until validation."
        canonical="/pricing"
      />
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="text-center mb-16">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Create with one simple plan ladder
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                The current GA experience is free. When paid plans open, ScrollLibrary will use one clear ladder: Free, Creator, Pro, and Teams. Exports, paid sales, and external publishing remain gated until their own validation gates pass.
              </p>
            </div>

            {/* Plans Grid */}
            <div className={`grid gap-6 mx-auto mb-16 ${visiblePlans.length === 1 ? "max-w-md grid-cols-1" : "max-w-6xl sm:grid-cols-2 lg:grid-cols-4"}`}>
              {visiblePlans.map((plan, index) => {
                const isCurrent = isCurrentPlan(plan.tierKey);
                const isPaidChoice = plan.tierKey !== "free";
                const manageExisting = isSubscribed && isPaidChoice && !isCurrent;
                
                return (
                  <motion.div
                    key={plan.tierKey}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
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
                    } ${isCurrent ? "ring-2 ring-primary/40" : ""}`}>
                      <CardHeader className="text-center pb-4">
                        <div className={`mx-auto p-3 rounded-xl w-fit ${
                          plan.popular ? "bg-primary/20" : "bg-muted/50"
                        }`}>
                          <plan.icon className={`h-7 w-7 ${
                            plan.popular ? "text-primary" : "text-foreground"
                          }`} />
                        </div>
                        <CardTitle className="text-xl font-display mt-3">
                          {plan.name}
                        </CardTitle>
                        <CardDescription className="text-sm">{plan.description}</CardDescription>
                        <div className="mt-3">
                          <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                          <span className="text-muted-foreground text-sm">{plan.period}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ul className="space-y-2.5">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <Check className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                                feature.included ? "text-primary" : "text-muted-foreground/30"
                              }`} />
                              <span className={`text-sm ${feature.included ? "text-foreground" : "text-muted-foreground/50 line-through"}`}>
                                {feature.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={plan.popular ? "default" : "outline"}
                          className="w-full mt-4"
                          size="sm"
                          onClick={() => manageExisting ? handleManageSubscription() : handleSelectPlan(plan.tierKey)}
                          disabled={
                            isCurrent
                            || !!checkoutLoading
                            || (manageExisting ? portalLoading : (isPaidChoice && !FEATURES.enableSubscriptionCheckout))
                          }
                        >
                          {checkoutLoading === plan.tierKey ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                          ) : isCurrent ? (
                            "Current Plan"
                          ) : manageExisting ? (
                            portalLoading ? "Opening billing..." : "Manage current plan"
                          ) : plan.tierKey === "free" ? (
                            "Get Started Free"
                          ) : !FEATURES.enableSubscriptionCheckout ? (
                            "Available after payment validation"
                          ) : (
                            `Upgrade to ${plan.name}`
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {!FEATURES.enableSubscriptionCheckout && (
              <div id="billing" className="mb-16 scroll-mt-24 rounded-2xl border border-border bg-muted/30 p-6 md:p-8 text-center">
                <Badge variant="secondary" className="mb-3">GA boundary</Badge>
                <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
                  Paid plans are not open yet
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto mb-5">
                  Use the Free GA plan today. Creator, Pro, and Teams will appear only after the payment lifecycle passes its validation gates.
                </p>
                <Button variant="outline" disabled>
                  Available after payment validation
                </Button>
              </div>
            )}

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

            {/* Trust / GA boundary */}
            {FEATURES.enableSubscriptionCheckout ? (
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
            ) : (
              <div className="flex flex-wrap justify-center gap-8 text-muted-foreground border-t border-border/50 pt-8">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm">GA access requires no payment</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <span className="text-sm">Exports remain gated</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Free marketplace listing is available</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
