import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { storefrontApi } from "@/lib/storefrontApi";

interface Series { id: string; slug: string; title: string; description: string | null; cover_image_url: string | null; }

export default function SeriesPage() {
  const { slug } = useParams<{ slug: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: s } = await supabase.from("book_series").select("*").eq("slug", slug).maybeSingle();
      if (!s) { setLoading(false); return; }
      setSeries(s as any);
      // Pull a generous page from the canonical public API, then filter by series client-side.
      // (Series order ranking is preserved by sorting after fetch.)
      try {
        const res = await storefrontApi.listBooks({ pageSize: 60 });
        const filtered = res.items
          .filter((l) => l.series_id === (s as any).id)
          .sort((a, b) => (a.series_order ?? 0) - (b.series_order ?? 0));
        setItems(filtered);
      } catch (_) { /* noop */ }
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="container mx-auto max-w-4xl p-8"><Skeleton className="h-48" /></div>;
  if (!series) return <div className="container mx-auto max-w-4xl p-8"><h1>Series not found</h1></div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${series.title} — Series`} description={(series.description ?? series.title).slice(0, 158)} canonical={`/series/${series.slug}`} />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-bold">{series.title}</h1>
        {series.description && <p className="text-muted-foreground mt-3">{series.description}</p>}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((it: any) => (
            <Link key={it.book?.id ?? it.id} to={`/store/${it.slug}`}>
              <Card className="overflow-hidden hover:shadow-md transition">
                <div className="aspect-[3/4] bg-muted">
                  {(it.cover_override_url || it.book?.cover_image_url) && (
                    <img src={it.cover_override_url || it.book?.cover_image_url} alt={it.book?.title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  {it.series_order && <p className="text-xs text-muted-foreground">Book {it.series_order}</p>}
                  <p className="text-sm font-medium line-clamp-2">{it.book?.title}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
