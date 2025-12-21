import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, BookOpen, Loader2, CheckCircle, Upload, Wand2, Lock, Crown, Rocket, ImageIcon, BookImage, GraduationCap, AlertTriangle } from "lucide-react";
import { isAcademicCategory, CITATION_STYLES } from "@/lib/academicCategories";
import { AcademicModeIndicator, AcademicDisclaimer } from "@/components/academic/AcademicModeIndicator";
import { Switch } from "@/components/ui/switch";
import { CoverUpload } from "@/components/books/CoverUpload";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getWordCountOptions, SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { LAUNCH_MODE, LAUNCH_MODE_CONFIG } from "@/lib/config";
import { useEntitlements } from "@/hooks/useEntitlements";
import { LaunchBanner } from "@/components/subscription/LaunchBanner";
import { useLanguage } from "@/contexts/LanguageContext";

const CATEGORIES = [
  { value: "theology", labelKey: "categories.theology" },
  { value: "prophecy", labelKey: "categories.prophecy" },
  { value: "science", labelKey: "categories.science" },
  { value: "technology", labelKey: "categories.technology" },
  { value: "business", labelKey: "categories.business" },
  { value: "finance", labelKey: "categories.finance" },
  { value: "economics", labelKey: "categories.economics" },
  { value: "medicine", labelKey: "categories.medicine" },
  { value: "law", labelKey: "categories.law" },
  { value: "governance", labelKey: "categories.governance" },
  { value: "history", labelKey: "categories.history" },
  { value: "african_studies", labelKey: "categories.african_studies" },
  { value: "culture", labelKey: "categories.culture" },
  { value: "philosophy", labelKey: "categories.philosophy" },
  { value: "arts", labelKey: "categories.arts" },
  { value: "fiction", labelKey: "categories.fiction" },
  { value: "non_fiction", labelKey: "categories.non_fiction" },
  { value: "poetry", labelKey: "categories.poetry" },
];

export default function Generate() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { 
    user, 
    tier, 
    canGenerateBooks, 
    isLoading: subLoading,
    dailyLimitInfo,
    incrementDailyBookCount,
    maxWordCount 
  } = useSubscription();
  
  // Use centralized entitlements - SINGLE SOURCE OF TRUTH
  const entitlements = useEntitlements();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [numChapters, setNumChapters] = useState("10");
  const [wordCount, setWordCount] = useState("4000");
  const [language, setLanguage] = useState("en");
  const [coverOption, setCoverOption] = useState<"ai" | "upload">("ai");
  const [customCover, setCustomCover] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string[]>([]);
  const [bookType, setBookType] = useState<"text" | "illustrated" | "comic">("text");
  const [enableReferences, setEnableReferences] = useState(false);
  const [citationStyle, setCitationStyle] = useState("APA");
  const [generationMode, setGenerationMode] = useState<"learning" | "academic">("learning");
  const { toast } = useToast();

  // Auto-enable academic mode for academic categories
  useEffect(() => {
    if (category && isAcademicCategory(category) && bookType === "text") {
      setGenerationMode("academic");
      setEnableReferences(true);
    }
  }, [category, bookType]);

  // Get word count options based on tier and launch mode
  const wordCountOptions = (() => {
    // Admin and Prophet get all word count options
    if (entitlements.isAdmin || entitlements.isProphet) return [2000, 3000, 4000, 5000, 6000];
    if (LAUNCH_MODE && tier === 'free') {
      return [2000, 3000, 4000].filter(w => w <= LAUNCH_MODE_CONFIG.freeMaxWordCount);
    }
    return getWordCountOptions(tier);
  })();

  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "es", label: "Spanish" },
    { code: "ar", label: "Arabic" },
    { code: "sw", label: "Swahili" },
    { code: "pt", label: "Portuguese" },
  ];

  const handleGenerate = async () => {
    if (!title || !category) {
      toast({
        title: t('generate.missingInfo'),
        description: t('generate.provideTitleCategory'),
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: t('generate.signInRequired'),
        description: t('generate.signInToGenerate'),
      });
      navigate("/auth");
      return;
    }

    // Admin and Prophet ALWAYS can generate - no upgrade prompts
    if (!entitlements.canGenerateBooks && !entitlements.isAdmin && !entitlements.isProphet) {
      toast({
        title: t('generate.subscriptionRequired'),
        description: t('generate.upgradeToGenerate'),
        variant: "destructive",
      });
      navigate("/pricing");
      return;
    }

    // Check daily limit for free tier in launch mode (admin/prophet/paid bypass)
    if (!entitlements.isPaid && LAUNCH_MODE && tier === 'free' && !dailyLimitInfo.canGenerateToday) {
      toast({
        title: t('generate.dailyLimitReached'),
        description: `${t('generate.dailyLimitDesc')} (${LAUNCH_MODE_CONFIG.freeBookLimit} book/day)`,
        variant: "destructive",
      });
      navigate("/pricing");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress([]);

    try {
      setGenerationProgress((prev) => [...prev, t('generate.initializingAI')]);
      
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: {
          title,
          description,
          category,
          numChapters: parseInt(numChapters),
          wordCount: bookType === "comic" ? 500 : parseInt(wordCount),
          language,
          userId: user.id,
          customCover: coverOption === "upload" ? customCover : null,
          bookType,
          enableReferences: generationMode === "academic",
          citationStyle,
          academicMode: generationMode === "academic",
        },
      });

      if (error) throw error;

      setGenerationProgress((prev) => [
        ...prev,
        t('generate.outlineCreated'),
        t('generate.chaptersDefined'),
        t('generate.bookSaved'),
      ]);

      // Increment daily count for free tier in launch mode (paid users don't count)
      if (!entitlements.isPaid && LAUNCH_MODE && tier === 'free') {
        await incrementDailyBookCount();
      }

      toast({
        title: t('generate.success'),
        description: t('generate.successDesc'),
      });

      // Navigate to the new book
      if (data?.bookId) {
        setTimeout(() => {
          navigate(`/book/${data.bookId}`);
        }, 1500);
      }

    } catch (error: any) {
      console.error("Generation error:", error);
      toast({
        title: t('generate.failed'),
        description: error.message || t('generate.failedDesc'),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Show upgrade prompt ONLY for free users who cannot generate
  // NEVER show for admin, prophet, or any paid user
  if (!subLoading && !canGenerateBooks && user && !entitlements.isAdmin && !entitlements.isProphet && !entitlements.isPaid) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-2xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-card rounded-2xl border border-border/50 p-12"
            >
              <div className="bg-scroll-gold/10 p-4 rounded-full w-fit mx-auto mb-6">
                <Lock className="h-12 w-12 text-scroll-gold" />
              </div>
              <h1 className="font-display text-3xl font-bold mb-4">
                {t('generate.upgradeTitle')}
              </h1>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                {t('generate.upgradeDesc')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="hero" onClick={() => navigate("/pricing")}>
                  <Crown className="h-4 w-4 mr-2" />
                  {t('generate.viewPlans')}
                </Button>
                <Button variant="outline" onClick={() => navigate("/explore")}>
                  {t('generate.browseLibrary')}
                </Button>
              </div>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <LaunchBanner />
      <main className="flex-1 pt-20 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Launch Mode Info for Free Users Only */}
          {LAUNCH_MODE && tier === 'free' && !entitlements.isPaid && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/30"
            >
              <div className="flex items-center gap-3">
                <Rocket className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {t('generate.freeTrial')}: {LAUNCH_MODE_CONFIG.freeBookLimit - dailyLimitInfo.dailyBookCount} {t('generate.booksRemaining')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('generate.maxWords')} {LAUNCH_MODE_CONFIG.freeMaxWordCount.toLocaleString()} {t('generate.wordsChapter')}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/pricing')}>
                  {t('common.upgrade')}
                </Button>
              </div>
            </motion.div>
          )}
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-scroll-gold/10 border border-scroll-gold/30 text-scroll-gold text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              {t('generate.aiGenerator')}
              {tier !== "free" && (
                <span className="ml-2 text-xs bg-scroll-gold/20 px-2 py-0.5 rounded-full">
                  {SUBSCRIPTION_TIERS[tier].name}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
              {t('generate.title')} <span className="text-gradient-gold">{t('generate.highlight')}</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t('generate.subtitle')}
            </p>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-card rounded-2xl border border-border/50 p-8 shadow-card"
          >
            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-foreground">
                  {t('generate.bookTitle')}
                </Label>
                <Input
                  id="title"
                  placeholder={t('generate.bookTitlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:border-scroll-gold"
                  disabled={isGenerating}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-foreground">
                  {t('generate.description')}
                </Label>
                <Textarea
                  id="description"
                  placeholder={t('generate.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:border-scroll-gold min-h-[100px]"
                  disabled={isGenerating}
                />
              </div>

              {/* Category & Chapters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">{t('generate.category')}</Label>
                  <Select value={category} onValueChange={setCategory} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue placeholder={t('generate.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {t(cat.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">{t('generate.numChapters')}</Label>
                  <Select value={numChapters} onValueChange={setNumChapters} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[6, 8, 10, 12, 15, 20, 25, 30].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} {t('generate.chapters')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Book Type Selection */}
              <div className="space-y-3">
                <Label className="text-foreground">{t('generate.bookType')}</Label>
                <RadioGroup
                  value={bookType}
                  onValueChange={(v) => setBookType(v as "text" | "illustrated" | "comic")}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  disabled={isGenerating}
                >
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors cursor-pointer" onClick={() => setBookType("text")}>
                    <RadioGroupItem value="text" id="type-text" />
                    <Label htmlFor="type-text" className="flex items-center gap-2 cursor-pointer flex-1">
                      <BookOpen className="h-4 w-4 text-scroll-gold flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t('generate.textOnly')}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('generate.textOnlyDesc')}</p>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors cursor-pointer" onClick={() => setBookType("illustrated")}>
                    <RadioGroupItem value="illustrated" id="type-illustrated" />
                    <Label htmlFor="type-illustrated" className="flex items-center gap-2 cursor-pointer flex-1">
                      <BookImage className="h-4 w-4 text-scroll-gold flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t('generate.illustrated')}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('generate.illustratedDesc')}</p>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors cursor-pointer" onClick={() => setBookType("comic")}>
                    <RadioGroupItem value="comic" id="type-comic" />
                    <Label htmlFor="type-comic" className="flex items-center gap-2 cursor-pointer flex-1">
                      <ImageIcon className="h-4 w-4 text-scroll-gold flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t('generate.comic')}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('generate.comicDesc')}</p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
                {bookType === "comic" && (
                  <p className="text-xs text-scroll-gold">
                    {t('generate.comicNote')}
                  </p>
                )}
              </div>

              {/* Word Count & Language - hide word count for comics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookType !== "comic" && (
                  <div className="space-y-2">
                    <Label className="text-foreground">{t('generate.wordsPerChapter')}</Label>
                    <Select value={wordCount} onValueChange={setWordCount} disabled={isGenerating}>
                      <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {wordCountOptions.map((count) => (
                          <SelectItem key={count} value={count.toString()}>
                            {count.toLocaleString()} {t('generate.words')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {tier === "prophet_tier" && (
                      <p className="text-xs text-scroll-gold">{t('generate.prophetTier')}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-foreground">{t('generate.language')}</Label>
                  <Select value={language} onValueChange={setLanguage} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Generation Mode Selection */}
              {bookType === "text" && (
                <div className="space-y-4">
                  <Label className="text-foreground">{t('generate.generationMode')}</Label>
                  
                  <RadioGroup
                    value={generationMode}
                    onValueChange={(v) => {
                      setGenerationMode(v as "learning" | "academic");
                      setEnableReferences(v === "academic");
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    disabled={isGenerating}
                  >
                    <div 
                      className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                        generationMode === "learning" 
                          ? "border-primary bg-primary/5" 
                          : "border-border/50 hover:border-primary/50"
                      }`}
                      onClick={() => {
                        setGenerationMode("learning");
                        setEnableReferences(false);
                      }}
                    >
                      <RadioGroupItem value="learning" id="mode-learning" className="mt-1" />
                      <Label htmlFor="mode-learning" className="cursor-pointer flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4 w-4 text-scroll-gold" />
                          <span className="font-medium">{t('generate.learningMode')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('generate.learningModeDesc')}
                        </p>
                      </Label>
                    </div>
                    
                    <div 
                      className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                        generationMode === "academic" 
                          ? "border-green-500 bg-green-500/5" 
                          : "border-border/50 hover:border-green-500/50"
                      }`}
                      onClick={() => {
                        setGenerationMode("academic");
                        setEnableReferences(true);
                      }}
                    >
                      <RadioGroupItem value="academic" id="mode-academic" className="mt-1" />
                      <Label htmlFor="mode-academic" className="cursor-pointer flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{t('generate.academicMode')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('generate.academicModeDesc')}
                        </p>
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Citation Style Selector - only show in academic mode */}
                  {generationMode === "academic" && (
                    <div className="space-y-3 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center justify-between">
                        <AcademicModeIndicator isAcademicMode={true} citationStyle={citationStyle} />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">{t('generate.citationStyle')}</Label>
                        <Select value={citationStyle} onValueChange={setCitationStyle} disabled={isGenerating}>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CITATION_STYLES.map((style) => (
                              <SelectItem key={style.value} value={style.value}>
                                <div className="flex items-center justify-between gap-4">
                                  <span>{style.label}</span>
                                  <span className="text-xs text-muted-foreground">{style.example}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          {t('generate.academicWarning')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Academic category auto-detection notice */}
                  {category && isAcademicCategory(category) && generationMode !== "academic" && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs text-amber-400">
                        <strong>{category.replace(/_/g, " ")}</strong> {t('generate.academicRecommended')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Cover Option */}
              <div className="space-y-3">
                <Label className="text-foreground">{t('generate.bookCover')}</Label>
                <RadioGroup
                  value={coverOption}
                  onValueChange={(v) => setCoverOption(v as "ai" | "upload")}
                  className="flex gap-4"
                  disabled={isGenerating}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ai" id="ai-cover" />
                    <Label htmlFor="ai-cover" className="flex items-center gap-2 cursor-pointer">
                      <Wand2 className="h-4 w-4 text-scroll-gold" />
                      {t('generate.aiGenerated')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="upload" id="upload-cover" />
                    <Label htmlFor="upload-cover" className="flex items-center gap-2 cursor-pointer">
                      <Upload className="h-4 w-4 text-scroll-gold" />
                      {t('generate.uploadCustom')}
                    </Label>
                  </div>
                </RadioGroup>

                {coverOption === "upload" && (
                  <CoverUpload onCoverSelect={setCustomCover} currentCover={customCover} />
                )}
              </div>

              {/* Generate Button */}
              <Button
                variant="hero"
                className="w-full"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    {t('generate.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    {t('generate.generateButton')}
                  </>
                )}
              </Button>

              {/* Progress */}
              {generationProgress.length > 0 && (
                <div className="mt-6 space-y-2">
                  {generationProgress.map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle className="h-4 w-4 text-scroll-gold" />
                      {step}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                icon: BookOpen,
                titleKey: "generate.feature1Title",
                descKey: "generate.feature1Desc",
              },
              {
                icon: Sparkles,
                titleKey: "generate.feature2Title",
                descKey: "generate.feature2Desc",
              },
              {
                icon: CheckCircle,
                titleKey: "generate.feature3Title",
                descKey: "generate.feature3Desc",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="text-center p-6 rounded-xl bg-muted/20 border border-border/30"
              >
                <feature.icon className="h-8 w-8 text-scroll-gold mx-auto mb-3" />
                <h3 className="font-display font-semibold mb-2">{t(feature.titleKey)}</h3>
                <p className="text-sm text-muted-foreground">{t(feature.descKey)}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
