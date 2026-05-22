import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { storefrontApi, type StoreListing } from "@/lib/storefrontApi";
import { DiscoveryRail } from "@/components/storefront/DiscoveryRail";
import { logSearchClick, logSearchQuery } from "@/lib/searchAnalytics";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";

const SEARCH_DEBOUNCE_MS = 350;
const ZERO_RESULT_HINTS = ["AI", "philosophy", "history", "science", "psychology"];

export default function Storefront() {
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [searchResults, setSearchResults] = useState<StoreListing[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [trending, setTrending] = useState<StoreListing[] | null>(null);
  const [topSelling, setTopSelling] = useState<StoreListing[] | null>(null);
  const [recent, setRecent] = useState<StoreListing[] | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoggedQuery = useRef<string>("");

  // Load discovery rails once.
  useEffect(() => {
    (async () => {
      try {
        const [t, ts, r] = await Promise.allSettled([
          storefrontApi.trending(12),
          storefrontApi.topSelling(12),
          storefrontApi.recent(12),
        ]);
        if (t.status === "fulfilled") setTrending(t.value.items);
        if (ts.status === "fulfilled") setTopSelling(ts.value.items);
        if (r.status === "fulfilled") setRecent(r.value.items);
      } catch { /* swallow */ }
    })();
  }, []);

  // Debounced server search.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResults(null);
      setCommittedQ("");
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await storefrontApi.listBooks({ search: trimmed, pageSize: 30 });
        setSearchResults(res.items);
        setCommittedQ(trimmed);
        if (lastLoggedQuery.current !== trimmed) {
          lastLoggedQuery.current = trimmed;
          logSearchQuery({ query: trimmed, results_count: res.items.length, source: "storefront" });
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [q]);

  const isSearching = q.trim().length > 0;
  const showZeroState = isSearching && !searching && searchResults?.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="ScrollLibrary Store — Published Books"
        description="Discover AI-native books. Trending, top-selling, and recently published reads on ScrollLibrary."
        canonical="/store"
      />
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-4xl font-bold tracking-tight">Store</h1>
          <p className="mt-2 text-muted-foreground">Published books from ScrollLibrary authors.</p>
          <div className="mt-6 max-w-md">
            <Input
              placeholder="Search titles, topics, authors…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the store"
            />
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-6xl px-4 py-10">
        {isSearching ? (
          <SearchResults
            query={committedQ || q.trim()}
            results={searchResults}
            loading={searching}
            zeroState={showZeroState}
          />
        ) : (
          <>
            <DiscoveryRail
              title="Trending now"
              items={trending}
              loading={trending === null}
              onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "trending" })}
            />
            <DiscoveryRail
              title="Top selling"
              items={topSelling}
              loading={topSelling === null}
              emptyHint="No sales yet — check back soon."
              onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "top_selling" })}
            />
            <DiscoveryRail
              title="Recently published"
              items={recent}
              loading={recent === null}
              onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "recent" })}
            />
          </>
        )}
      </main>
    </div>
  );
}

function SearchResults({ query, results, loading, zeroState }: {
  query: string;
  results: StoreListing[] | null;
  loading: boolean;
  zeroState: boolean;
}) {
  if (loading && !results) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 w-full" />)}
      </div>
    );
  }
  if (zeroState) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold">No results for “{query}”</h2>
        <p className="mt-2 text-muted-foreground">Try one of these:</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {ZERO_RESULT_HINTS.map((h) => (
            <Link key={h} to={`/store?cat=${h}`} className="px-3 py-1 rounded-full bg-muted text-sm hover:bg-muted/80">{h}</Link>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {(results ?? []).map((l, idx) => (
        <Link
          key={l.id}
          to={`/store/${l.slug}`}
          onClick={() => logSearchClick({ query, clicked_book_id: l.book?.id ?? l.id, position: idx })}
        >
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
  );
}
