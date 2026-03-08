import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, Wand2, Loader2, Check, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface StyleProfile {
  tone: string;
  complexity: string;
  sentenceLength: string;
  vocabulary: string;
  formality: string;
  summary: string;
  samplePrompt: string;
}

interface StyleClonePanelProps {
  onStyleProfileChange: (profile: StyleProfile | null) => void;
  styleProfile: StyleProfile | null;
}

export function StyleClonePanel({ onStyleProfileChange, styleProfile }: StyleClonePanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sampleText, setSampleText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setSampleText(text.slice(0, 5000)); // Cap at 5000 chars
    };
    reader.readAsText(file);
  }, []);

  const analyzeStyle = useCallback(async () => {
    if (!sampleText.trim() || sampleText.trim().length < 100) {
      toast({ title: "Need more text", description: "Please provide at least 100 characters of sample text.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("interactive-qa", {
        body: {
          question: `Analyze the writing style of the following text and return a JSON object with these exact keys: tone (e.g. "formal", "conversational", "academic"), complexity (e.g. "simple", "moderate", "advanced"), sentenceLength (e.g. "short", "medium", "long"), vocabulary (e.g. "basic", "intermediate", "sophisticated"), formality (e.g. "casual", "professional", "scholarly"), summary (one sentence describing the overall style), samplePrompt (a writing instruction that captures this style, e.g. "Write in a conversational yet authoritative tone with medium-length sentences and sophisticated vocabulary"). Return ONLY the JSON, no markdown.\n\nText to analyze:\n${sampleText.slice(0, 3000)}`,
          bookId: "style-analysis",
          chapterContent: "",
        },
      });

      if (error) throw error;

      const answer = data?.answer || data?.response || "";
      // Extract JSON from response
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const profile = JSON.parse(jsonMatch[0]) as StyleProfile;
        onStyleProfileChange(profile);
        toast({ title: "Style analyzed!", description: `Detected: ${profile.tone} tone, ${profile.complexity} complexity` });
      } else {
        throw new Error("Could not parse style profile");
      }
    } catch (err) {
      console.error("Style analysis failed:", err);
      toast({ title: "Analysis failed", description: "Could not analyze writing style. Try with different text.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }, [sampleText, onStyleProfileChange, toast]);

  const clearProfile = useCallback(() => {
    onStyleProfileChange(null);
    setSampleText("");
    setFileName(null);
  }, [onStyleProfileChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Writing Style Cloning</h3>
        </div>
        {styleProfile && (
          <Button variant="ghost" size="sm" onClick={clearProfile} className="h-7 text-xs gap-1">
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {styleProfile ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Style Profile Active</span>
            </div>
            <p className="text-xs text-muted-foreground">{styleProfile.summary}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">{styleProfile.tone}</Badge>
              <Badge variant="secondary" className="text-xs">{styleProfile.complexity}</Badge>
              <Badge variant="secondary" className="text-xs">{styleProfile.formality}</Badge>
              <Badge variant="secondary" className="text-xs">{styleProfile.vocabulary} vocab</Badge>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <p className="text-xs text-muted-foreground">
              Paste sample text or upload a document. We'll analyze the writing style and match it in your generated book.
            </p>

            <div className="flex gap-2">
              <label className="flex-1">
                <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {fileName || "Upload .txt file"}
                  </span>
                </div>
                <input
                  type="file"
                  accept=".txt,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <Textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Or paste a sample of your writing style here (min 100 characters)..."
              className="min-h-[100px] text-xs"
              maxLength={5000}
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{sampleText.length}/5000 characters</span>
              <Button
                size="sm"
                onClick={analyzeStyle}
                disabled={isAnalyzing || sampleText.trim().length < 100}
                className="gap-1.5"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3 w-3" />
                    Analyze Style
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
