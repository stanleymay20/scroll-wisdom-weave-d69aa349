import { useState } from "react";
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
import { Sparkles, BookOpen, Loader2, CheckCircle, Upload, Wand2, Lock, Crown, Rocket } from "lucide-react";
import { CoverUpload } from "@/components/books/CoverUpload";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getWordCountOptions, SUBSCRIPTION_TIERS } from "@/lib/subscription";
import { LAUNCH_MODE, LAUNCH_MODE_CONFIG } from "@/lib/config";
import { useEntitlements } from "@/hooks/useEntitlements";
import { LaunchBanner } from "@/components/subscription/LaunchBanner";
const CATEGORIES = [
  { value: "theology", label: "Theology" },
  { value: "prophecy", label: "Prophecy & Scroll Studies" },
  { value: "science", label: "Science" },
  { value: "technology", label: "Technology" },
  { value: "business", label: "Business" },
  { value: "finance", label: "Finance" },
  { value: "economics", label: "Economics" },
  { value: "medicine", label: "Medicine" },
  { value: "law", label: "Law" },
  { value: "governance", label: "Governance" },
  { value: "history", label: "History" },
  { value: "african_studies", label: "African Studies" },
  { value: "culture", label: "Culture" },
  { value: "philosophy", label: "Philosophy" },
  { value: "arts", label: "Arts" },
  { value: "fiction", label: "Fiction" },
  { value: "non_fiction", label: "Non-Fiction" },
  { value: "poetry", label: "Poetry" },
];

export default function Generate() {
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
  const { toast } = useToast();

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
        title: "Missing Information",
        description: "Please provide a title and select a category.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to generate books.",
      });
      navigate("/auth");
      return;
    }

    // Admin and Prophet ALWAYS can generate - no upgrade prompts
    if (!entitlements.canGenerateBooks && !entitlements.isAdmin && !entitlements.isProphet) {
      toast({
        title: "Subscription Required",
        description: "Please upgrade to generate books.",
        variant: "destructive",
      });
      navigate("/pricing");
      return;
    }

    // Check daily limit for free tier in launch mode (admin/prophet/paid bypass)
    if (!entitlements.isPaid && LAUNCH_MODE && tier === 'free' && !dailyLimitInfo.canGenerateToday) {
      toast({
        title: "Daily Limit Reached",
        description: `You've reached today's free generation limit (${LAUNCH_MODE_CONFIG.freeBookLimit} book/day). Upgrade to continue.`,
        variant: "destructive",
      });
      navigate("/pricing");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress([]);

    try {
      setGenerationProgress((prev) => [...prev, "Initializing ScrollAuthorGPT..."]);
      
      const { data, error } = await supabase.functions.invoke("generate-book", {
        body: {
          title,
          description,
          category,
          numChapters: parseInt(numChapters),
          wordCount: parseInt(wordCount),
          language,
          userId: user.id,
          customCover: coverOption === "upload" ? customCover : null,
        },
      });

      if (error) throw error;

      setGenerationProgress((prev) => [
        ...prev,
        "Book outline created",
        "Chapter structure defined",
        "Book saved to your library!",
      ]);

      // Increment daily count for free tier in launch mode (paid users don't count)
      if (!entitlements.isPaid && LAUNCH_MODE && tier === 'free') {
        await incrementDailyBookCount();
      }

      toast({
        title: "Book Created Successfully!",
        description: "Your book has been added to your library.",
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
        title: "Generation Failed",
        description: error.message || "There was an error generating your book. Please try again.",
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
                Upgrade to Generate Books
              </h1>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Book generation is available for paid subscribers. 
                Unlock unlimited AI-powered book creation today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="hero" onClick={() => navigate("/pricing")}>
                  <Crown className="h-4 w-4 mr-2" />
                  View Plans
                </Button>
                <Button variant="outline" onClick={() => navigate("/explore")}>
                  Browse Library
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
                    Free Trial: {LAUNCH_MODE_CONFIG.freeBookLimit - dailyLimitInfo.dailyBookCount} book(s) remaining today
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Max {LAUNCH_MODE_CONFIG.freeMaxWordCount.toLocaleString()} words/chapter • Low-quality PDF only
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/pricing')}>
                  Upgrade
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
              AI Book Generator
              {tier !== "free" && (
                <span className="ml-2 text-xs bg-scroll-gold/20 px-2 py-0.5 rounded-full">
                  {SUBSCRIPTION_TIERS[tier].name}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Generate Your <span className="text-gradient-gold">Book</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Create unlimited books with chapters of 8,000+ words, 
              scroll-aligned accuracy, and academic rigor.
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
                  Book Title
                </Label>
                <Input
                  id="title"
                  placeholder="Enter your book title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:border-scroll-gold"
                  disabled={isGenerating}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-foreground">
                  Description (Optional)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe what your book should cover..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:border-scroll-gold min-h-[100px]"
                  disabled={isGenerating}
                />
              </div>

              {/* Category & Chapters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Category</Label>
                  <Select value={category} onValueChange={setCategory} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Number of Chapters</Label>
                  <Select value={numChapters} onValueChange={setNumChapters} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[6, 8, 10, 12, 15, 20, 25, 30].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} Chapters
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Word Count & Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Words per Chapter</Label>
                  <Select value={wordCount} onValueChange={setWordCount} disabled={isGenerating}>
                    <SelectTrigger className="bg-muted/50 border-border/50 focus:border-scroll-gold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {wordCountOptions.map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count.toLocaleString()} words
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tier === "prophet_tier" && (
                    <p className="text-xs text-scroll-gold">Prophet tier: Maximum quality generation</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground">Language</Label>
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

              {/* Cover Option */}
              <div className="space-y-3">
                <Label className="text-foreground">Book Cover</Label>
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
                      AI-Generated
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="upload" id="upload-cover" />
                    <Label htmlFor="upload-cover" className="flex items-center gap-2 cursor-pointer">
                      <Upload className="h-4 w-4 text-scroll-gold" />
                      Upload Custom
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
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate Book
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
                title: "8,000+ Words/Chapter",
                description: "Each chapter is rich with depth and substance",
              },
              {
                icon: Sparkles,
                title: "Scroll-Aligned",
                description: "Content aligned with spiritual and prophetic wisdom",
              },
              {
                icon: CheckCircle,
                title: "Academic Rigor",
                description: "Factually grounded with proper citations",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="text-center p-6 rounded-xl bg-muted/20 border border-border/30"
              >
                <feature.icon className="h-8 w-8 text-scroll-gold mx-auto mb-3" />
                <h3 className="font-display font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
