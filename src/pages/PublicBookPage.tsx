import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO, SITE_URL } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { toast } from "sonner";

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

export default function PublicBookPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [author, setAuthor] = useState<{ slug: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: l } = await supabase
        .from("public_listings")
        .select("id, slug, blurb, subtitle, amazon_description, price_cents, currency, sample_chapters, cover_override_url, license_type, seo_keywords, book:books(id, title, description, cover_image_url, category, user_id, total_chapters)")
        .eq("slug", slug).eq("is_public", true).maybeSingle();
      if (!l) { setLoading(false); return; }
      setData(l as any);
      if (l.book?.user_id) {
        const { data: a } = await supabase.from("author_profiles").select("slug, display_name").eq("user_id", l.book.user_id).maybeSingle();
        setAuthor(a as any);
      }
      setLoading(false);
      trackStorefrontEvent((l as any).id, "listing_view");
    })();
  }, [slug]);

  if (loading) return <div className="container mx-auto max-w-5xl p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!data || !data.book) return <div className="container mx-auto max-w-5xl p-8"><h1 className="text-2xl font-bold">Not found</h1><Link to="/store" className="text-primary">Back to store</Link></div>;

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
      const { data: res, error } = await supabase.functions.invoke("create-book-checkout", {
        body: { listing_id: data!.id },
      });
      if (error) throw error;
      const r = res as { url?: string; redirect_url?: string; already_owned?: boolean; free?: boolean };
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
        window.location.href = r.url;
        return;
      }
      // Fallback: capture intent only
      await supabase.functions.invoke("record-purchase-intent", {
        body: { listing_id: data!.id, source: "storefront" },
      });
      toast.success("Thanks! We'll notify you when purchases open.");
    } catch (e: any) {
      const msg = e?.message ?? "Could not start checkout";
      if (msg.includes("Sign in")) {
        toast.error("Please sign in to claim this book");
        navigate("/auth?redirect=" + encodeURIComponent(`/store/${data!.slug}`));
        return;
      }
      toast.error(msg);
    }
  }

  function handleShare() {
    trackStorefrontEvent(data!.id, "share_click");
    const url = `${SITE_URL}/store/${data!.slug}`;
    if (navigator.share) navigator.share({ title: data!.book!.title, url }).catch(() => {});
    else { navigator.clipboard.writeText(url); toast.success("Link copied"); }
  }

  return (
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
      </div>
    </div>
  );
}
