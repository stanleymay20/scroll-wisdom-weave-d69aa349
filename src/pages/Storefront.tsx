import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { storefrontApi, type StoreListing } from "@/lib/storefrontApi";

export default function Storefront() {
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await storefrontApi.listBooks({ pageSize: 60 });
        setListings(res.items);
      } catch (_) { /* fail silent, empty list */ }
      setLoading(false);
    })();
  }, []);

  const filtered = listings.filter((l) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (l.book?.title ?? "").toLowerCase().includes(s) ||
      (l.blurb ?? "").toLowerCase().includes(s) ||
      (l.book?.category ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="ScrollLibrary Store — Published Books"
        description="Browse AI-native books published on ScrollLibrary. Read samples, support authors, get KDP and Gumroad bundles."
        canonical="/store"
      />
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-4xl font-bold tracking-tight">Store</h1>
          <p className="mt-2 text-muted-foreground">Published books from ScrollLibrary authors.</p>
          <div className="mt-6 max-w-md">
            <Input placeholder="Search titles, topics…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">No books published yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((l) => (
              <Link key={l.id} to={`/store/${l.slug}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
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
                  <div className="p-4">
                    <h2 className="font-semibold line-clamp-2">{l.book?.title}</h2>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {l.blurb ?? l.book?.description}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="secondary">{l.book?.category ?? "General"}</Badge>
                      <span className="text-sm font-medium ml-auto">
                        {l.price_cents > 0 ? `$${(l.price_cents / 100).toFixed(2)}` : "Free"}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
