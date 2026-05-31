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
import { ContinueReadingRail } from "@/components/storefront/ContinueReadingRail";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { storefrontUserApi } from "@/lib/storefrontUserApi";
import { supabase } from "@/integrations/supabase/client";

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
  const [recommended, setRecommended] = useState<StoreListing[] | null>(null);
  const [forYou, setForYou] = useState<StoreListing[] | null>(null);
  const [fromAuthors, setFromAuthors] = useState<StoreListing[] | null>(null);
  const [continueSeries, setContinueSeries] = useState<StoreListing[] | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoggedQuery = useRef<string>("");

  // Load discovery rails once.
  useEffect(() => {
    // Drain the post-publish marker set by BookPublishSettings so the
    // creator's first storefront visit after going live is observable.
    try {
      const justPublished = sessionStorage.getItem("sl_just_published_listing");
      if (justPublished) {
        sessionStorage.removeItem("sl_just_published_listing");
        trackStorefrontEvent(justPublished, "storefront_viewed_after_publish");
      }
    } catch { /* ignore */ }

    (async () => {
      try {
        const [t, ts, r, rec] = await Promise.allSettled([
          storefrontApi.trending(12),
          storefrontApi.topSelling(12),
          storefrontApi.recent(12),
          storefrontApi.recommended(12),
        ]);
        if (t.status === "fulfilled") setTrending(t.value.items);
        if (ts.status === "fulfilled") setTopSelling(ts.value.items);
        if (r.status === "fulfilled") setRecent(r.value.items);
        if (rec.status === "fulfilled") setRecommended(rec.value.items);
      } catch { /* swallow */ }
    })();
  }, []);

  // Personalized rails for authenticated users only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      setIsAuthed(true);
      const [fu, fa, cs] = await Promise.allSettled([
        storefrontUserApi.recommendedForUser(12),
        storefrontUserApi.fromFollowedAuthors(12),
        storefrontUserApi.continueSeries(8),
      ]);
      if (cancelled) return;
      if (fu.status === "fulfilled") setForYou(fu.value.items);
      if (fa.status === "fulfilled") setFromAuthors(fa.value.items);
      if (cs.status === "fulfilled") setContinueSeries(cs.value.items);
    })();
    return () => { cancelled = true; };
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
    <ResponsiveShell>
      <div className="min-h-screen bg-background">
        <SEO
          title="ScrollLibrary Store — Published Books"
          description="Discover AI-native books. Trending, top-selling, and recently published reads on ScrollLibrary."
          canonical="/store"
        />
        <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 sm:static z-30">
          <div className="container mx-auto max-w-6xl px-4 py-4 sm:py-10">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Store</h1>
            <p className="mt-1 hidden sm:block text-muted-foreground text-sm sm:text-base">Published books from ScrollLibrary authors.</p>
            <div className="mt-3 sm:mt-6 max-w-md">
              <Input
                placeholder="Search titles, topics, authors…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search the store"
                className="text-foreground caret-foreground h-11 rounded-full"
              />
            </div>
          </div>
        </header>
        <main className="container mx-auto max-w-6xl px-4 py-5 sm:py-10">
          {isSearching ? (
            <SearchResults
              query={committedQ || q.trim()}
              results={searchResults}
              loading={searching}
              zeroState={showZeroState}
            />
          ) : (
            <>
              <ContinueReadingRail />
              {isAuthed && (
                <>
                  <DiscoveryRail
                    title="Continue this series"
                    items={continueSeries}
                    loading={continueSeries === null}
                    source="continue_series"
                    onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "continue_series" })}
                  />
                  <DiscoveryRail
                    title="For you"
                    items={forYou}
                    loading={forYou === null}
                    source="recommended_for_user"
                    onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "recommended_for_user" })}
                  />
                  <DiscoveryRail
                    title="From authors you follow"
                    items={fromAuthors}
                    loading={fromAuthors === null}
                    source="from_followed_authors"
                    onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "from_followed_authors" })}
                  />
                </>
              )}
              <DiscoveryRail
                title="Trending now"
                items={trending}
                loading={trending === null}
                emptyHint="Trending picks are warming up — check back soon."
                source="trending"
                onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "trending" })}
              />
              <DiscoveryRail
                title="Recommended"
                items={recommended}
                loading={recommended === null}
                emptyHint="Recommendations will appear as the catalog grows."
                source="recommended"
                onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "recommended" })}
              />
              <DiscoveryRail
                title="Top selling"
                items={topSelling}
                loading={topSelling === null}
                emptyHint="No sales yet — check back soon."
                source="top_selling"
                onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "top_selling" })}
              />
              <DiscoveryRail
                title="Recently published"
                items={recent}
                loading={recent === null}
                emptyHint="New releases will appear here."
                source="recent"
                onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "recent" })}
              />
            </>
          )}
        </main>
      </div>
    </ResponsiveShell>
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
