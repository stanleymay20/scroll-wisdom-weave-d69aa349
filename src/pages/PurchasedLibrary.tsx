import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Row {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  purchased_at: string | null;
  created_at: string;
  listing: { slug: string } | null;
  book: { id: string; title: string; cover_image_url: string | null } | null;
}

export default function PurchasedLibrary() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth?redirect=/account/library/purchases"); return; }
      const { data } = await supabase
        .from("book_purchases")
        .select("id, status, amount_cents, currency, purchased_at, created_at, listing:public_listings(slug), book:books(id, title, cover_image_url)")
        .eq("buyer_user_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="My library" description="Books you've purchased" noindex />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold">My library</h1>
        <p className="text-muted-foreground mt-1">Books you've purchased from the store.</p>
        <div className="mt-8 space-y-4">
          {loading ? <p>Loading…</p> :
           rows.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No purchases yet.</p>
              <Link to="/store"><Button className="mt-4">Browse the store</Button></Link>
            </Card>
          ) : rows.map((r) => (
            <Card key={r.id} className="p-4 flex items-center gap-4">
              <div className="w-16 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                {r.book?.cover_image_url && <img src={r.book.cover_image_url} alt={r.book.title} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{r.book?.title ?? "Unknown book"}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Badge variant={r.status === "paid" ? "default" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge>
                  <span>{r.amount_cents > 0 ? `${r.currency.toUpperCase()} $${(r.amount_cents / 100).toFixed(2)}` : "Free"}</span>
                  <span>· {new Date(r.purchased_at ?? r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {r.status === "paid" && r.listing?.slug && (
                <Link to={`/store/${r.listing.slug}/read-full`}>
                  <Button size="sm">Read</Button>
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
