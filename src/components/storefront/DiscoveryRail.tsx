import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreListing } from "@/lib/storefrontApi";

interface Props {
  title: string;
  items: StoreListing[] | null;
  loading?: boolean;
  emptyHint?: string;
  onItemClick?: (l: StoreListing, position: number) => void;
}

export function DiscoveryRail({ title, items, loading, emptyHint, onItemClick }: Props) {
  if (!loading && (!items || items.length === 0) && !emptyHint) return null;
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((l, idx) => (
            <Link
              key={l.id}
              to={`/store/${l.slug}`}
              onClick={() => onItemClick?.(l, idx)}
            >
              <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
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
                <div className="p-3">
                  <h3 className="text-sm font-medium line-clamp-2">{l.book?.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-[10px]">{l.book?.category ?? "General"}</Badge>
                    <span className="text-xs font-medium ml-auto">
                      {l.price_cents > 0 ? `$${(l.price_cents / 100).toFixed(2)}` : "Free"}
                    </span>
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
