import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check, Sparkles, Zap, BookOpen, Download, Volume2, Shield,
  Loader2, Building2, BookKey, Coins, Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  SUBSCRIPTION_TIERS,
  PUBLISHING_SERVICE_PACKAGES,
  USAGE_ADDONS,
  type BillingCycle,
  type SubscriptionTier,
} from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";
import { FEATURES } from "@/lib/config";
import { SEO } from "@/components/SEO";

interface PlanConfig {
  description: string;
  icon: typeof BookOpen;
  popular?: boolean;
  tierKey: SubscriptionTier;
  features: string[];
}

const plans: PlanConfig[] = [
  {
    description: "Try the core creation and reading experience",
    icon: BookOpen,
    tierKey: "free",
    features: [
      "1 book project / month",
      "25k AI-generated words / month",
      "Up to 4,000 words / chapter",
      "5 narration minutes",
      "Reader, quizzes & certificates",
      "15% marketplace fee when marketplace selling is available",
    ],
  },
  {
    description: "For authors creating and exporting regularly",
    icon: Zap,
    tierKey: "student",
    features: [
      "10 book projects / month",
      "250k AI-generated words / month",
      "10 AI-generated visuals",
      "15 narration minutes",
      "PDF / EPUB / DOCX when export gate is open",
      "10% marketplace fee when marketplace selling is available",
    ],
  },
  {
    description: "For serious authors preparing work for publication",
    icon: Sparkles,
    popular: true,
    tierKey: "premium",
    features: [
      "30 book projects / month",
      "1M AI-generated words / month",
      "60 AI-generated visuals",
      "60 narration minutes",
      "KDP PDF + stronger publication editorial review",
      "5% marketplace fee when marketplace selling is available",
    ],
  },
  {
    description: "For publishers, schools, universities and teams",
    icon: Building2,
    tierKey: "prophet_tier",
    features: [
      "100 pooled book projects / month",
      "2.5M pooled AI-generated words / month",
      "200 AI-generated visuals",
      "180 narration minutes",
      "5 seats included",
      "3% marketplace fee when marketplace selling is available",
    ],
  },
];

const publishingPackages = Object.entries(PUBLISHING_SERVICE_PACKAGES);
const usageAddons = Object.entries(USAGE_ADDONS);

export default function Pricing() {
  const { user, tier, isSubscribed, checkSubscription } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [orderCheckoutLoading, setOrderCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

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
            description: "Stripe returned successfully, but entitlement confirmation is still in progress.",
          });
        }
        await checkSubscription(true);
        setSearchParams({}, { replace: true });
      })();
    } else if (searchParams.get("order_success") === "true") {
      toast({
        title: "Purchase received",
        description: "Your purchase is being confirmed from Stripe before the entitlement is applied. If this was a usage pack, it applies only to the current UTC calendar month and will reset at UTC month-end.",
      });
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("order_canceled") === "true") {
      toast({
        title: "Purchase canceled",
        description: "No charges were made.",
      });
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("canceled") === "true") {
      toast({
        title: "Checkout canceled",
        description: "No charges were made.",
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
        title: "Paid upgrades are not open yet",
        description: "The catalogue is ready, but checkout stays closed until the exact-head payment lifecycle passes validation.",
      });
      return;
    }

    setCheckoutLoading(planTierKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { tier: planTierKey, billingInterval: billingCycle },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank", "noopener");
    } catch (error: any) {
      toast({
        title: "Unable to start checkout",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleOneTimePurchase = async (sku: string) => {
    if (!user) {
      navigate("/auth", { state: { redirectTo: "/pricing" } });
      return;
    }
    if (!FEATURES.enablePaidCheckout) {
      toast({
        title: "Purchases are not open yet",
        description: "The billing catalogue is implemented, but financial writes remain closed until validation passes.",
      });
      return;
    }

    setOrderCheckoutLoading(sku);
    try {
      const { data, error } = await supabase.functions.invoke("create-billing-order-checkout", {
        body: { sku },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank", "noopener");
    } catch (error: any) {
      toast({
        title: "Unable to start purchase",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOrderCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank", "noopener");
    } catch {
      toast({
        title: "Billing portal unavailable",
        description: "Please contact support for subscription management.",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const isCurrentPlan = (planTierKey: SubscriptionTier) => {
    if (planTierKey === "free" && !isSubscribed) return true;
    return planTierKey === tier;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Pricing | ScrollLibrary"
        description="ScrollLibrary plans for authors, publishers and teams, with separate usage and publishing services so AI and ISBN economics stay transparent."
        canonical="/pricing"
      />
      <Navbar />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                One plan ladder. Clear usage. Publishing only when you publish.
              </h1>
              <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                Subscriptions cover software and bounded AI usage. ScrollLibrary Press publishing services,
                marketplace fees, and extra AI usage are priced separately so heavy usage never hides inside an
                “unlimited” promise.
              </p>
              <div className="mt-6 inline-flex rounded-lg border bg-muted/30 p-1">
                <Button
                  size="sm"
                  variant={billingCycle === "monthly" ? "default" : "ghost"}
                  onClick={() => setBillingCycle("monthly")}
                >
                  Monthly
                </Button>
                <Button
                  size="sm"
                  variant={billingCycle === "annual" ? "default" : "ghost"}
                  onClick={() => setBillingCycle("annual")}
                >
                  Annual · 2 months free
                </Button>
              </div>
            </div>

            <div className="grid gap-6 mx-auto mb-6 max-w-6xl sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan, index) => {
                const config = SUBSCRIPTION_TIERS[plan.tierKey];
                const isCurrent = isCurrentPlan(plan.tierKey);
                const isPaidChoice = plan.tierKey !== "free";
                const manageExisting = isSubscribed && isPaidChoice && !isCurrent;
                const price = billingCycle === "annual" ? config.annualPrice : config.monthlyPrice;
                const period = config.monthlyPrice === 0 ? "forever" : billingCycle === "annual" ? "/year" : "/month";

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
                        <Badge>Best for publishing</Badge>
                      </div>
                    )}
                    <Card className={`h-full ${plan.popular ? "border-primary/50 shadow-lg shadow-primary/10" : ""} ${isCurrent ? "ring-2 ring-primary/40" : ""}`}>
                      <CardHeader className="text-center pb-4">
                        <div className={`mx-auto p-3 rounded-xl w-fit ${plan.popular ? "bg-primary/20" : "bg-muted/50"}`}>
                          <plan.icon className={`h-7 w-7 ${plan.popular ? "text-primary" : "text-foreground"}`} />
                        </div>
                        <CardTitle className="text-xl font-display mt-3">{config.name}</CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                        <div className="mt-3">
                          <span className="text-3xl font-bold">${price}</span>
                          <span className="text-muted-foreground text-sm">{period}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ul className="space-y-2.5">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2.5">
                              <Check className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={plan.popular ? "default" : "outline"}
                          className="w-full"
                          size="sm"
                          onClick={() => manageExisting ? handleManageSubscription() : handleSelectPlan(plan.tierKey)}
                          disabled={
                            isCurrent
                            || !!checkoutLoading
                            || (manageExisting ? portalLoading : (isPaidChoice && !FEATURES.enableSubscriptionCheckout))
                          }
                        >
                          {checkoutLoading === plan.tierKey ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                          ) : isCurrent ? (
                            "Current plan"
                          ) : manageExisting ? (
                            portalLoading ? "Opening billing…" : "Manage current plan"
                          ) : plan.tierKey === "free" ? (
                            "Get started free"
                          ) : !FEATURES.enableSubscriptionCheckout ? (
                            "Available after payment validation"
                          ) : (
                            `Choose ${config.name}`
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            <div className="mb-10 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground max-w-4xl mx-auto">
              <p><strong className="text-foreground">How usage works:</strong> book projects are creation slots, while your monthly AI-word allowance is shared across the books you generate. A generated visual uses one visual request. Narration is metered in standard narration minutes.</p>
              <p className="mt-2">You retain ownership of what you create, subject to applicable law and any third-party/source rights described in the Terms. Commercial rights are not sold as a premium-plan privilege.</p>
            </div>

            {!FEATURES.enableSubscriptionCheckout && (
              <div id="billing" className="mb-14 rounded-2xl border bg-muted/30 p-6 md:p-8 text-center">
                <Badge variant="secondary" className="mb-3">GA safety gate</Badge>
                <h2 className="text-2xl font-display font-bold mb-2">Prices are defined; live checkout remains closed</h2>
                <p className="text-muted-foreground max-w-3xl mx-auto">
                  Free GA remains available. Creator, Pro and Teams checkout will only open after the new Stripe catalogue,
                  webhook lifecycle, entitlement sync and refund paths pass exact-head validation.
                </p>
              </div>
            )}

            <section className="mb-14">
              <div className="text-center mb-6">
                <BookKey className="h-7 w-7 mx-auto text-primary mb-2" />
                <h2 className="text-3xl font-display font-bold">ScrollLibrary Press publishing services</h2>
                <p className="text-muted-foreground max-w-3xl mx-auto mt-2">
                  ISBNs are not sold as numbers. An eligible ScrollLibrary Press ISBN is assigned only to a defined,
                  validated publication product.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {publishingPackages.map(([sku, pkg]) => {
                  const assistedLaunchPending = sku === "assisted_launch";
                  return (
                    <Card key={sku}>
                      <CardHeader>
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                        <div><span className="text-2xl font-bold">${pkg.price}</span><span className="text-muted-foreground text-sm"> one-time</span></div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <p className="text-muted-foreground">{pkg.description}</p>
                        <p><strong>Up to {pkg.maxIsbns}</strong> eligible format-specific ISBN{pkg.maxIsbns === 1 ? "" : "s"}</p>
                        <p className="text-xs text-muted-foreground">Payment creates a publishing-service order. ISBN assignment occurs only after publication validation.</p>
                        {assistedLaunchPending && (
                          <p className="text-xs text-muted-foreground">Human-assisted service remains closed until staffing, turnaround and fulfillment tracking are operationally validated.</p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={!FEATURES.enablePaidCheckout || !!orderCheckoutLoading || assistedLaunchPending}
                          onClick={() => handleOneTimePurchase(sku)}
                        >
                          {assistedLaunchPending
                            ? "Human service setup pending"
                            : orderCheckoutLoading === sku
                              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                              : FEATURES.enablePaidCheckout ? "Purchase service" : "Available after validation"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="mb-14">
              <div className="text-center mb-6">
                <Coins className="h-7 w-7 mx-auto text-primary mb-2" />
                <h2 className="text-3xl font-display font-bold">Usage add-ons</h2>
                <p className="text-muted-foreground mt-2">
                  Heavy users buy extra compute instead of forcing every subscriber into a higher plan.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {usageAddons.map(([sku, addon]) => {
                  const recurringSeat = addon.billingMode === "recurring";
                  const canBuyUsage = isSubscribed && FEATURES.enablePaidCheckout && !recurringSeat;
                  return (
                    <Card key={sku}>
                      <CardContent className="p-5 space-y-3">
                        <div className="font-medium">{addon.name}</div>
                        <div className="text-2xl font-bold">${addon.price}{recurringSeat ? <span className="text-sm font-normal text-muted-foreground">/month</span> : null}</div>
                        <p className="text-xs text-muted-foreground">
                          {recurringSeat
                            ? "Recurring Teams seat. Seat billing opens with organization seat management."
                            : "One-time compute pack applied to the current UTC calendar month after Stripe confirms payment. It will reset at UTC month-end; unused add-on units do not roll over."}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={!canBuyUsage || !!orderCheckoutLoading}
                          onClick={() => handleOneTimePurchase(sku)}
                        >
                          {recurringSeat
                            ? "Seat billing after Teams GA"
                            : !isSubscribed
                              ? "Paid plan required"
                              : !FEATURES.enablePaidCheckout
                                ? "Available after validation"
                                : orderCheckoutLoading === sku
                                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                                  : "Buy usage pack"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="mb-14">
              <div className="text-center mb-6">
                <Store className="h-7 w-7 mx-auto text-primary mb-2" />
                <h2 className="text-3xl font-display font-bold">Marketplace fees</h2>
                <p className="text-muted-foreground mt-2">
                  These rates apply when marketplace selling is enabled. ScrollLibrary service fee only; payment processing,
                  taxes, refunds and currency conversion are separate.
                </p>
                {!FEATURES.enableMarketplace && <Badge variant="secondary" className="mt-3">Marketplace selling is not open yet</Badge>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(["free", "student", "premium", "prophet_tier"] as SubscriptionTier[]).map((key) => {
                  const config = SUBSCRIPTION_TIERS[key];
                  return (
                    <Card key={key}>
                      <CardContent className="p-5 text-center">
                        <div className="font-medium">{config.name}</div>
                        <div className="text-3xl font-bold mt-1">{config.features.marketplaceFeeBps / 100}%</div>
                        <div className="text-xs text-muted-foreground mt-1">ScrollLibrary service fee when selling is available</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {isSubscribed && (
              <div className="text-center mb-12">
                <Button variant="outline" onClick={handleManageSubscription} disabled={portalLoading}>
                  {portalLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opening…</> : "Manage subscription"}
                </Button>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-8 text-muted-foreground border-t pt-8">
              <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><span className="text-sm">Stripe billing lifecycle remains fail-closed</span></div>
              <div className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /><span className="text-sm">Feature access still respects GA gates</span></div>
              <div className="flex items-center gap-2"><Volume2 className="h-5 w-5 text-primary" /><span className="text-sm">No unlimited AI promises</span></div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
