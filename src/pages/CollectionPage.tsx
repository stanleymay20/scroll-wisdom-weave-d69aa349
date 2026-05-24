// Public collection page: /collections/:owner/:slug
// Reads via canonical storefront-api (cached). Private collections 404.
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { storefrontApi, type StoreCollection } from "@/lib/storefrontApi";
import { logRecommendationBatch, logRecommendationEvent } from "@/lib/recommendationFeedback";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

export default function CollectionPage() {
  const { owner, slug } = useParams<{ owner: string; slug: string }>();
  const [collection, setCollection] = useState<StoreCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!owner || !slug) return;
    (async () => {
      try {
        const c = await storefrontApi.getCollection({ owner, slug });
        setCollection(c);
        logRecommendationEvent({
          source: "collection", action: "shown",
          metadata: { collection_id: c.id, view: "page" },
        });
        if (c.items?.length) {
          logRecommendationBatch(c.items.map((l, i) => ({
            source: "collection", action: "shown",
            listing_id: l.id, book_id: l.book?.id ?? null, position: i,
            metadata: { collection_id: c.id },
          })));
        }
      } catch (e: any) {
        if (e?.status === 404) setNotFound(true);
      } finally { setLoading(false); }
    })();
  }, [owner, slug]);

  if (loading) {
    return <ResponsiveShell><div className="container mx-auto max-w-5xl p-8"><Skeleton className="h-64" /></div></ResponsiveShell>;
  }
  if (notFound || !collection) {
    return (
      <ResponsiveShell>
        <div className="container mx-auto max-w-5xl p-8">
          <h1 className="text-2xl font-semibold">Collection not found</h1>
          <p className="text-muted-foreground mt-2">It may be private or no longer exist.</p>
          <Link to="/store" className="text-primary hover:underline mt-4 inline-block">Back to store</Link>
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell>
    <div className="min-h-screen bg-background">
      <SEO
        title={`${collection.title} — ScrollLibrary collection`}
        description={(collection.description ?? `A curated reading list by ${collection.owner?.display_name ?? "ScrollLibrary"}.`).slice(0, 158)}
        canonical={`/collections/${owner}/${slug}`}
      />
      <header className="border-b border-border">
        <div className="container mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-start gap-6">
            {collection.cover_image_url && (
              <img src={collection.cover_image_url} alt={collection.title} className="w-32 h-32 rounded-lg object-cover" />
            )}
            <div className="flex-1">
              <Badge variant="secondary">{collection.items_count} book{collection.items_count === 1 ? "" : "s"}</Badge>
              <h1 className="text-3xl font-bold mt-2">{collection.title}</h1>
              {collection.description && (
                <p className="text-muted-foreground mt-2 whitespace-pre-line">{collection.description}</p>
              )}
              {collection.owner && (
                <p className="text-sm mt-3">
                  Curated by{" "}
                  <Link to={`/authors/${collection.owner.slug}`} className="text-primary hover:underline">
                    {collection.owner.display_name}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-5xl px-4 py-10">
        {!collection.items || collection.items.length === 0 ? (
          <p className="text-muted-foreground">No public books in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {collection.items.map((l, idx) => (
              <Link
                key={l.id}
                to={`/store/${l.slug}`}
                onClick={() => logRecommendationEvent({
                  source: "collection", action: "clicked",
                  listing_id: l.id, book_id: l.book?.id ?? null, position: idx,
                  metadata: { collection_id: collection.id },
                })}
              >
                <Card className="overflow-hidden hover:shadow-md transition h-full">
                  <div className="aspect-[3/4] bg-muted">
                    {(l.cover_override_url || l.book?.cover_image_url) && (
                      <img src={l.cover_override_url || l.book?.cover_image_url || ""}
                           alt={l.book?.title ?? ""}
                           className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium line-clamp-2">{l.book?.title}</h3>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
    </ResponsiveShell>
  );
}
