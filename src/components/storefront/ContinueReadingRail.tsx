// Continue Reading rail for authenticated users. Not cached publicly.
// Resolves reading_progress rows → public listings by book_id (public-safe).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { listContinueReading, type ReadingProgressRow } from "@/lib/readingProgress";
import { storefrontApi, type StoreListing } from "@/lib/storefrontApi";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { logRecommendationEvent } from "@/lib/recommendationFeedback";

export function ContinueReadingRail() {
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<Array<{ p: ReadingProgressRow; l: StoreListing | null }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const rows = await listContinueReading(8);
      if (!rows.length) { setLoading(false); setPairs([]); return; }

      // Map each book_id → public listing via canonical API (single call per book).
      const lookups = await Promise.allSettled(rows.map(async (r) => {
        // Listings endpoint is by slug, not book_id. Fall back to a thin direct read
        // (still respects RLS — public_listings is_public + books public listing helper).
        const { data } = await supabase
          .from("public_listings")
          .select("slug")
          .eq("book_id", r.book_id)
          .eq("is_public", true)
          .maybeSingle();
        if (!data?.slug) return { p: r, l: null };
        try {
          const l = await storefrontApi.getBook(data.slug);
          return { p: r, l };
        } catch {
          return { p: r, l: null };
        }
      }));
      if (!alive) return;
      setPairs(lookups.map((x) => x.status === "fulfilled" ? x.value : { p: rows[0], l: null }).filter((x) => x.l));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (!loading && pairs.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold mb-4">Continue reading</h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {pairs.map(({ p, l }, idx) => l && (
            <Link
              key={p.id}
              to={`/store/${l.slug}/read`}
              onClick={() => logRecommendationEvent({
                source: "continue_reading", action: "clicked",
                listing_id: l.id, book_id: p.book_id, position: idx,
              })}
            >
              <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
                <div className="aspect-[3/4] bg-muted relative">
                  {(l.cover_override_url || l.book?.cover_image_url) && (
                    <img
                      src={l.cover_override_url || l.book?.cover_image_url || ""}
                      alt={l.book?.title ?? ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <h3 className="text-sm font-medium line-clamp-2">{l.book?.title}</h3>
                  <Progress value={Number(p.percent) || 0} className="h-1.5" />
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">Resume</Badge>
                    <span className="text-[11px] text-muted-foreground">{Math.round(Number(p.percent) || 0)}%</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
