import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";

export default function PurchaseSuccess() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "pending">("loading");
  const [bookTitle, setBookTitle] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: listing } = await supabase
        .from("public_listings")
        .select("id, book:books(id, title)")
        .eq("slug", slug!)
        .maybeSingle();
      if (!listing) { setStatus("pending"); return; }
      const bookId = (listing.book as any)?.id;
      setBookTitle((listing.book as any)?.title ?? "");

      if (params.get("free")) {
        trackStorefrontEvent(listing.id, "checkout_completed", { free: true });
        setStatus("ready");
        return;
      }

      // Poll up to ~30s for webhook to mark purchase paid
      const sessionId = params.get("session_id");
      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (!user || !bookId) { setStatus("pending"); return; }
        const { data: p } = await supabase
          .from("book_purchases")
          .select("id, status")
          .eq("buyer_user_id", user.id)
          .eq("book_id", bookId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (p?.status === "paid") {
          trackStorefrontEvent(listing.id, "checkout_completed", { session_id: sessionId ?? null });
          setStatus("ready");
          return;
        }
        if (++attempts > 15) { setStatus("pending"); return; }
        setTimeout(poll, 2000);
      };
      poll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Purchase confirmed" description="Your book is unlocked." noindex />
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card className="p-10 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
              <h1 className="text-2xl font-bold mt-4">Confirming your purchase…</h1>
              <p className="text-muted-foreground mt-2">This usually takes a few seconds.</p>
            </>
          )}
          {status === "ready" && (
            <>
              <CheckCircle2 className="w-14 h-14 mx-auto text-primary" />
              <h1 className="text-3xl font-bold mt-4">You own {bookTitle}</h1>
              <p className="text-muted-foreground mt-2">The full book is now unlocked in your library.</p>
              <div className="mt-6 flex gap-3 justify-center">
                <Button onClick={() => navigate(`/store/${slug}/read-full`)}>Read full book</Button>
                <Link to="/account/library/purchases">
                  <Button variant="outline">My library</Button>
                </Link>
              </div>
            </>
          )}
          {status === "pending" && (
            <>
              <h1 className="text-2xl font-bold">Still processing…</h1>
              <p className="text-muted-foreground mt-2">
                Your payment may take a moment to confirm. We'll email you when it's done, or check{" "}
                <Link to="/account/library/purchases" className="text-primary hover:underline">your library</Link>.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
