import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Author { user_id: string; slug: string; display_name: string; bio: string | null; avatar_url: string | null; website_url: string | null; linkedin_url: string | null; x_url: string | null; }
interface Book { id: string; title: string; cover_image_url: string | null; }

export default function AuthorProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [author, setAuthor] = useState<Author | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: a } = await supabase.from("author_profiles").select("*").eq("slug", slug).maybeSingle();
      if (!a) { setLoading(false); return; }
      setAuthor(a as any);
      const { data: listings } = await supabase
        .from("public_listings").select("slug, book:books(id, title, cover_image_url, user_id)").eq("is_public", true);
      const userBooks = ((listings ?? []) as any[]).filter((l) => l.book?.user_id === (a as any).user_id);
      setBooks(userBooks.map((l) => ({ ...l.book, slug: l.slug })));
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="container mx-auto max-w-4xl p-8"><Skeleton className="h-64" /></div>;
  if (!author) return <div className="container mx-auto max-w-4xl p-8"><h1>Author not found</h1></div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${author.display_name} — ScrollLibrary author`}
        description={(author.bio ?? `Books by ${author.display_name} on ScrollLibrary.`).slice(0, 158)}
        canonical={`/authors/${author.slug}`}
        type="profile"
        image={author.avatar_url ?? undefined}
      />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <Card className="p-8 flex flex-col sm:flex-row gap-6 items-start">
          {author.avatar_url && <img src={author.avatar_url} alt={author.display_name} className="w-28 h-28 rounded-full object-cover" />}
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{author.display_name}</h1>
            {author.bio && <p className="text-muted-foreground mt-2 whitespace-pre-line">{author.bio}</p>}
            <div className="mt-3 flex gap-4 text-sm">
              {author.website_url && <a href={author.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Website</a>}
              {author.linkedin_url && <a href={author.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">LinkedIn</a>}
              {author.x_url && <a href={author.x_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">X</a>}
            </div>
          </div>
        </Card>
        <h2 className="text-2xl font-semibold mt-10 mb-4">Books</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {books.map((b: any) => (
            <Link key={b.id} to={`/store/${b.slug}`}>
              <Card className="overflow-hidden hover:shadow-md transition">
                <div className="aspect-[3/4] bg-muted">
                  {b.cover_image_url && <img src={b.cover_image_url} alt={b.title} className="w-full h-full object-cover" />}
                </div>
                <div className="p-3"><p className="text-sm font-medium line-clamp-2">{b.title}</p></div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
