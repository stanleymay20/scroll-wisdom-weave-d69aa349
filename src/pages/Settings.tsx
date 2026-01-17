import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Settings as SettingsIcon, Palette, Bell, Brain, Shield, CreditCard,
  Save, Trash2, Download, Moon, Sun, Type, Volume2, Crown, HardDrive, Loader2,
  Info, ExternalLink, FileText, CheckCircle
} from "lucide-react";
import { StorageManager } from "@/components/pwa/StorageManager";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePagePerformance } from "@/lib/performance";

interface SettingsData {
  theme_preference: string;
  font_size: string;
  reader_theme: string;
  tts_enabled: boolean;
  animations_enabled: boolean;
  email_updates: boolean;
  new_book_alerts: boolean;
  course_reminders: boolean;
  writing_tone: string;
  spiritual_strictness: string;
  complexity_level: string;
  study_speed: string;
  ai_voice_preference: string;
}

const defaultSettings: SettingsData = {
  theme_preference: "dark",
  font_size: "medium",
  reader_theme: "default",
  tts_enabled: true,
  animations_enabled: true,
  email_updates: true,
  new_book_alerts: true,
  course_reminders: true,
  writing_tone: "scholarly",
  spiritual_strictness: "balanced",
  complexity_level: "intermediate",
  study_speed: "normal",
  ai_voice_preference: "natural",
};

export default function Settings() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tier, ttsMinutesUsed, subscriptionEnd } = useSubscription();
  const ttsLimit = SUBSCRIPTION_TIERS[tier].features.ttsMinutes;
  
  // PERFORMANCE: Track TTI
  usePagePerformance('Settings');

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      
      if (error) {
        // Check if it's a "no customer" error
        if (error.message?.includes("No Stripe customer")) {
          toast({ 
            title: "No Subscription Found", 
            description: "You don't have an active subscription yet. Subscribe first to manage billing.", 
            variant: "default" 
          });
          navigate("/pricing");
          return;
        }
        throw error;
      }
      
      if (data?.error) {
        // Handle Stripe permission errors gracefully
        if (data.error.includes("rak_customer_portal_write") || data.error.includes("does not have the required permissions")) {
          toast({ 
            title: "Billing Portal Unavailable", 
            description: "The billing portal is temporarily unavailable. Please contact support or visit your email for subscription management links.", 
            variant: "default" 
          });
          return;
        }
        // Handle server-side error response
        if (data.error.includes("No Stripe customer")) {
          toast({ 
            title: "No Subscription Found", 
            description: "You don't have an active subscription yet. Subscribe first to manage billing.", 
            variant: "default" 
          });
          navigate("/pricing");
          return;
        }
        throw new Error(data.error);
      }
      
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (error: any) {
      console.error("Billing portal error:", error);
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
        description: error.message || t('settings.billingError'), 
        variant: "destructive" 
      });
    } finally {
      setPortalLoading(false);
    }
  };
  useEffect(() => {
    checkAuth();
  }, []);

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    if (!user || isLoading) return;
    
    const saveTimeout = setTimeout(() => {
      handleSaveSettings();
    }, 1000); // Debounce 1 second
    
    return () => clearTimeout(saveTimeout);
  }, [settings]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUser(user);
    await fetchSettings(user.id);
    setIsLoading(false);
  };

  const fetchSettings = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("theme_preference, font_size, reader_theme, tts_enabled, animations_enabled, email_updates, new_book_alerts, course_reminders, writing_tone, spiritual_strictness, complexity_level, study_speed, ai_voice_preference")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      setSettings({
        theme_preference: data.theme_preference || "dark",
        font_size: data.font_size || "medium",
        reader_theme: data.reader_theme || "default",
        tts_enabled: data.tts_enabled ?? true,
        animations_enabled: data.animations_enabled ?? true,
        email_updates: data.email_updates ?? true,
        new_book_alerts: data.new_book_alerts ?? true,
        course_reminders: data.course_reminders ?? true,
        writing_tone: data.writing_tone || "scholarly",
        spiritual_strictness: data.spiritual_strictness || "balanced",
        complexity_level: data.complexity_level || "intermediate",
        study_speed: data.study_speed || "normal",
        ai_voice_preference: data.ai_voice_preference || "natural",
      });
    }
  };

  const handleSaveSettings = async () => {
    if (!user || isSaving) return;
    setIsSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Settings save error:", error);
    }
    setIsSaving(false);
  };

  const handleDeleteAccount = () => {
    // Navigate to dedicated account deletion page (Apple App Store requirement)
    navigate("/account/delete");
  };

  const handleExportData = async () => {
    toast({
      title: t('settings.dataExport'),
      description: t('settings.dataExportDesc'),
    });
  };

  // PERFORMANCE: Show skeleton UI immediately instead of blocking loader
  if (isLoading) {
    const LoadingSkeleton = (
      <div className={isMobile ? "px-4 py-4" : "container mx-auto px-4 max-w-4xl"}>
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-12 w-full" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="bg-gradient-card border-border/50">
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
    
    if (isMobile) {
      return <MobileLayout>{LoadingSkeleton}</MobileLayout>;
    }
    
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          {LoadingSkeleton}
        </main>
        <Footer />
      </div>
    );
  }

  // Settings content - shared between mobile and desktop
  const SettingsContent = (
    <div className={isMobile ? "px-4 py-4 pb-24" : ""}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-6">
          <h1 className={`font-display font-bold text-gradient-gold mb-2 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>
            {t('settings.title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('settings.subtitle')}</p>
        </div>

        <Tabs defaultValue="system" className="space-y-4">
          <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1 w-full justify-start overflow-x-auto">
            <TabsTrigger value="system" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Palette className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t('settings.system')}</span>
              <span className="sm:hidden">Theme</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Bell className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t('settings.notifications')}</span>
              <span className="sm:hidden">Alerts</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Brain className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t('settings.ai')}</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <CreditCard className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t('settings.billing')}</span>
              <span className="sm:hidden">Plan</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <HardDrive className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Storage</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
            <TabsTrigger value="about" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Info className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">About & Trust</span>
              <span className="sm:hidden">About</span>
            </TabsTrigger>
          </TabsList>

              {/* Billing Tab */}
              <TabsContent value="billing" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5 text-scroll-gold" />
                      {t('settings.subscriptionBilling')}
                    </CardTitle>
                    <CardDescription>{t('settings.manageYourPlan')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.currentPlan')}</Label>
                        <p className="text-lg font-semibold text-scroll-gold">{SUBSCRIPTION_TIERS[tier].name}</p>
                      </div>
                      <Button variant="outline" onClick={() => navigate("/pricing")}>
                        {tier === 'free' ? t('common.upgrade') : t('settings.changePlan')}
                      </Button>
                    </div>
                    {subscriptionEnd && (
                      <p className="text-sm text-muted-foreground">
                        {t('settings.renews')}: {new Date(subscriptionEnd).toLocaleDateString()}
                      </p>
                    )}
                    <Separator className="bg-border/50" />
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>{t('settings.ttsUsage')}</Label>
                        <span className="text-sm text-muted-foreground">
                          {ttsMinutesUsed} / {ttsLimit === -1 ? '∞' : ttsLimit} min
                        </span>
                      </div>
                      {ttsLimit > 0 && (
                        <Progress value={(ttsMinutesUsed / ttsLimit) * 100} className="h-2" />
                      )}
                    </div>
                    <Separator className="bg-border/50" />
                    {tier !== 'free' && (
                      <Button variant="outline" onClick={handleManageBilling} disabled={portalLoading}>
                        {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                        {t('settings.manageBilling')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Storage Tab */}
              <TabsContent value="storage" className="space-y-6">
                <StorageManager />
              </TabsContent>

              {/* About & Trust Tab */}
              <TabsContent value="about" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Trust & Verification
                    </CardTitle>
                    <CardDescription>
                      ScrollLibrary operates as a credential authority with transparent verification
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      <Link 
                        to="/docs/trust-whitepaper" 
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          <div>
                            <div className="font-medium">Trust Whitepaper</div>
                            <div className="text-sm text-muted-foreground">
                              Formal governance document defining our credential authority
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </Link>

                      <Link 
                        to="/docs/verification" 
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          <div>
                            <div className="font-medium">Verification API</div>
                            <div className="text-sm text-muted-foreground">
                              Public API documentation for certificate verification
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </Link>

                      <Link 
                        to="/verify" 
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          <div>
                            <div className="font-medium">Organization Verification</div>
                            <div className="text-sm text-muted-foreground">
                              Batch verification dashboard for employers & institutions
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="space-y-2">
                      <Label>Trust Guarantees</Label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Public verification</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Integrity scoring</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Immutable issuance</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>No login required</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-primary" />
                      About ScrollLibrary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      ScrollLibrary is a credential authority for the post-AI learning era. 
                      We issue verifiable certificates based on behavioral integrity, not AI detection.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/about">
                        <Button variant="outline" size="sm">
                          About Us
                        </Button>
                      </Link>
                      <Link to="/privacy">
                        <Button variant="ghost" size="sm">
                          Privacy Policy
                        </Button>
                      </Link>
                      <Link to="/terms">
                        <Button variant="ghost" size="sm">
                          Terms of Service
                        </Button>
                      </Link>
                    </div>
                    <Separator className="bg-border/50" />
                    <div className="text-xs text-muted-foreground">
                      <p>Schema Version: 7.0</p>
                      <p>Credential Authority: ScrollLibrary Certification Authority</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      {t('settings.appearance')}
                    </CardTitle>
                    <CardDescription>{t('settings.appearanceDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Light/Dark Mode */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.mode')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.modeDesc')}</p>
                      </div>
                      <Select
                        value={settings.theme_preference}
                        onValueChange={(value) => {
                          setSettings(s => ({ ...s, theme_preference: value }));
                          localStorage.setItem('theme-mode', value);
                          if (value === 'light') {
                            document.documentElement.setAttribute('data-theme', 'light');
                          } else {
                            const colorTheme = localStorage.getItem('color-theme') || 'gold';
                            document.documentElement.setAttribute('data-theme', colorTheme);
                          }
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">
                            <div className="flex items-center gap-2">
                              <Moon className="h-4 w-4" />
                              {t('settings.dark')}
                            </div>
                          </SelectItem>
                          <SelectItem value="light">
                            <div className="flex items-center gap-2">
                              <Sun className="h-4 w-4" />
                              {t('settings.light')}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    {/* Color Theme Picker */}
                    <div className="space-y-3">
                      <div className="space-y-0.5">
                        <Label>{t('settings.colorTheme')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.colorThemeDesc')}</p>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {[
                          { id: 'gold', label: t('settings.gold'), color: 'bg-amber-500' },
                          { id: 'orange', label: t('settings.orange'), color: 'bg-orange-500' },
                          { id: 'blue', label: t('settings.blue'), color: 'bg-blue-500' },
                          { id: 'purple', label: t('settings.purple'), color: 'bg-purple-500' },
                          { id: 'green', label: t('settings.green'), color: 'bg-emerald-500' },
                          { id: 'rainbow', label: t('settings.rainbow'), color: 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500' },
                        ].map((theme) => {
                          const currentColorTheme = localStorage.getItem('color-theme') || 'gold';
                          const isActive = currentColorTheme === theme.id;
                          return (
                            <button
                              key={theme.id}
                              onClick={() => {
                                localStorage.setItem('color-theme', theme.id);
                                // Apply the theme immediately if not in light mode
                                const themeMode = localStorage.getItem('theme-mode') || settings.theme_preference;
                                if (themeMode !== 'light') {
                                  document.documentElement.setAttribute('data-theme', theme.id);
                                }
                                // Force re-render to update active state
                                setSettings(s => ({ ...s }));
                              }}
                              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                                isActive 
                                  ? 'border-primary ring-2 ring-primary/30 bg-primary/10' 
                                  : 'border-border/50 hover:border-primary/50'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-full ${theme.color}`} />
                              <span className="text-xs font-medium">{theme.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Separator className="bg-border/50" />

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.fontSize')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.fontSizeDesc')}</p>
                      </div>
                      <Select
                        value={settings.font_size}
                        onValueChange={(value) => setSettings(s => ({ ...s, font_size: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">{t('settings.small')}</SelectItem>
                          <SelectItem value="medium">{t('settings.medium')}</SelectItem>
                          <SelectItem value="large">{t('settings.large')}</SelectItem>
                          <SelectItem value="xlarge">{t('settings.extraLarge')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.readerTheme')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.readerThemeDesc')}</p>
                      </div>
                      <Select
                        value={settings.reader_theme}
                        onValueChange={(value) => setSettings(s => ({ ...s, reader_theme: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">{t('settings.default')}</SelectItem>
                          <SelectItem value="sepia">{t('settings.sepia')}</SelectItem>
                          <SelectItem value="dark">{t('settings.dark')}</SelectItem>
                          <SelectItem value="paper">{t('settings.paper')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.ttsVoice')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.ttsVoiceDesc')}</p>
                      </div>
                      <Select
                        value={settings.ai_voice_preference}
                        onValueChange={(value) => setSettings(s => ({ ...s, ai_voice_preference: value }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="natural">{t('settings.natural')}</SelectItem>
                          <SelectItem value="professional">{t('settings.professional')}</SelectItem>
                          <SelectItem value="warm">{t('settings.warm')}</SelectItem>
                          <SelectItem value="clear">{t('settings.clear')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.enableTTS')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.enableTTSDesc')}</p>
                      </div>
                      <Switch
                        checked={settings.tts_enabled}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, tts_enabled: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.enableAnimations')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.enableAnimationsDesc')}</p>
                      </div>
                      <Switch
                        checked={settings.animations_enabled}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, animations_enabled: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      {t('settings.notificationPrefs')}
                    </CardTitle>
                    <CardDescription>{t('settings.notificationPrefsDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.emailUpdates')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.emailUpdatesDesc')}</p>
                      </div>
                      <Switch
                        checked={settings.email_updates}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, email_updates: checked }))}
                      />
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.newBookAlerts')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.newBookAlertsDesc')}</p>
                      </div>
                      <Switch
                        checked={settings.new_book_alerts}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, new_book_alerts: checked }))}
                      />
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.courseReminders')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.courseRemindersDesc')}</p>
                      </div>
                      <Switch
                        checked={settings.course_reminders}
                        onCheckedChange={(checked) => setSettings(s => ({ ...s, course_reminders: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ai" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      {t('settings.aiPrefs')}
                    </CardTitle>
                    <CardDescription>{t('settings.aiPrefsDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.writingTone')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.writingToneDesc')}</p>
                      </div>
                      <Select
                        value={settings.writing_tone}
                        onValueChange={(value) => setSettings(s => ({ ...s, writing_tone: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scholarly">{t('settings.scholarly')}</SelectItem>
                          <SelectItem value="conversational">{t('settings.conversational')}</SelectItem>
                          <SelectItem value="formal">{t('settings.formal')}</SelectItem>
                          <SelectItem value="inspirational">{t('settings.inspirational')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.spiritualAlignment')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.spiritualAlignmentDesc')}</p>
                      </div>
                      <Select
                        value={settings.spiritual_strictness}
                        onValueChange={(value) => setSettings(s => ({ ...s, spiritual_strictness: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relaxed">{t('settings.relaxed')}</SelectItem>
                          <SelectItem value="balanced">{t('settings.balanced')}</SelectItem>
                          <SelectItem value="strict">{t('settings.strict')}</SelectItem>
                          <SelectItem value="prophetic">{t('settings.prophetic')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.complexityLevel')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.complexityLevelDesc')}</p>
                      </div>
                      <Select
                        value={settings.complexity_level}
                        onValueChange={(value) => setSettings(s => ({ ...s, complexity_level: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">{t('settings.beginner')}</SelectItem>
                          <SelectItem value="intermediate">{t('settings.intermediate')}</SelectItem>
                          <SelectItem value="advanced">{t('settings.advanced')}</SelectItem>
                          <SelectItem value="expert">{t('settings.expert')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.studySpeed')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.studySpeedDesc')}</p>
                      </div>
                      <Select
                        value={settings.study_speed}
                        onValueChange={(value) => setSettings(s => ({ ...s, study_speed: value }))}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relaxed">{t('settings.relaxed')}</SelectItem>
                          <SelectItem value="normal">{t('settings.normal')}</SelectItem>
                          <SelectItem value="intensive">{t('settings.intensive')}</SelectItem>
                          <SelectItem value="accelerated">{t('settings.accelerated')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="privacy" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      {t('settings.privacyData')}
                    </CardTitle>
                    <CardDescription>{t('settings.privacyDataDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>{t('settings.exportYourData')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.exportYourDataDesc')}</p>
                      </div>
                      <Button variant="outline" onClick={handleExportData}>
                        <Download className="h-4 w-4 mr-2" />
                        {t('settings.export')}
                      </Button>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-destructive">{t('settings.deleteAccount')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.deleteAccountDesc')}</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('settings.delete')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('settings.areYouSure')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('settings.deleteWarning')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground">
                              {t('settings.deleteAccount')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {isSaving ? t('settings.saving') : "Changes auto-save"}
              </p>
              <Button onClick={handleSaveSettings} disabled={isSaving} variant="gold">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('settings.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {t('settings.saveAll')}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      );

  // Mobile uses MobileLayout wrapper, desktop uses traditional layout
  if (isMobile) {
    return <MobileLayout>{SettingsContent}</MobileLayout>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {SettingsContent}
        </div>
      </main>
      <Footer />
    </div>
  );
}
