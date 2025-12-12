import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Crown, Zap, BookOpen, Download, Volume2, Shield, Loader2, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  description: string;
  price: string;
  period: string;
  icon: typeof Sparkles;
  popular?: boolean;
  features: PlanFeature[];
  buttonText: string;
  buttonVariant: "outline" | "hero" | "gold";
}

const plans: Plan[] = [
  {
    name: "Free",
    description: "Perfect for exploring ScrollLibrary",
    price: "$0",
    period: "forever",
    icon: BookOpen,
    features: [
      { text: "Read 5 AI-generated books/month", included: true },
      { text: "Basic reader tools", included: true },
      { text: "Low-quality PDF export only", included: true },
      { text: "Community support", included: true },
      { text: "Book generation", included: false },
      { text: "AI-generated covers", included: false },
      { text: "Text-to-Speech audio", included: false },
      { text: "Commercial publishing rights", included: false },
    ],
    buttonText: "Get Started",
    buttonVariant: "outline",
  },
  {
    name: "Student",
    description: "Discounted plan for students",
    price: "$9",
    period: "/month",
    icon: GraduationCap,
    features: [
      { text: "Generate up to 10 books/month", included: true },
      { text: "Up to 4,000 words per chapter", included: true },
      { text: "PDF, EPUB, DOCX exports", included: true },
      { text: "AI-generated covers", included: true },
      { text: "30 minutes TTS audio/month", included: true },
      { text: "Student verification required", included: true },
      { text: "Commercial publishing rights", included: false },
      { text: "Priority support", included: false },
    ],
    buttonText: "Student Plan",
    buttonVariant: "outline",
  },
  {
    name: "Premium",
    description: "For serious readers and creators",
    price: "$19",
    period: "/month",
    icon: Zap,
    popular: true,
    features: [
      { text: "Unlimited books", included: true },
      { text: "Up to 6,000 words per chapter", included: true },
      { text: "All export formats (PDF/EPUB/DOCX/MOBI)", included: true },
      { text: "AI-generated covers", included: true },
      { text: "60 minutes TTS audio/month", included: true },
      { text: "Commercial publishing rights", included: true },
      { text: "Priority support", included: true },
      { text: "ElevenLabs premium TTS", included: false },
    ],
    buttonText: "Subscribe Now",
    buttonVariant: "hero",
  },
  {
    name: "Prophet Tier",
    description: "The ultimate scroll experience",
    price: "$49",
    period: "/month",
    icon: Crown,
    features: [
      { text: "Everything in Premium", included: true },
      { text: "Up to 6,000 words per chapter", included: true },
      { text: "Unlimited ElevenLabs TTS", included: true },
      { text: "50-book batch generator", included: true },
      { text: "AI Research Assistant", included: true },
      { text: "ScrollProphetGPT deep-alignment", included: true },
      { text: "White-glove publishing formatting", included: true },
      { text: "Early access to new features", included: true },
    ],
    buttonText: "Upgrade to Prophet",
    buttonVariant: "gold",
  },
];

export default function Pricing() {
  const { user, tier, isSubscribed, isLoading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSelectPlan = async (planName: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const tierKey = planName.toLowerCase().replace(" ", "_") as keyof typeof SUBSCRIPTION_TIERS;
    
    if (tierKey === "free") {
      navigate("/explore");
      return;
    }

    // Get the price ID for this tier
    const priceId = SUBSCRIPTION_TIERS[tierKey]?.price_id;
    if (!priceId) {
      toast({
        title: "Configuration Error",
        description: "This plan is not yet configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(planName);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout Failed",
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

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Portal error:", error);
      toast({
        title: "Error",
        description: error.message || "Unable to open subscription portal.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const getPlanButtonContent = (plan: Plan) => {
    const tierKey = plan.name.toLowerCase().replace(" ", "_");
    const isCurrentPlan = tier === tierKey;
    const isLoadingThis = checkoutLoading === plan.name;

    if (isLoadingThis) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      );
    }

    if (isCurrentPlan) {
      return "Current Plan";
    }

    return plan.buttonText;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="text-center mb-16">
              <Badge variant="outline" className="mb-4 border-scroll-gold text-scroll-gold">
                <Sparkles className="h-3 w-3 mr-1" />
                Pricing Plans
              </Badge>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-gradient-gold mb-4">
                Choose Your Plan
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Unlock the full power of ScrollLibrary with plans designed for every reader and creator.
              </p>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-scroll-gold text-primary-foreground">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <Card className={`h-full bg-gradient-card border-border/50 ${
                    plan.popular ? "border-scroll-gold/50 shadow-lg shadow-scroll-gold/10" : ""
                  }`}>
                    <CardHeader className="text-center pb-4">
                      <div className={`mx-auto p-3 rounded-xl w-fit ${
                        plan.popular ? "bg-scroll-gold/20" : "bg-muted/50"
                      }`}>
                        <plan.icon className={`h-8 w-8 ${
                          plan.popular ? "text-scroll-gold" : "text-foreground"
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
                              feature.included ? "text-scroll-gold" : "text-muted-foreground/30"
                            }`} />
                            <span className={feature.included ? "text-foreground" : "text-muted-foreground/50 line-through"}>
                              {feature.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={plan.buttonVariant}
                        className="w-full mt-6"
                        onClick={() => handleSelectPlan(plan.name)}
                        disabled={tier === plan.name.toLowerCase().replace(" ", "_") || !!checkoutLoading}
                      >
                        {getPlanButtonContent(plan)}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Manage Subscription */}
            {isSubscribed && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-16 text-center"
              >
                <Card className="bg-gradient-card border-scroll-gold/30 max-w-md mx-auto">
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground mb-4">
                      Manage your subscription, update payment method, or cancel anytime.
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                    >
                      {portalLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        "Manage Subscription"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* FAQ Section */}
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                Questions?
              </h2>
              <p className="text-muted-foreground mb-6">
                Visit our Help Center or contact support for more information.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => navigate("/help")}>
                  View FAQ
                </Button>
                <Button variant="ghost" onClick={() => navigate("/support")}>
                  Contact Support
                </Button>
              </div>
            </div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mt-16 pt-8 border-t border-border/50"
            >
              <div className="flex flex-wrap justify-center gap-8 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-scroll-gold" />
                  <span className="text-sm">Secure Payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-scroll-gold" />
                  <span className="text-sm">Instant Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-scroll-gold" />
                  <span className="text-sm">Cancel Anytime</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
