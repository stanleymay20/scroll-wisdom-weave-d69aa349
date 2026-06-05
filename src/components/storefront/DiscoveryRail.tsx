import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreListing } from "@/lib/storefrontApi";
import { logRecommendationBatch, logRecommendationEvent, type RecSource } from "@/lib/recommendationFeedback";
import { SocialProofBadges } from "@/components/storefront/SocialProofBadges";

interface Props {
  title: string;
  items: StoreListing[] | null;
  loading?: boolean;
  emptyHint?: string;
  source?: RecSource;
  onItemClick?: (l: StoreListing, position: number) => void;
}

export function DiscoveryRail({ title, items, loading, emptyHint, source, onItemClick }: Props) {
  const loggedShown = useRef(false);

  useEffect(() => {
    if (loggedShown.current || !source || !items || items.length === 0) return;
    loggedShown.current = true;
    logRecommendationBatch(
      items.slice(0, 24).map((l, i) => ({
        source, action: "shown",
        listing_id: l.id, book_id: l.book?.id ?? null, position: i,
      })),
    );
  }, [items, source]);

  if (!loading && (!items || items.length === 0) && !emptyHint) return null;
  const hint = emptyHint ?? "Nothing here yet — check back soon.";
  return (
    <section className="mb-6 sm:mb-10">
      <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 px-1">{title}</h2>
      {loading ? (
        <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-[40vw] sm:w-full flex-shrink-0 snap-start rounded-lg" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">{hint}</p>
      ) : (
        <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {items.map((l, idx) => (
            <Link
              key={l.id}
              to={`/store/${l.slug}`}
              className="w-[40vw] max-w-[180px] sm:w-auto sm:max-w-none flex-shrink-0 snap-start"
              onClick={() => {
                if (source) {
                  logRecommendationEvent({
                    source, action: "clicked",
                    listing_id: l.id, book_id: l.book?.id ?? null, position: idx,
                  });
                }
                onItemClick?.(l, idx);
              }}
            >
              <Card className="overflow-hidden hover:shadow-md active:scale-[0.98] transition-all h-full border-border/60">
                <div className="aspect-[3/4] bg-muted">
                  {(l.cover_override_url || l.book?.cover_image_url) && (
                    <img
                      src={l.cover_override_url || l.book?.cover_image_url || ""}
                      alt={l.book?.title ?? ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-2.5 sm:p-3">
                  <h3 className="text-xs sm:text-sm font-medium line-clamp-2 leading-tight">{l.book?.title}</h3>
                  {l.reasons && l.reasons.length > 0 && (
                    <p className="text-[10px] text-primary/80 mt-1 line-clamp-1">{l.reasons[0]}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 py-0">{l.book?.category ?? "General"}</Badge>
                    <span className="text-[11px] sm:text-xs font-semibold ml-auto">
                      {l.price_cents > 0 ? `$${(l.price_cents / 100).toFixed(2)}` : "Free"}
                    </span>
                  </div>
                  <SocialProofBadges
                    listingId={l.id}
                    variant="compact"
                    show={["readers", "followers"]}
                    className="mt-1.5"
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
