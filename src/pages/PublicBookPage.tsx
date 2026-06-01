import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO, SITE_URL } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { getAttributionContext } from "@/lib/attribution";
import { toast } from "sonner";
import { storefrontApi, type StoreListing } from "@/lib/storefrontApi";
import { DiscoveryRail } from "@/components/storefront/DiscoveryRail";
import { ShareDialog } from "@/components/books/ShareDialog";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

// Local view type retains existing shape used by the page below.
interface Data {
  id: string;
  slug: string;
  blurb: string | null;
  subtitle: string | null;
  amazon_description: string | null;
  price_cents: number;
  currency: string;
  sample_chapters: number;
  cover_override_url: string | null;
  license_type: string;
  seo_keywords: string[];
  book: {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    category: string;
    user_id: string;
    total_chapters: number;
  } | null;
}

function toLocal(l: StoreListing): Data {
  return {
    id: l.id,
    slug: l.slug,
    blurb: l.blurb,
    subtitle: l.subtitle,
    amazon_description: l.amazon_description,
    price_cents: l.price_cents,
    currency: l.currency,
    sample_chapters: l.sample_chapters,
    cover_override_url: l.cover_override_url,
    license_type: l.license_type,
    seo_keywords: l.seo_keywords ?? [],
    book: l.book ? {
      id: l.book.id,
      title: l.book.title,
      description: l.book.description,
      cover_image_url: l.book.cover_image_url,
      category: l.book.category,
      user_id: l.book.author_user_id,
      total_chapters: l.book.total_chapters,
    } : null,
  };
}

export default function PublicBookPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [author, setAuthor] = useState<{ slug: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<StoreListing[] | null>(null);
  const [moreFromAuthor, setMoreFromAuthor] = useState<StoreListing[] | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const l = await storefrontApi.getBook(slug);
        setData(toLocal(l));
        if (l.author) setAuthor({ slug: l.author.slug, display_name: l.author.display_name });
        trackStorefrontEvent(l.id, "listing_view");
        // Fire discovery rail fetches in parallel.
        storefrontApi.related(slug, 8).then((r) => setRelated(r.items)).catch(() => setRelated([]));
        if (l.author?.slug) {
          storefrontApi.byAuthor(l.author.slug, { exclude: slug, limit: 8 })
            .then((r) => setMoreFromAuthor(r.items)).catch(() => setMoreFromAuthor([]));
        }
      } catch (_) { /* not found / network */ }
      setLoading(false);
    })();
  }, [slug]);



  if (loading) return <ResponsiveShell><div className="container mx-auto max-w-5xl p-8"><Skeleton className="h-96 w-full" /></div></ResponsiveShell>;
  if (!data || !data.book) return <ResponsiveShell><div className="container mx-auto max-w-5xl p-8"><h1 className="text-2xl font-bold">Not found</h1><Link to="/store" className="text-primary">Back to store</Link></div></ResponsiveShell>;


  const cover = data.cover_override_url || data.book.cover_image_url || "";
  const description = data.blurb || data.book.description || "";
  const price = data.price_cents > 0 ? `$${(data.price_cents / 100).toFixed(2)}` : "Free";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: data.book.title,
    description,
    image: cover || undefined,
    author: author ? { "@type": "Person", name: author.display_name } : undefined,
    offers: data.price_cents > 0 ? {
      "@type": "Offer",
      price: (data.price_cents / 100).toFixed(2),
      priceCurrency: data.currency.toUpperCase(),
      availability: "https://schema.org/InStock",
    } : undefined,
  };

  async function handleBuy() {
    trackStorefrontEvent(data!.id, "cta_click", { cta: "buy" });
    try {
      const attribution = getAttributionContext();
      const { data: res, error } = await supabase.functions.invoke("create-book-checkout", {
        body: { listing_id: data!.id, attribution },
      });
      // supabase-js wraps non-2xx as FunctionsHttpError; read the real body
      if (error) {
        let serverMsg = error.message || "Could not start checkout";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.error) serverMsg = body.error;
            if (body?.already_owned) {
              toast.success("You already own this book");
              navigate(`/store/${data!.slug}/read-full`);
              return;
            }
          }
        } catch { /* keep serverMsg */ }
        throw new Error(serverMsg);
      }
      const r = (res ?? {}) as { url?: string; redirect_url?: string; already_owned?: boolean; free?: boolean; error?: string };
      if (r.error) throw new Error(r.error);
      if (r.already_owned) {
        toast.success("You already own this book");
        navigate(`/store/${data!.slug}/read-full`);
        return;
      }
      if (r.free && r.redirect_url) {
        navigate(r.redirect_url.replace(window.location.origin, ""));
        return;
      }
      if (r.url) {
        // Open in new tab so the storefront tab is preserved (works in iframe previews too)
        const win = window.open(r.url, "_blank", "noopener,noreferrer");
        if (!win) window.location.href = r.url;
        return;
      }
      // Fallback: capture intent only
      await supabase.functions.invoke("record-purchase-intent", {
        body: { listing_id: data!.id, source: "storefront" },
      });
      toast.success("Thanks! We'll notify you when purchases open.");
    } catch (e: any) {
      const msg = e?.message ?? "Could not start checkout";
      trackStorefrontEvent(data!.id, "purchase_failed", {
        reason: /sign in/i.test(msg) ? "unauthenticated" : "checkout_error",
        message: String(msg).slice(0, 240),
      });
      if (/sign in/i.test(msg)) {
        toast.error("Please sign in to claim this book");
        navigate("/auth?redirect=" + encodeURIComponent(`/store/${data!.slug}`));
        return;
      }
      toast.error(msg);
    }
  }


  return (
    <ResponsiveShell>
    <div className="min-h-screen bg-background">
      <SEO
        title={`${data.book.title} — ScrollLibrary`}
        description={(description).slice(0, 158)}
        canonical={`/store/${data.slug}`}
        type="book"
        image={cover || undefined}
        jsonLd={jsonLd}
      />
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
          <div>
            <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden shadow-lg">
              {cover && <img src={cover} alt={data.book.title} className="w-full h-full object-cover" />}
            </div>
          </div>
          <div>
            <Badge variant="secondary">{data.book.category}</Badge>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-3">{data.book.title}</h1>
            {data.subtitle && <p className="text-xl text-muted-foreground mt-2">{data.subtitle}</p>}
            {author && (
              <p className="mt-3 text-sm">
                By <Link to={`/authors/${author.slug}`} className="text-primary hover:underline">{author.display_name}</Link>
              </p>
            )}
            <div className="mt-6 text-2xl font-semibold">{price}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => { trackStorefrontEvent(data.id, "cta_click", { cta: "read_sample" }); navigate(`/store/${data.slug}/read`); }}>
                Read sample
              </Button>
              <Button variant="default" onClick={handleBuy}>
                {data.price_cents > 0 ? `Buy for $${(data.price_cents / 100).toFixed(2)}` : "Get free copy"}
              </Button>
              <Button variant="outline" onClick={handleShare}>Share</Button>
            </div>
            <Card className="mt-8 p-6">
              <h2 className="text-lg font-semibold">About this book</h2>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {data.amazon_description || description}
              </p>
            </Card>
            <div className="mt-6 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">Chapters:</span> {data.book.total_chapters || "—"}</p>
              <p><span className="font-medium text-foreground">License:</span> {data.license_type}</p>
              <p><span className="font-medium text-foreground">Sample:</span> First {data.sample_chapters} chapter{data.sample_chapters === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>

        <div className="mt-16">
          {author && (
            <DiscoveryRail
              title={`More from ${author.display_name}`}
              items={moreFromAuthor}
              loading={moreFromAuthor === null}
              onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "more_from_author" })}
            />
          )}
          <DiscoveryRail
            title="Related books"
            items={related}
            loading={related === null}
            onItemClick={(l) => trackStorefrontEvent(l.id, "cta_click", { surface: "related" })}
          />
        </div>
      </div>
    </div>
    </ResponsiveShell>
  );
}
