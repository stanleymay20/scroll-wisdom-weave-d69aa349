/**
 * ReviewsSection — verified-reader reviews on a book listing.
 *
 * Rules enforced server-side by RLS + user_can_review_book():
 *  - Only buyers / library-entitled users (and never the author) can write a review.
 *  - One review per user per book (unique constraint).
 *  - Anyone can read reviews on a public listing.
 *
 * The aggregate (rating_avg / rating_count) is shown by SocialProofBadges via the
 * extended get_listing_social_proof RPC — no duplicated counting here.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Review {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  edited_at: string | null;
}

interface Props {
  bookId: string;
  listingId: string;
}

function Stars({ value, onChange, size = "md" }: { value: number; onChange?: (n: number) => void; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const Cmp = onChange ? "button" : "span";
        return (
          <Cmp
            key={n}
            {...(onChange ? { type: "button", onClick: () => onChange(n), "aria-label": `${n} star${n === 1 ? "" : "s"}` } : {})}
            className={onChange ? "p-0.5 hover:scale-110 transition-transform" : "inline-flex"}
          >
            <Star className={`${px} ${filled ? "fill-foreground text-foreground" : "text-muted-foreground/40"}`} />
          </Cmp>
        );
      })}
    </div>
  );
}

export function ReviewsSection({ bookId, listingId }: Props) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: list } = await supabase
      .from("book_reviews")
      .select("id,user_id,rating,body,created_at,edited_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(50);
    const arr = (list ?? []) as Review[];
    setReviews(arr);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);

    if (uid) {
      const mine = arr.find((r) => r.user_id === uid) ?? null;
      setMyReview(mine);
      if (mine) {
        setDraftRating(mine.rating);
        setDraftBody(mine.body ?? "");
      }
      const { data: ok } = await supabase.rpc("user_can_review_book" as never, {
        _user_id: uid,
        _book_id: bookId,
      } as never);
      setCanReview(Boolean(ok));
    } else {
      setCanReview(false);
      setMyReview(null);
    }
  }, [bookId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!userId) return;
    if (draftRating < 1 || draftRating > 5) {
      toast.error("Pick a rating between 1 and 5");
      return;
    }
    setSaving(true);
    try {
      const body = draftBody.trim().slice(0, 4000) || null;
      if (myReview) {
        const { error } = await supabase
          .from("book_reviews")
          .update({ rating: draftRating, body })
          .eq("id", myReview.id);
        if (error) throw error;
        toast.success("Review updated");
      } else {
        const { error } = await supabase
          .from("book_reviews")
          .insert({ book_id: bookId, listing_id: listingId, user_id: userId, rating: draftRating, body });
        if (error) throw error;
        toast.success("Thanks for your review");
      }
      setEditing(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save review";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!myReview) return;
    if (!confirm("Delete your review?")) return;
    const { error } = await supabase.from("book_reviews").delete().eq("id", myReview.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMyReview(null);
    setDraftBody("");
    setDraftRating(5);
    await load();
  };

  return (
    <Card className="mt-8 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reader reviews</h2>
        {reviews && reviews.length > 0 && (
          <span className="text-xs text-muted-foreground">{reviews.length} verified reader{reviews.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {/* Author / write-review block */}
      {userId && canReview && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          {myReview && !editing ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Stars value={myReview.rating} size="sm" />
                  <span className="text-xs text-muted-foreground">Your review</span>
                </div>
                {myReview.body && <p className="mt-2 text-sm whitespace-pre-line">{myReview.body}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{myReview ? "Edit your review" : "Write a review"}</span>
                <Stars value={draftRating} onChange={setDraftRating} size="lg" />
              </div>
              <Textarea
                className="mt-3 text-foreground caret-foreground"
                placeholder="What did you take away from this book? (optional)"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                maxLength={4000}
                rows={4}
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={submit} disabled={saving}>
                  {saving ? "Saving…" : myReview ? "Save changes" : "Post review"}
                </Button>
                {editing && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); if (myReview) { setDraftRating(myReview.rating); setDraftBody(myReview.body ?? ""); } }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {userId && !canReview && !myReview && (
        <p className="mt-3 text-xs text-muted-foreground">
          Reviews are open to verified readers — get this book to share your take.
        </p>
      )}

      {/* List */}
      <div className="mt-5 space-y-4">
        {reviews === null && <p className="text-sm text-muted-foreground">Loading reviews…</p>}
        {reviews && reviews.length === 0 && (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first verified reader to share your take.</p>
        )}
        {reviews && reviews.filter((r) => r.user_id !== userId).map((r) => (
          <div key={r.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Stars value={r.rating} size="sm" />
              <span>
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                {r.edited_at && " · edited"}
              </span>
            </div>
            {r.body && <p className="mt-2 text-sm whitespace-pre-line">{r.body}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
