import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Chapter { id: string; chapter_number: number; title: string; content: string | null; }

export default function FullBookReader() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate(`/auth?redirect=${encodeURIComponent(`/store/${slug}/read-full`)}`); return; }

      const { data: l } = await supabase
        .from("public_listings")
        .select("id, book:books(id, title, user_id)")
        .eq("slug", slug)
        .maybeSingle();
      const book = (l?.book as any) ?? null;
      if (!book) { setDenied(true); setLoading(false); return; }

      // Owner OR paid buyer
      const isOwner = book.user_id === user.id;
      let isBuyer = false;
      if (!isOwner) {
        const { data: p } = await supabase
          .from("book_purchases").select("id")
          .eq("buyer_user_id", user.id).eq("book_id", book.id).eq("status", "paid")
          .maybeSingle();
        isBuyer = !!p;
      }
      if (!isOwner && !isBuyer) { setDenied(true); setLoading(false); return; }

      setTitle(book.title);
      const { data: ch } = await supabase
        .from("chapters").select("id, chapter_number, title, content")
        .eq("book_id", book.id).order("chapter_number");
      setChapters((ch ?? []) as any);
      setLoading(false);
    })();
  }, [slug, navigate]);

  if (loading) return <div className="container mx-auto max-w-3xl p-8"><Skeleton className="h-96" /></div>;

  if (denied) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Locked" description="Purchase required" noindex />
        <div className="container mx-auto max-w-2xl px-4 py-16">
          <Card className="p-10 text-center">
            <h1 className="text-2xl font-bold">This book is locked</h1>
            <p className="text-muted-foreground mt-2">Purchase the book to unlock the full reader.</p>
            <Link to={`/store/${slug}`}>
              <Button className="mt-4">View book</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title={`${title} — Full book`} description={`Read ${title}.`} noindex />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Link to="/account/library/purchases" className="text-sm text-primary hover:underline">← My library</Link>
        <h1 className="text-3xl font-bold mt-4">{title}</h1>
        <div className="mt-10 space-y-12">
          {chapters.map((c) => (
            <article key={c.id} className="prose prose-neutral dark:prose-invert max-w-none">
              <h2>Chapter {c.chapter_number}: {c.title}</h2>
              <div className="whitespace-pre-wrap">{c.content}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
