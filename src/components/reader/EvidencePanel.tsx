/**
 * EvidencePanel — chapter-level "Evidence & Sources" surface.
 * Loads real, openly-licensed visuals retrieved via ScrollVision and
 * lets the reader trigger retrieval if none exist yet.
 */
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getChapterEvidenceAssets,
  retrieveChapterEvidence,
  type ChapterAsset,
} from "@/lib/scrollvision";
import { EvidenceVisual } from "./EvidenceVisual";

interface Props {
  bookId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterContent?: string;
}

export function EvidencePanel({ bookId, chapterId, chapterTitle, chapterContent }: Props) {
  const [assets, setAssets] = useState<ChapterAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrieving, setRetrieving] = useState(false);
  const [failed, setFailed] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const a = await getChapterEvidenceAssets(chapterId);
    setAssets(a);
    setLoading(false);
  }, [chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  const tooShort = !chapterContent || chapterContent.trim().length < 400;

  const handleRetrieve = async () => {
    if (tooShort) {
      toast({
        title: "Chapter too short",
        description: "Add more content before retrieving evidence.",
        variant: "destructive",
      });
      return;
    }
    setRetrieving(true);
    setFailed(false);
    try {
      const r = await retrieveChapterEvidence({
        bookId,
        chapterId,
        title: chapterTitle,
        content: chapterContent,
        maxAssets: 6,
      });
      console.log("[ScrollVision] retrieve result", {
        entities: r.entities?.length,
        candidates: r.candidates,
        linked: r.linked,
      });
      toast({
        title: "Evidence retrieved",
        description: `Linked ${r.linked} real images from ${r.entities.length} entities.`,
      });
      await load();
    } catch (e: any) {
      console.warn("[ScrollVision] retrieve failed", e);
      setFailed(true);
      toast({
        title: "Retrieval failed",
        description: e?.message ?? "Try again shortly.",
        variant: "destructive",
      });
    } finally {
      setRetrieving(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ImageIcon className="h-4 w-4" />
            Evidence & Sources
          </h3>
          <p className="text-xs text-muted-foreground">
            Real, openly-licensed visuals from museums and archives.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetrieve}
          disabled={retrieving || !chapterContent}
        >
          {retrieving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span className="ml-2">{assets.length > 0 ? "Refresh" : "Retrieve"}</span>
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No real-image evidence linked yet. Click <strong>Retrieve</strong> to pull from
          Wikimedia Commons & The Met.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assets.map((a) => (
            <EvidenceVisual key={a.id} asset={a} />
          ))}
        </div>
      )}
    </section>
  );
}
