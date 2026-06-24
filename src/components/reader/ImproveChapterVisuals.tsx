/**
 * Improve Chapter Visuals — AI Publishing Art Director (Slice 1)
 *
 * Analyze a chapter, present 0–3 publication-grade recommendations,
 * preview on demand, insert only after explicit user acceptance.
 */

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  analyzeChapterVisuals,
  previewRecommendation,
  buildVisualInsertBlock,
  insertVisualIntoContent,
  CATEGORY_LABEL,
  type ArtDirectorAnalysis,
  type ArtDirectorRecommendation,
} from "@/lib/artDirector";

interface ImproveChapterVisualsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterContent: string;
  bookType?: string;
  bookTitle?: string;
  chapterTitle?: string;
  category?: string;
  language?: string;
  /** Called with the new full chapter content after the user accepts a preview. */
  onInsert: (nextContent: string) => void;
}

interface PreviewState {
  imageUrl: string | null;
  isLoading: boolean;
  altIndex: number; // -1 = main prompt, 0/1 = alternative_prompts index
}

export function ImproveChapterVisuals({
  open,
  onOpenChange,
  chapterContent,
  bookType,
  bookTitle,
  chapterTitle,
  category,
  language,
  onInsert,
}: ImproveChapterVisualsProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ArtDirectorAnalysis | null>(null);
  const [previews, setPreviews] = useState<Record<number, PreviewState>>({});
  const [insertingIdx, setInsertingIdx] = useState<number | null>(null);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    setPreviews({});
    try {
      const result = await analyzeChapterVisuals({
        chapterContent,
        bookType,
        bookTitle,
        chapterTitle,
        category,
        language,
      });
      setAnalysis(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      toast({
        title: "Could not analyze chapter",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [chapterContent, bookType, bookTitle, chapterTitle, category, language, toast]);

  // Trigger analysis when the sheet opens (only once per open)
  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (next && !analysis && !isAnalyzing) {
        void runAnalysis();
      }
    },
    [onOpenChange, analysis, isAnalyzing, runAnalysis],
  );

  const handlePreview = useCallback(
    async (rec: ArtDirectorRecommendation, idx: number, altIndex: number) => {
      setPreviews((prev) => ({
        ...prev,
        [idx]: { imageUrl: prev[idx]?.imageUrl ?? null, isLoading: true, altIndex },
      }));
      try {
        const promptOverride =
          altIndex >= 0 ? rec.alternative_prompts[altIndex] ?? rec.prompt : rec.prompt;
        const { imageUrl } = await previewRecommendation({
          recommendation: rec,
          promptOverride,
          bookType,
          chapterTitle,
          category,
        });
        setPreviews((prev) => ({
          ...prev,
          [idx]: { imageUrl, isLoading: false, altIndex },
        }));
      } catch (err) {
        setPreviews((prev) => ({
          ...prev,
          [idx]: { imageUrl: prev[idx]?.imageUrl ?? null, isLoading: false, altIndex },
        }));
        const msg = err instanceof Error ? err.message : "Preview failed";
        toast({ title: "Preview failed", description: msg, variant: "destructive" });
      }
    },
    [bookType, chapterTitle, category, toast],
  );

  const handleInsert = useCallback(
    async (rec: ArtDirectorRecommendation, idx: number) => {
      const preview = previews[idx];
      if (!preview?.imageUrl) {
        toast({
          title: "Preview first",
          description: "Generate a preview before inserting.",
        });
        return;
      }
      setInsertingIdx(idx);
      try {
        const block = buildVisualInsertBlock({
          recommendation: rec,
          imageUrl: preview.imageUrl,
        });
        const { content: next, insertedAtAnchor } = insertVisualIntoContent(
          chapterContent,
          block,
          rec.placement_anchor,
        );
        onInsert(next);
        toast({
          title: "Visual inserted",
          description: insertedAtAnchor
            ? "Inserted at the recommended location."
            : "Appended at the end — drag to reposition if needed.",
        });
        onOpenChange(false);
      } finally {
        setInsertingIdx(null);
      }
    },
    [previews, chapterContent, onInsert, onOpenChange, toast],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto max-h-[100vh]"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Improve Chapter Visuals
          </SheetTitle>
          <SheetDescription>
            An art director reads the chapter and recommends publication-grade visuals.
            Nothing is inserted until you preview and accept.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading the chapter and selecting visuals…
            </div>
          )}

          {!isAnalyzing && analysis && analysis.recommendations.length === 0 && (
            <Card className="p-4 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium">No visuals recommended</p>
                <p className="text-sm text-muted-foreground">
                  {analysis.skipped_reason}
                </p>
                <Button size="sm" variant="outline" onClick={runAnalysis}>
                  <RefreshCw className="h-3 w-3 mr-2" /> Re-analyze
                </Button>
              </div>
            </Card>
          )}

          {!isAnalyzing &&
            analysis?.recommendations.map((rec, idx) => {
              const preview = previews[idx];
              return (
                <Card key={idx} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORY_LABEL[rec.category]}
                      </Badge>
                      <p className="text-sm font-medium text-foreground">{rec.caption}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground italic">{rec.reason}</p>

                  {rec.placement_anchor ? (
                    <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                      Placement: just after “{rec.placement_anchor.slice(0, 80)}
                      {rec.placement_anchor.length > 80 ? "…" : ""}”
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Suggested section:{" "}
                      <span className="font-medium">
                        {rec.suggested_section_title || "anywhere relevant"}
                      </span>{" "}
                      — will append to end on insert.
                    </p>
                  )}

                  {/* Preview surface */}
                  <div className="rounded-md border border-border bg-muted/30 aspect-[3/2] flex items-center justify-center overflow-hidden">
                    {preview?.isLoading ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Rendering preview…
                      </div>
                    ) : preview?.imageUrl ? (
                      <img
                        src={preview.imageUrl}
                        alt={rec.alt_text}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                        <ImageIcon className="h-5 w-5" />
                        No preview yet
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(rec, idx, -1)}
                      disabled={preview?.isLoading}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {preview?.imageUrl ? "Re-preview" : "Preview"}
                    </Button>
                    {rec.alternative_prompts.map((_, aIdx) => (
                      <Button
                        key={aIdx}
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePreview(rec, idx, aIdx)}
                        disabled={preview?.isLoading}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Alt {aIdx + 1}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => handleInsert(rec, idx)}
                      disabled={
                        !preview?.imageUrl || preview.isLoading || insertingIdx === idx
                      }
                    >
                      {insertingIdx === idx ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Use this
                    </Button>
                  </div>
                </Card>
              );
            })}

          {!isAnalyzing && analysis && analysis.recommendations.length > 0 && (
            <Button variant="ghost" size="sm" onClick={runAnalysis} className="w-full">
              <RefreshCw className="h-3 w-3 mr-2" /> Re-analyze chapter
            </Button>
          )}

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            Analysis is fast and low-cost. Previews use one image credit each.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
