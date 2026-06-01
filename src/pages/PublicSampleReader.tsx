import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { MarkdownRenderer } from "@/components/reader/MarkdownRenderer";

interface Chapter { id: string; chapter_number: number; title: string; content: string | null; }

export default function PublicSampleReader() {
  const { slug } = useParams<{ slug: string }>();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState("");
  const [listingId, setListingId] = useState<string | null>(null);
  const [sampleCount, setSampleCount] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: l } = await supabase
        .from("public_listings")
        .select("id, sample_chapters, book:books(id, title)")
        .eq("slug", slug).eq("is_public", true).maybeSingle();
      if (!l?.book) { setLoading(false); return; }
      setListingId(l.id); setSampleCount(l.sample_chapters); setTitle((l.book as any).title);
      const { data: ch } = await supabase
        .from("chapters").select("id, chapter_number, title, content")
        .eq("book_id", (l.book as any).id).order("chapter_number").limit(l.sample_chapters);
      setChapters((ch ?? []) as any);
      setLoading(false);
      trackStorefrontEvent(l.id, "sample_open");
    })();
  }, [slug]);

  useEffect(() => {
    if (!loading && listingId) {
      const t = setTimeout(() => trackStorefrontEvent(listingId, "sample_complete"), 30_000);
      return () => clearTimeout(t);
    }
  }, [loading, listingId]);

  if (loading) return <div className="container mx-auto max-w-3xl p-8"><Skeleton className="h-96" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`Sample — ${title}`} description={`Read a free sample of ${title}.`} canonical={`/store/${slug}/read`} noindex />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Link to={`/store/${slug}`} className="text-sm text-primary hover:underline">← Back</Link>
        <h1 className="text-3xl font-bold mt-4">{title}</h1>
        <p className="text-muted-foreground mt-1">Free sample · First {sampleCount} chapter{sampleCount === 1 ? "" : "s"}</p>
        <div className="mt-10 space-y-12">
          {chapters.map((c) => (
            <article key={c.id} className="prose prose-neutral dark:prose-invert max-w-none">
              <h2>Chapter {c.chapter_number}: {c.title}</h2>
              <div className="whitespace-pre-wrap">{c.content}</div>
            </article>
          ))}
        </div>
        <Card className="mt-12 p-8 text-center">
          <h3 className="text-xl font-semibold">Enjoying the sample?</h3>
          <p className="text-muted-foreground mt-2">Unlock the full book to keep reading.</p>
          <Link to={`/store/${slug}`}>
            <Button className="mt-4" onClick={() => trackStorefrontEvent(listingId, "cta_click", { cta: "paywall_unlock" })}>
              Unlock full book
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
