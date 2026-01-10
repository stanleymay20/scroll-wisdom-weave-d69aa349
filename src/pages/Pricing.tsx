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
import { useLanguage } from "@/contexts/LanguageContext";

interface PlanFeature {
  textKey: string;
  included: boolean;
}

interface Plan {
  nameKey: string;
  descriptionKey: string;
  price: string;
  periodKey: string;
  icon: typeof Sparkles;
  popular?: boolean;
  features: PlanFeature[];
  buttonTextKey: string;
  buttonVariant: "outline" | "hero" | "gold";
  tierKey: string;
}

const plans: Plan[] = [
  {
    nameKey: "pricing.free",
    descriptionKey: "pricing.freeDesc",
    price: "$0",
    periodKey: "pricing.forever",
    icon: BookOpen,
    tierKey: "free",
    features: [
      { textKey: "pricing.feature.read5", included: true },
      { textKey: "pricing.feature.basicReader", included: true },
      { textKey: "pricing.feature.lowQualityPdf", included: true },
      { textKey: "pricing.feature.communitySupport", included: true },
      { textKey: "pricing.feature.bookGen", included: false },
      { textKey: "pricing.feature.aiCovers", included: false },
      { textKey: "pricing.feature.ttsAudio", included: false },
      { textKey: "pricing.feature.commercial", included: false },
    ],
    buttonTextKey: "pricing.getStarted",
    buttonVariant: "outline",
  },
  {
    nameKey: "pricing.student",
    descriptionKey: "pricing.studentDesc",
    price: "$9",
    periodKey: "pricing.perMonth",
    icon: GraduationCap,
    tierKey: "student",
    features: [
      { textKey: "pricing.feature.gen10", included: true },
      { textKey: "pricing.feature.4000words", included: true },
      { textKey: "pricing.feature.allExports", included: true },
      { textKey: "pricing.feature.aiCovers", included: true },
      { textKey: "pricing.feature.tts30", included: true },
      { textKey: "pricing.feature.studentVerify", included: true },
      { textKey: "pricing.feature.commercial", included: false },
      { textKey: "pricing.feature.prioritySupport", included: false },
    ],
    buttonTextKey: "pricing.studentPlan",
    buttonVariant: "outline",
  },
  {
    nameKey: "pricing.premium",
    descriptionKey: "pricing.premiumDesc",
    price: "$19",
    periodKey: "pricing.perMonth",
    icon: Zap,
    popular: true,
    tierKey: "premium",
    features: [
      { textKey: "pricing.feature.unlimited", included: true },
      { textKey: "pricing.feature.6000words", included: true },
      { textKey: "pricing.feature.allFormats", included: true },
      { textKey: "pricing.feature.aiCovers", included: true },
      { textKey: "pricing.feature.tts60", included: true },
      { textKey: "pricing.feature.commercial", included: true },
      { textKey: "pricing.feature.prioritySupport", included: true },
      { textKey: "pricing.feature.elevenLabs", included: false },
    ],
    buttonTextKey: "pricing.subscribe",
    buttonVariant: "hero",
  },
  {
    nameKey: "pricing.prophet",
    descriptionKey: "pricing.prophetDesc",
    price: "$49",
    periodKey: "pricing.perMonth",
    icon: Crown,
    tierKey: "prophet_tier",
    features: [
      { textKey: "pricing.feature.everything", included: true },
      { textKey: "pricing.feature.6000words", included: true },
      { textKey: "pricing.feature.unlimitedTts", included: true },
      { textKey: "pricing.feature.batch50", included: true },
      { textKey: "pricing.feature.aiResearch", included: true },
      { textKey: "pricing.feature.scrollProphet", included: true },
      { textKey: "pricing.feature.whiteGlove", included: true },
      { textKey: "pricing.feature.earlyAccess", included: true },
    ],
    buttonTextKey: "pricing.upgradeProphet",
    buttonVariant: "gold",
  },
];

// Feature text translations (fallback to English)
const featureTexts: Record<string, string> = {
  "pricing.feature.read5": "Read 5 AI-generated books/month",
  "pricing.feature.basicReader": "Basic reader tools",
  "pricing.feature.lowQualityPdf": "Low-quality PDF export only",
  "pricing.feature.communitySupport": "Community support",
  "pricing.feature.bookGen": "Book generation",
  "pricing.feature.aiCovers": "AI-generated covers",
  "pricing.feature.ttsAudio": "Text-to-Speech audio",
  "pricing.feature.commercial": "Commercial publishing rights",
  "pricing.feature.gen10": "Generate up to 10 books/month",
  "pricing.feature.4000words": "Up to 4,000 words per chapter",
  "pricing.feature.allExports": "PDF, EPUB, DOCX exports",
  "pricing.feature.tts30": "30 minutes TTS audio/month",
  "pricing.feature.studentVerify": "Student verification required",
  "pricing.feature.prioritySupport": "Priority support",
  "pricing.feature.unlimited": "Unlimited books",
  "pricing.feature.6000words": "Up to 6,000 words per chapter",
  "pricing.feature.allFormats": "All export formats (PDF/EPUB/DOCX/MOBI)",
  "pricing.feature.tts60": "60 minutes TTS audio/month",
  "pricing.feature.elevenLabs": "ElevenLabs premium TTS",
  "pricing.feature.everything": "Everything in Premium",
  "pricing.feature.unlimitedTts": "Unlimited ElevenLabs TTS",
  "pricing.feature.batch50": "50-book batch generator",
  "pricing.feature.aiResearch": "AI Research Assistant",
  "pricing.feature.scrollProphet": "ScrollProphetGPT deep-alignment",
  "pricing.feature.whiteGlove": "White-glove publishing formatting",
  "pricing.feature.earlyAccess": "Early access to new features",
  "pricing.forever": "forever",
  "pricing.perMonth": "/month",
  "pricing.freeDesc": "Perfect for exploring ScrollLibrary",
  "pricing.studentDesc": "Discounted plan for students",
  "pricing.premiumDesc": "For serious readers and creators",
  "pricing.prophetDesc": "The ultimate scroll experience",
};

export default function Pricing() {
  const { user, tier, isSubscribed, isLoading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  const getFeatureText = (key: string) => featureTexts[key] || key;
  const getPlanName = (key: string) => t(key) || key.split('.').pop();
  const getPlanDesc = (key: string) => featureTexts[key] || key;

  const handleSelectPlan = async (planTierKey: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (planTierKey === "free") {
      navigate("/explore");
      return;
    }

    const priceId = SUBSCRIPTION_TIERS[planTierKey as keyof typeof SUBSCRIPTION_TIERS]?.price_id;
    if (!priceId) {
      toast({
        title: t('common.error'),
        description: "This plan is not yet configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(planTierKey);

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
        title: t('common.error'),
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

      if (data?.error) {
        // Handle Stripe permission errors gracefully
        if (data.error.includes("rak_customer_portal_write") || data.error.includes("does not have the required permissions")) {
          toast({ 
            title: "Billing Portal Unavailable", 
            description: "The billing portal is temporarily unavailable. Please contact support or check your email for subscription management links.", 
            variant: "default" 
          });
          return;
        }
        throw new Error(data.error);
      }

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Portal error:", error);
      // Handle Stripe permission errors at catch level too
      if (error.message?.includes("rak_customer_portal_write") || error.message?.includes("does not have the required permissions")) {
        toast({ 
          title: "Billing Portal Unavailable", 
          description: "The billing portal is temporarily unavailable. Please contact support for subscription management.", 
          variant: "default" 
        });
        return;
      }
      toast({
        title: t('common.error'),
        description: error.message || "Unable to open subscription portal.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const getPlanButtonContent = (plan: Plan) => {
    const isCurrentPlan = tier === plan.tierKey;
    const isLoadingThis = checkoutLoading === plan.tierKey;

    if (isLoadingThis) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('pricing.processing')}
        </>
      );
    }

    if (isCurrentPlan) {
      return t('pricing.current');
    }

    return t(plan.buttonTextKey);
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
                {t('pricing.plans')}
              </Badge>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-gradient-gold mb-4">
                {t('pricing.title')}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                {t('pricing.subtitle')}
              </p>
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {plans.map((plan, index) => (
                <motion.div
                  key={plan.tierKey}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-scroll-gold text-primary-foreground">
                        {t('pricing.popular')}
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
                        {getPlanName(plan.nameKey)}
                      </CardTitle>
                      <CardDescription>{getPlanDesc(plan.descriptionKey)}</CardDescription>
                      <div className="mt-4">
                        <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                        <span className="text-muted-foreground">{featureTexts[plan.periodKey]}</span>
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
                              {getFeatureText(feature.textKey)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={plan.buttonVariant}
                        className="w-full mt-6"
                        onClick={() => handleSelectPlan(plan.tierKey)}
                        disabled={tier === plan.tierKey || !!checkoutLoading}
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
                      {t('pricing.manageSubscriptionDesc')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                    >
                      {portalLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('pricing.opening')}
                        </>
                      ) : (
                        t('pricing.manageSubscription')
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* FAQ Section */}
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-foreground mb-4">
                {t('pricing.questions')}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t('pricing.questionsSubtitle')}
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => navigate("/help")}>
                  {t('pricing.viewFaq')}
                </Button>
                <Button variant="ghost" onClick={() => navigate("/support")}>
                  {t('pricing.contactSupport')}
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
                  <span className="text-sm">{t('pricing.securePayments')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-scroll-gold" />
                  <span className="text-sm">{t('pricing.instantAccess')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-scroll-gold" />
                  <span className="text-sm">{t('pricing.cancelAnytime')}</span>
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