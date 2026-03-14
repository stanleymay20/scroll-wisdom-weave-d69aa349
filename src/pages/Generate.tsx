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
import { Sparkles, BookOpen, Loader2, CheckCircle, Upload, Wand2, Lock, Crown, Rocket, AlertTriangle, Database, XCircle } from "lucide-react";
import { isAcademicCategory } from "@/lib/academicCategories";
import { ContentModeSelector, ContentMode } from "@/components/academic/ContentModeSelector";
import { CitationStyle } from "@/lib/citations";
import { CoverUpload } from "@/components/books/CoverUpload";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getWordCountOptions, SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { LAUNCH_MODE, LAUNCH_MODE_CONFIG, isTrialActive, isLaunchModeActive } from "@/lib/config";
import { useEntitlements } from "@/hooks/useEntitlements";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { LaunchBanner } from "@/components/subscription/LaunchBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { BookTypeSelector, ExtendedBookType } from "@/components/generate/BookTypeSelector";
import { WorkbookPreview } from "@/components/generate/WorkbookPreview";
import { ComicStyleSelector, ComicStyleConfig } from "@/components/generate/ComicStyleSelector";
import { ComicSubTypeSelector, ComicSubType, ComicSubTypeConfig } from "@/components/generate/ComicSubTypeSelector";
import { ComicCharacterSheet, CharacterSheetConfig } from "@/components/generate/ComicCharacterSheet";
import { ComicLearningObjectives, ComicLearningConfig } from "@/components/generate/ComicLearningObjectives";
import { CharacterPortraitPreview } from "@/components/generate/CharacterPortraitPreview";
import { BestsellerModeToggle } from "@/components/generate/BestsellerModeToggle";
import { AuthorImprint, AuthorMode } from "@/components/generate/AuthorImprint";
import { FictionWritingTools, FictionConfig, DEFAULT_FICTION_CONFIG } from "@/components/generate/FictionWritingTools";
import { StyleClonePanel, StyleProfile } from "@/components/generate/StyleClonePanel";
import { usePagePerformance } from "@/lib/performance";
import { useGracefulDegradation } from "@/hooks/useNetworkAction";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeForDisplay, VALIDATION_LIMITS } from "@/lib/validation";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "science", labelKey: "categories.science" },
  { value: "technology", labelKey: "categories.technology" },
  { value: "business", labelKey: "categories.business" },
  { value: "finance", labelKey: "categories.finance" },
  { value: "economics", labelKey: "categories.economics" },
  { value: "medicine", labelKey: "categories.medicine" },
  { value: "law", labelKey: "categories.law" },
  { value: "governance", labelKey: "categories.governance" },
  { value: "history", labelKey: "categories.history" },
  { value: "philosophy", labelKey: "categories.philosophy" },
  { value: "psychology", labelKey: "categories.psychology" },
  { value: "health", labelKey: "categories.health" },
  { value: "arts", labelKey: "categories.arts" },
  { value: "fiction", labelKey: "categories.fiction" },
  { value: "non_fiction", labelKey: "categories.non_fiction" },
  { value: "poetry", labelKey: "categories.poetry" },
];

function DesktopGenerateWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <TrialBanner />
      <LaunchBanner />
      {children}
      <Footer />
    </div>
  );
}

export default function Generate() {
  const { t, language: uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  // CONTRACT 4: Track TTI
  usePagePerformance('Generate');
  
  // CONTRACT 4.5: Graceful degradation
  const { canGenerate, isOnline } = useGracefulDegradation();
  
  const { 
    user, 
    tier, 
    canGenerateBooks, 
    isLoading: subLoading,
    dailyLimitInfo,
    incrementDailyBookCount,
    maxWordCount 
  } = useSubscription();
  
  const entitlements = useEntitlements();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [numChapters, setNumChapters] = useState("5");
  const [wordCount, setWordCount] = useState("4000");
  const [language, setLanguage] = useState<string>(uiLanguage);
  const [coverOption, setCoverOption] = useState<"ai" | "upload">("ai");
  const [customCover, setCustomCover] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string[]>([]);
  
  // New book type state
  const [extendedBookType, setExtendedBookType] = useState<ExtendedBookType | null>(null);
  const [showBookTypeError, setShowBookTypeError] = useState(false);
  const [workbookDensity, setWorkbookDensity] = useState<"low" | "medium" | "high">("medium");
  const [comicStyleConfig, setComicStyleConfig] = useState<ComicStyleConfig>({
    styleId: "modern_superhero",
    paletteHint: "Vibrant primary colors with dramatic shadows",
    lineWeightHint: "bold",
    characterSheet: "",
    layoutTemplate: 5,
    textInImage: true,
    scenesPerPanel: 1,
  });
  
  // Comic Sub-Type & Advanced Configuration
  const [comicSubType, setComicSubType] = useState<ComicSubType>("entertainment");
  const [comicSubTypeConfig, setComicSubTypeConfig] = useState<ComicSubTypeConfig | null>(null);
  const [characterSheetConfig, setCharacterSheetConfig] = useState<CharacterSheetConfig>({
    characters: [],
    isLocked: false,
    settingDescription: "",
    visualConsistencyNotes: "",
  });
  const [comicLearningConfig, setComicLearningConfig] = useState<ComicLearningConfig>({
    objectives: [],
    learningMoments: [],
    ageAppropriateComplexity: "moderate",
  });
  
  const [contentMode, setContentMode] = useState<ContentMode>("creative");
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("APA");
  const [bestsellerMode, setBestsellerMode] = useState(true);
  
  // Fiction writing state
  const [fictionConfig, setFictionConfig] = useState<FictionConfig>(DEFAULT_FICTION_CONFIG);
  
  // Style cloning state
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  
  // Author & Imprint state
  const [authorMode, setAuthorMode] = useState<AuthorMode>("ai");
  const [authorDisplayName, setAuthorDisplayName] = useState("");
  const [penName, setPenName] = useState("");
  const [publisherImprint, setPublisherImprint] = useState("");
  
  const { toast } = useToast();

  // Auto-enable academic mode for academic categories
  useEffect(() => {
    if (category && isAcademicCategory(category) && extendedBookType === "text") {
      setContentMode("academic");
    }
  }, [category, extendedBookType]);

  // Get word count options based on tier and launch mode
  const wordCountOptions = (() => {
    if (entitlements.isTrialMode || entitlements.isAdmin || entitlements.isProphet) return [2000, 3000, 4000, 5000, 6000];
    if (LAUNCH_MODE && tier === 'free') {
      return [2000, 3000, 4000].filter(w => w <= LAUNCH_MODE_CONFIG.freeMaxWordCount);
    }
    return getWordCountOptions(tier);
  })();

  const LANGUAGES = [
    { code: "en", label: t('language.english') },
    { code: "fr", label: t('language.french') },
    { code: "de", label: t('language.german') },
    { code: "es", label: t('language.spanish') },
    { code: "ar", label: t('language.arabic') },
    { code: "sw", label: t('language.swahili') },
    { code: "pt", label: t('language.portuguese') },
  ];

  // Map extended book type to legacy format for backend
  const getLegacyBookType = (): "text" | "illustrated" | "comic" | "workbook" => {
    switch (extendedBookType) {
      case "comic":
        return "comic";
      case "workbook":
        return "workbook";
      case "children":
        return "illustrated";
      case "fiction":
      case "academic":
      case "professional":
      case "reference":
      case "technical":
      case "bestseller":
      case "text":
      default:
        return "text";
    }
  };

  // Calculate word count for workbooks (enforced 1200-1800)
  const getEffectiveWordCount = (): number => {
    if (extendedBookType === "workbook") {
      return 1500; // Fixed for workbooks
    }
    if (extendedBookType === "comic") {
      return 500; // Fixed for comics
    }
    return parseInt(wordCount);
  };

  const handleGenerate = async () => {
    setShowBookTypeError(false);

    // CONTRACT 4.3: Block generation when offline
    if (!canGenerate) {
      toast({
        title: "Generation unavailable",
        description: "Book generation requires an internet connection. Please check your connection and try again.",
        variant: "default",
      });
      return;
    }

    // ── Input validation & sanitization ──
    const sanitizedTitle = sanitizeForDisplay(title);
    const sanitizedDescription = sanitizeForDisplay(description);
    const sanitizedAuthorName = sanitizeForDisplay(authorDisplayName);
    const sanitizedPenName = sanitizeForDisplay(penName);
    const sanitizedImprint = sanitizeForDisplay(publisherImprint);

    if (!sanitizedTitle || !category) {
      toast({
        title: t('generate.missingInfo'),
        description: t('generate.provideTitleCategory'),
        variant: "destructive",
      });
      return;
    }

    if (sanitizedTitle.length > VALIDATION_LIMITS.TITLE_MAX) {
      toast({
        title: "Title too long",
        description: `Title must be under ${VALIDATION_LIMITS.TITLE_MAX} characters.`,
        variant: "destructive",
      });
      return;
    }

    if (sanitizedDescription.length > VALIDATION_LIMITS.DESCRIPTION_MAX) {
      toast({
        title: "Description too long",
        description: `Description must be under ${VALIDATION_LIMITS.DESCRIPTION_MAX} characters.`,
        variant: "destructive",
      });
      return;
    }

    if (sanitizedAuthorName.length > VALIDATION_LIMITS.NAME_MAX ||
        sanitizedPenName.length > VALIDATION_LIMITS.NAME_MAX ||
        sanitizedImprint.length > VALIDATION_LIMITS.NAME_MAX) {
      toast({
        title: "Name too long",
        description: `Author/pen/imprint names must be under ${VALIDATION_LIMITS.NAME_MAX} characters.`,
        variant: "destructive",
      });
      return;
    }

    if (!extendedBookType) {
      setShowBookTypeError(true);
      toast({
        title: "Select a book type",
        description: "Book type is required before you can generate.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: t('generate.signInRequired'),
        description: t('generate.signInToGenerate'),
      });
      navigate("/auth", { state: { redirectTo: "/generate" } });
      return;
    }

    const trialActive = isTrialActive();
    
    if (!trialActive && !entitlements.canGenerateBooks && !entitlements.isAdmin) {
      toast({
        title: t('generate.signInRequired'),
        description: "Sign in to generate books.",
      });
      navigate("/auth", { state: { redirectTo: "/generate" } });
      return;
    }

    if (!trialActive && !entitlements.isPaid && isLaunchModeActive() && tier === 'free' && !dailyLimitInfo.canGenerateToday) {
      toast({
        title: t('generate.dailyLimitReached'),
        description: `${t('generate.dailyLimitDesc')} (${LAUNCH_MODE_CONFIG.freeBookLimit} book/month)`,
        variant: "destructive",
      });
      navigate("/pricing");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress([]);

    // Simulated progress stages with estimated times
    const progressStages = [
      { message: t('generate.initializingAI'), delay: 0 },
      { message: "Analyzing your topic...", delay: 2000 },
      { message: "Creating book structure...", delay: 4000 },
      { message: "Generating chapter outlines...", delay: 6000 },
      { message: "Finalizing your book...", delay: 10000 },
    ];

    // Start progress simulation
    const progressTimers: ReturnType<typeof setTimeout>[] = [];
    progressStages.forEach((stage, index) => {
      const timer = setTimeout(() => {
        setGenerationProgress((prev) => [...prev, stage.message]);
      }, stage.delay);
      progressTimers.push(timer);
    });

    try {
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: {
          title: sanitizedTitle,
          description: sanitizedDescription,
          category,
          numChapters: parseInt(numChapters),
          wordCount: getEffectiveWordCount(),
          language,
          userId: user.id,
          customCover: coverOption === "upload" ? customCover : null,
          bookType: getLegacyBookType(),
          extendedBookType,
          enableReferences: contentMode === "academic",
          citationStyle,
          academicMode: contentMode === "academic",
          deepResearch: contentMode === "academic",
          bestsellerMode: entitlements.isPaid || entitlements.isTrialMode ? bestsellerMode : false,
          // Author & Imprint fields
          authorMode,
          authorDisplayName: sanitizedAuthorName || undefined,
          penName: sanitizedPenName || undefined,
          publisherImprint: sanitizedImprint || undefined,
          // Workbook-specific fields
          workbookDensity: extendedBookType === "workbook" ? workbookDensity : null,
          // Comic-specific fields
          comicStyleId: extendedBookType === "comic" ? comicStyleConfig.styleId : null,
          paletteHint: extendedBookType === "comic" ? comicStyleConfig.paletteHint : null,
          lineWeightHint: extendedBookType === "comic" ? comicStyleConfig.lineWeightHint : null,
          characterSheet: extendedBookType === "comic" ? comicStyleConfig.characterSheet : null,
          layoutTemplate: extendedBookType === "comic" ? comicStyleConfig.layoutTemplate : null,
          textInImage: extendedBookType === "comic" ? comicStyleConfig.textInImage : null,
          scenesPerPanel: extendedBookType === "comic" ? comicStyleConfig.scenesPerPanel : null,
          // Comic Sub-Type & Multi-Agent Architecture fields
          comicSubType: extendedBookType === "comic" ? comicSubType : null,
          comicSubTypeConfig: extendedBookType === "comic" ? comicSubTypeConfig : null,
          characterSheetConfig: extendedBookType === "comic" ? characterSheetConfig : null,
          comicLearningConfig: extendedBookType === "comic" && comicSubTypeConfig?.hasLearningObjectives ? comicLearningConfig : null,
          // Fiction-specific fields
          fictionConfig: extendedBookType === "fiction" ? fictionConfig : null,
          // Style cloning
          styleProfile: styleProfile ? {
            tone: styleProfile.tone,
            complexity: styleProfile.complexity,
            formality: styleProfile.formality,
            vocabulary: styleProfile.vocabulary,
            samplePrompt: styleProfile.samplePrompt,
          } : null,
        },
      });

      // Clear any pending progress timers
      progressTimers.forEach(clearTimeout);

      if (error) throw error;

      setGenerationProgress((prev) => [
        ...prev.filter(p => !p.includes("Finalizing")),
        t('generate.outlineCreated'),
        t('generate.chaptersDefined'),
        t('generate.bookSaved'),
      ]);

      if (!trialActive && !entitlements.isPaid && LAUNCH_MODE && tier === 'free') {
        await incrementDailyBookCount();
      }

      toast({
        title: t('generate.success'),
        description: t('generate.successDesc'),
      });

      if (data?.bookId) {
        setTimeout(() => {
          navigate(`/book/${data.bookId}`);
        }, 1500);
      }

    } catch (error: any) {
      // Clear any pending progress timers
      progressTimers.forEach(clearTimeout);
      
      console.error("Generation error:", error);
      setGenerationProgress((prev) => [...prev, "❌ Generation failed"]);
      toast({
        title: t('generate.failed'),
        description: error.message || t('generate.failedDesc'),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Show sign-in prompt for unauthenticated users only
  if (!subLoading && !user) {
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
                {t('generate.signInRequired')}
              </h1>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Sign in to generate your first book for free.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" onClick={() => navigate("/auth", { state: { redirectTo: "/generate" } })}>
                  Sign In
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

  const Main = (
      <main className={cn(
        "flex-1 pb-16",
        isMobile ? "pt-4 px-4" : "pt-20 container mx-auto px-4 max-w-3xl"
      )}>
        <div className={cn("mx-auto", isMobile ? "max-w-full" : "max-w-3xl")}>
          {/* CONTRACT 4.3: Offline warning banner */}
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    You're offline
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    Book generation requires an internet connection. Please reconnect to continue.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Launch Mode Info for Free Users Only */}
          {isLaunchModeActive() && tier === 'free' && !entitlements.isPaid && isOnline && (
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
              {t('generate.title')}
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
                  {t('generate.bookTitle')} *
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
                  <Label className="text-foreground">{t('generate.category')} *</Label>
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
                      {[3, 5, 6, 8, 10, 12, 15, 20, 25, 30]
                        .filter((num) => entitlements.isPaid || entitlements.isAdmin ? true : num <= 5)
                        .map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} {t('generate.chapters')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Book Type Selector - REQUIRED */}
              <BookTypeSelector
                value={extendedBookType ?? undefined}
                onChange={(v) => {
                  setExtendedBookType(v);
                  setShowBookTypeError(false);
                }}
                disabled={isGenerating}
                showError={showBookTypeError}
              />

              {/* Workbook Preview - shows when workbook selected */}
              {extendedBookType === "workbook" && (
                <WorkbookPreview
                  title={title}
                  numChapters={parseInt(numChapters)}
                  onDensityChange={setWorkbookDensity}
                />
              )}

              {/* Comic Configuration - shows when comic selected */}
              {extendedBookType === "comic" && (
                <div className="space-y-4">
                  {/* Comic Sub-Type Selector */}
                  <ComicSubTypeSelector
                    value={comicSubType}
                    onChange={(subType, config) => {
                      setComicSubType(subType);
                      setComicSubTypeConfig(config);
                      // Auto-adjust style based on sub-type
                      if (subType === "children_story" || subType === "children_learning") {
                        setComicStyleConfig(prev => ({ ...prev, styleId: "children_book" }));
                      }
                    }}
                    disabled={isGenerating}
                  />
                  
                  {/* Visual Style Selector */}
                  <ComicStyleSelector
                    value={comicStyleConfig}
                    onChange={setComicStyleConfig}
                    disabled={isGenerating}
                  />
                  
                  {/* Character Sheet */}
                  <ComicCharacterSheet
                    value={characterSheetConfig}
                    onChange={setCharacterSheetConfig}
                    disabled={isGenerating}
                    onLock={() => {
                      toast({
                        title: "Character Sheet Locked",
                        description: "Characters will remain consistent across all panels.",
                      });
                    }}
                  />
                  
                  {/* Character Portrait Preview - only show when characters exist and not locked */}
                  {characterSheetConfig.characters.length > 0 && !characterSheetConfig.isLocked && (
                    <CharacterPortraitPreview
                      characters={characterSheetConfig.characters}
                      styleId={comicStyleConfig.styleId}
                      paletteHint={comicStyleConfig.paletteHint}
                      disabled={isGenerating}
                    />
                  )}
                  
                  {/* Learning Objectives - only for educational comic types */}
                  {comicSubTypeConfig?.hasLearningObjectives && (
                    <ComicLearningObjectives
                      value={comicLearningConfig}
                      onChange={setComicLearningConfig}
                      disabled={isGenerating}
                      subType={comicSubType as "children_learning" | "educational" | "moral_values"}
                    />
                  )}
                </div>
              )}

              {/* Fiction Writing Tools - shows when fiction selected */}
              {extendedBookType === "fiction" && (
                <FictionWritingTools
                  value={fictionConfig}
                  onChange={setFictionConfig}
                  disabled={isGenerating}
                />
              )}

              {/* Word Count & Language - hide word count for comics/workbooks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extendedBookType !== "comic" && extendedBookType !== "workbook" && (
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
                      <p className="text-xs text-scroll-gold">Institutional tier — maximum word count enabled</p>
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

              {/* Content Mode Selection - Creative vs Academic (only for text types) */}
              {(extendedBookType === "text" || extendedBookType === "academic" || extendedBookType === "reference") && (
                <div className="space-y-4">
                  <ContentModeSelector
                    mode={contentMode}
                    onModeChange={setContentMode}
                    citationStyle={citationStyle}
                    onCitationStyleChange={setCitationStyle}
                    disabled={isGenerating}
                  />

                  {/* Deep Research Info for Academic Mode */}
                  {contentMode === "academic" && (
                    <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-400">Deep Research Pipeline</span>
                      </div>
                     <p className="text-xs text-muted-foreground">
                        Academic mode uses AI to generate content with structured references and citations. 
                        Sources are included for reference but should be independently verified.
                      </p>
                      <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          {t('generate.academicWarning')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Academic category auto-detection notice */}
                  {category && isAcademicCategory(category) && contentMode !== "academic" && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <p className="text-xs text-amber-400">
                        <strong>{category.replace(/_/g, " ")}</strong> {t('generate.academicRecommended')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Author & Imprint Section */}
              <AuthorImprint
                authorMode={authorMode}
                authorDisplayName={authorDisplayName}
                penName={penName}
                publisherImprint={publisherImprint}
                onAuthorModeChange={setAuthorMode}
                onAuthorDisplayNameChange={setAuthorDisplayName}
                onPenNameChange={setPenName}
                onPublisherImprintChange={setPublisherImprint}
                disabled={isGenerating}
              />

              {/* Writing Style Cloning */}
              <div className="bg-card border border-border rounded-xl p-5">
                <StyleClonePanel
                  styleProfile={styleProfile}
                  onStyleProfileChange={setStyleProfile}
                />
              </div>

              {/* Bestseller Mode Toggle - Premium Feature */}
              <BestsellerModeToggle
                enabled={bestsellerMode}
                onToggle={setBestsellerMode}
                isPaidTier={entitlements.isPaid || entitlements.isTrialMode || entitlements.isAdmin || entitlements.isProphet}
                disabled={isGenerating}
              />

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
                disabled={isGenerating || !extendedBookType}
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
                <div className="mt-6 space-y-3">
                  {/* Progress bar */}
                  <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-scroll-gold to-amber-500"
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${Math.min(100, (generationProgress.length / 5) * 100)}%` 
                      }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  
                  {/* Estimated time */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {isGenerating ? "Generating your book..." : "Complete!"}
                    </span>
                    <span>
                      {isGenerating 
                        ? `~${Math.max(0, 20 - generationProgress.length * 4)} seconds remaining`
                        : "Done"
                      }
                    </span>
                  </div>
                  
                  {/* Progress steps */}
                  <div className="space-y-2">
                    {generationProgress.map((step, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        {step.includes("❌") ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-scroll-gold" />
                        )}
                        {step}
                      </motion.div>
                    ))}
                    
                    {/* Current operation spinner */}
                    {isGenerating && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 text-sm text-primary"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </motion.div>
                    )}
                  </div>
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
  );

  return isMobile ? (
    <MobileLayout>{Main}</MobileLayout>
  ) : (
    <DesktopGenerateWrapper>{Main}</DesktopGenerateWrapper>
  );
}
