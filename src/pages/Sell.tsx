/**
 * /sell — Creator onboarding wizard.
 * Beginner-friendly funnel that reuses existing creator infrastructure:
 * - author_profiles (Step 2)
 * - creator-payout-profile edge function (Step 3)
 * - public_listings (Step 4)
 * - creator_entitlements (upgrade messaging)
 * - storefrontAnalytics events (telemetry)
 *
 * Mobile-first, safe-area aware, draft persisted in localStorage,
 * advanced infra (audit, schedules, platform connections, entitlement
 * snapshots) hidden behind /book/:id/publish "More publishing options".
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreatorEntitlements } from "@/hooks/useCreatorEntitlements";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { parseBookToCanonical } from "@/lib/canonicalContent";
import { auditBookForExport, type ExportQualityReport } from "@/lib/exportQuality";
import { toast } from "sonner";
import {
  Sparkles, Rocket, CheckCircle2, Lock, ArrowRight, ArrowLeft, Copy, Share2,
  DollarSign, Globe, BookOpen, ShieldCheck, AlertTriangle, ExternalLink, Wallet,
  Users, TrendingUp, PartyPopper, Pencil, Store, ShoppingBag,
} from "lucide-react";
import { publishExternallyOneClick, waitForBundle } from "@/lib/oneClickPublish";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Surface a clean message instead of raw Postgres / pg-rest errors. */
function friendlyError(e: any, fallback: string): string {
  const msg = String(e?.message ?? e ?? "");
  if (!msg) return fallback;
  if (/duplicate key|unique constraint|23505/i.test(msg)) return "That URL is already taken — try a different one.";
  if (/not_authorised|not authorized|permission/i.test(msg)) return "You don't have permission to do that.";
  if (/network|fetch|failed to fetch/i.test(msg)) return "Network issue — check your connection and retry.";
  if (msg.length > 160) return fallback;
  return msg;
}

/** Try INSERT/UPSERT; on slug-collision (23505) retry with -2, -3… up to 5. */
async function withSlugRetry<T>(baseSlug: string, run: (slug: string) => Promise<T>): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    try { return await run(slug); }
    catch (e: any) {
      lastErr = e;
      if (!/duplicate key|unique constraint|23505/i.test(String(e?.message ?? e))) throw e;
    }
  }
  throw lastErr;
}

type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;
const STEP_LABELS = ["Welcome", "Profile", "Payouts", "Publish", "Launch"];
const DRAFT_KEY = "sell_wizard_draft_v1";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

interface Book { id: string; title: string; cover_image_url: string | null; category: string | null; }

interface DraftState {
  step: Step;
  profile: { display_name: string; bio: string; slug: string; avatar_url: string; website_url: string; x_url: string; linkedin_url: string; };
  publish: { book_id: string; slug: string; blurb: string; price_cents: number; sample_chapters: number; is_public: boolean; cover_override_url: string; };
}

const EMPTY_DRAFT: DraftState = {
  step: 0,
  profile: { display_name: "", bio: "", slug: "", avatar_url: "", website_url: "", x_url: "", linkedin_url: "" },
  publish: { book_id: "", slug: "", blurb: "", price_cents: 900, sample_chapters: 1, is_public: true, cover_override_url: "" },
};

export default function Sell() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { entitlements, loading: entLoading } = useCreatorEntitlements();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoadError, setBooksLoadError] = useState<string | null>(null);
  const [reloadBooksTick, setReloadBooksTick] = useState(0);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [payoutProfile, setPayoutProfile] = useState<any>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [publishedListing, setPublishedListing] = useState<{ slug: string; id: string } | null>(null);
  const [editingListing, setEditingListing] = useState(false);
  const [hasAuthorProfile, setHasAuthorProfile] = useState(false);

  // Load draft + user + books + author profile + payout profile + existing listing
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth?redirect=/sell"); return; }
      setUserId(user.id);

      // Hydrate draft
      let next: DraftState = EMPTY_DRAFT;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) next = { ...EMPTY_DRAFT, ...JSON.parse(raw) };
      } catch { /* ignore */ }

      // Override step from URL if present
      const urlStep = Number(params.get("step"));
      const hasUrlStep = !Number.isNaN(urlStep) && urlStep >= 0 && urlStep < TOTAL_STEPS;
      if (hasUrlStep) next = { ...next, step: urlStep as Step };

      // Hydrate from existing author profile (server wins for already-saved fields)
      const { data: ap } = await supabase.from("author_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (ap) {
        setHasAuthorProfile(true);
        next = {
          ...next,
          profile: {
            display_name: ap.display_name ?? next.profile.display_name,
            bio: ap.bio ?? next.profile.bio,
            slug: ap.slug ?? next.profile.slug,
            avatar_url: ap.avatar_url ?? next.profile.avatar_url,
            website_url: ap.website_url ?? next.profile.website_url,
            x_url: ap.x_url ?? next.profile.x_url,
            linkedin_url: ap.linkedin_url ?? next.profile.linkedin_url,
          },
        };
      } else if (!next.profile.display_name) {
        const { data: p } = await supabase.from("profiles").select("full_name").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle();
        const name = p?.full_name ?? user.email?.split("@")[0] ?? "";
        next.profile.display_name = name;
        next.profile.slug = slugify(name);
      }

      // Books for publish step — match RLS policy (creator_id OR user_id)
      // with a single retry to absorb transient statement_timeout (Postgres 57014).
      const fetchOwnedBooks = async () => {
        const filter = `user_id.eq.${user.id},creator_id.eq.${user.id}`;
        return await supabase.from("books")
          .select("id, title, cover_image_url, category")
          .or(filter)
          .order("created_at", { ascending: false })
          .limit(50);
      };
      let { data: bs, error: booksErr } = await fetchOwnedBooks();
      if (booksErr && /57014|timeout|timed out/i.test(String(booksErr.message ?? booksErr.code ?? ""))) {
        await new Promise((r) => setTimeout(r, 400));
        ({ data: bs, error: booksErr } = await fetchOwnedBooks());
      }
      if (booksErr) {
        console.error("[SELL] books load failed:", booksErr);
        setBooksLoadError(friendlyError(booksErr, "Could not load your books."));
      } else {
        setBooksLoadError(null);
      }
      setBooks(bs ?? []);

      // Preselect from ?bookId= if user owns it
      const urlBookId = params.get("bookId");
      if (urlBookId && (bs ?? []).some((b) => b.id === urlBookId)) {
        const b = (bs ?? []).find((x) => x.id === urlBookId)!;
        next = {
          ...next,
          publish: { ...next.publish, book_id: urlBookId, slug: next.publish.slug || slugify(b.title) },
        };
      }

      // Hydrate existing public_listing for the selected book (prevents data loss on re-entry)
      if (next.publish.book_id) {
        const { data: existing } = await supabase.from("public_listings")
          .select("id, slug, blurb, price_cents, sample_chapters, is_public, cover_override_url")
          .eq("book_id", next.publish.book_id).maybeSingle();
        if (existing) {
          setEditingListing(true);
          next = {
            ...next,
            publish: {
              book_id: next.publish.book_id,
              slug: existing.slug,
              blurb: existing.blurb ?? "",
              price_cents: existing.price_cents ?? 0,
              sample_chapters: existing.sample_chapters ?? 1,
              is_public: existing.is_public ?? true,
              cover_override_url: existing.cover_override_url ?? "",
            },
          };
          // If user landed on step=4 (launch) via refresh, recover the success view from DB.
          if (next.step === 4) setPublishedListing({ slug: existing.slug, id: existing.id });
        } else if (next.step === 4) {
          // step=4 but no listing yet → bounce to publish step
          next = { ...next, step: 3 as Step };
        }
      } else if (next.step === 4) {
        next = { ...next, step: 3 as Step };
      }

      // Step-guard: jumping past Welcome via URL without a saved profile → force step 1
      if (hasUrlStep && urlStep >= 1 && !ap && !next.profile.display_name.trim()) {
        next = { ...next, step: 1 as Step };
      }

      setDraft(next);

      // Payout profile (best-effort)
      try {
        const { data: pd } = await supabase.functions.invoke("creator-payout-profile", { method: "GET" });
        if (pd && (pd as any).profile) setPayoutProfile((pd as any).profile);
      } catch { /* ignore */ }

      setLoading(false);
      void trackStorefrontEvent(null, "sell_onboarding_started" as any, { step: next.step, resumed: !!ap });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadBooksTick]);

  // Persist draft
  useEffect(() => {
    if (!loading) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, loading]);

  const setStep = useCallback((s: Step) => {
    setDraft((d) => ({ ...d, step: s }));
    setParams((p) => { p.set("step", String(s)); return p; }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setParams]);

  const progress = useMemo(() => Math.round(((draft.step + 1) / TOTAL_STEPS) * 100), [draft.step]);

  // --- Step actions -------------------------------------------------------
  async function saveProfileAndContinue() {
    if (!userId) return;
    const baseSlug = draft.profile.slug || slugify(draft.profile.display_name);
    if (!draft.profile.display_name.trim() || !baseSlug) {
      toast.error("Display name is required"); return;
    }
    setSavingStep(true);
    try {
      const savedSlug = await withSlugRetry(baseSlug, async (candidate) => {
        const { error } = await supabase.from("author_profiles").upsert({
          user_id: userId,
          display_name: draft.profile.display_name.trim(),
          slug: candidate,
          bio: draft.profile.bio || null,
          avatar_url: draft.profile.avatar_url || null,
          website_url: draft.profile.website_url || null,
          x_url: draft.profile.x_url || null,
          linkedin_url: draft.profile.linkedin_url || null,
        }, { onConflict: "user_id" });
        if (error) throw error;
        return candidate;
      });
      if (savedSlug !== baseSlug) {
        toast.info(`Your URL was taken — saved as /authors/${savedSlug}.`);
      }
      setDraft((d) => ({ ...d, profile: { ...d.profile, slug: savedSlug } }));
      setHasAuthorProfile(true);
      toast.success("Profile saved");
      setStep(2);
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not save profile"));
    } finally { setSavingStep(false); }
  }

  async function savePayoutAndContinue() {
    const email = (payoutProfile?.payout_email ?? "").trim();
    const country = (payoutProfile?.country_code ?? "").trim().toUpperCase();
    if (email && !EMAIL_RE.test(email)) { toast.error("Enter a valid email."); return; }
    if (country && country.length !== 2) { toast.error("Country must be a 2-letter ISO code (e.g. US)."); return; }
    setSavingStep(true);
    try {
      const { data, error } = await supabase.functions.invoke("creator-payout-profile", {
        body: {
          payout_method: payoutProfile?.payout_method === "stripe_connect" ? undefined : "manual",
          payout_email: email || null,
          country_code: country || null,
        },
      });
      if (error) throw error;
      setPayoutProfile((data as any).profile);
      void trackStorefrontEvent(null, "sell_payout_connected" as any);
      setStep(3);
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not save payout"));
    } finally { setSavingStep(false); }
  }

  async function publishAndContinue() {
    if (!userId) return;
    if (!draft.publish.book_id) { toast.error("Select a book to publish"); return; }
    // Guard: must have author profile before listing publicly
    if (draft.publish.is_public && !hasAuthorProfile) {
      toast.error("Save your creator profile first.");
      setStep(1); return;
    }
    const baseSlug = draft.publish.slug || slugify(books.find(b => b.id === draft.publish.book_id)?.title ?? "");
    if (!baseSlug) { toast.error("URL slug is required"); return; }
    const priceCents = Math.max(0, Math.floor(draft.publish.price_cents || 0));
    const isPaid = priceCents > 0;

    setSavingStep(true);
    try {
      // Quality gate for paid public listings — match the BookPublishSettings policy.
      if (isPaid && draft.publish.is_public) {
        const { data: chs } = await supabase.from("chapters")
          .select("chapter_number, title, content")
          .eq("book_id", draft.publish.book_id)
          .order("chapter_number", { ascending: true });
        const selectedBook = books.find(b => b.id === draft.publish.book_id);
        const report: ExportQualityReport = auditBookForExport(
          parseBookToCanonical(chs ?? []),
          { hasCover: !!selectedBook?.cover_image_url },
        );
        if (report.status === "blocked") {
          void trackStorefrontEvent(null, "export_quality_blocked" as any, { book_id: draft.publish.book_id, issues: report.issues.length });
          toast.error("This book has export-quality blockers. Open publishing settings to resolve them before charging readers.");
          setSavingStep(false);
          return;
        }
        if (report.status === "needs_review") {
          void trackStorefrontEvent(null, "export_quality_warning" as any, { book_id: draft.publish.book_id, issues: report.issues.length });
        }
      }

      const { data: existing } = await supabase.from("public_listings")
        .select("id").eq("book_id", draft.publish.book_id).maybeSingle();

      const basePayload = {
        book_id: draft.publish.book_id,
        blurb: draft.publish.blurb || null,
        price_cents: priceCents,
        sample_chapters: Math.max(0, Math.floor(draft.publish.sample_chapters || 0)),
        is_public: draft.publish.is_public,
        cover_override_url: draft.publish.cover_override_url || null,
      };

      let savedListingId: string | null = existing?.id ?? null;
      const savedSlug = await withSlugRetry(baseSlug, async (candidate) => {
        if (existing) {
          const { error } = await supabase.from("public_listings")
            .update({ ...basePayload, slug: candidate }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase.from("public_listings")
            .insert({ ...basePayload, slug: candidate }).select("id").single();
          if (error) throw error;
          savedListingId = inserted?.id ?? null;
        }
        return candidate;
      });

      if (savedSlug !== baseSlug) toast.info(`That URL was taken — saved as /store/${savedSlug}.`);
      if (!savedListingId) {
        // Re-fetch to get the listing id we need for one-click external publish.
        const { data: l } = await supabase.from("public_listings")
          .select("id").eq("book_id", draft.publish.book_id).maybeSingle();
        savedListingId = l?.id ?? "";
      }
      setPublishedListing({ slug: savedSlug, id: savedListingId ?? "" });
      setEditingListing(true);
      void trackStorefrontEvent(null, "sell_first_book_published" as any, { book_id: draft.publish.book_id, edited: !!existing });
      setStep(4);
    } catch (e: any) {
      toast.error(friendlyError(e, "Could not publish"));
    } finally { setSavingStep(false); }
  }

  // --- Render -------------------------------------------------------------
  if (loading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-10 space-y-4">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-2 w-full" /><Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SEO title="Start Selling — ScrollLibrary" description="Set up your creator profile, payouts, and publish your first book in minutes." noindex />

      {/* Sticky progress header */}
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="container mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-sm font-medium">Start Selling</span>
              <Badge variant="secondary" className="text-xs">{STEP_LABELS[draft.step]}</Badge>
            </div>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Step {draft.step + 1} of {TOTAL_STEPS}
            </span>
          </div>
          <Progress value={progress} aria-label={`Onboarding progress ${progress}%`} className="h-1.5" />
        </div>
      </header>

      <main
        className="container mx-auto max-w-2xl px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]"
        id="main-content"
      >
        {draft.step === 0 && <StepWelcome onStart={() => setStep(1)} entitlementTier={entitlements.tier} />}
        {draft.step === 1 && (
          <StepProfile
            value={draft.profile}
            onChange={(p) => setDraft((d) => ({ ...d, profile: p }))}
            onBack={() => setStep(0)} onNext={saveProfileAndContinue} saving={savingStep}
          />
        )}
        {draft.step === 2 && (
          <StepPayout
            profile={payoutProfile} setProfile={setPayoutProfile}
            onBack={() => setStep(1)} onNext={savePayoutAndContinue} saving={savingStep}
          />
        )}
        {draft.step === 3 && (
          <StepPublish
            books={books} value={draft.publish}
            onChange={(p) => setDraft((d) => ({ ...d, publish: p }))}
            onBack={() => setStep(2)} onNext={publishAndContinue} saving={savingStep}
            canPublishExternal={entitlements.can_publish_external}
            entitlementTier={entitlements.tier} entitlementLoading={entLoading}
            editing={editingListing}
            loadError={booksLoadError}
            onRetryLoad={() => { setBooksLoadError(null); setReloadBooksTick((t) => t + 1); }}
          />
        )}
        {draft.step === 4 && publishedListing && (
          <StepLaunch
            slug={publishedListing.slug}
            bookId={draft.publish.book_id}
            listingId={publishedListing.id}
            canPublishExternal={entitlements.can_publish_external}
            onReset={() => { localStorage.removeItem(DRAFT_KEY); setDraft(EMPTY_DRAFT); setPublishedListing(null); setStep(0); }}
          />
        )}

        {/* Education cards — visible on welcome + payout for motivation */}
        {(draft.step === 0 || draft.step === 2) && <EducationCards tier={entitlements.tier} />}
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step components
// ----------------------------------------------------------------------------

function StepWelcome({ onStart, entitlementTier }: { onStart: () => void; entitlementTier: string }) {
  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
        <div className="flex items-center gap-2 text-xs font-medium text-primary mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Creator economy on ScrollLibrary</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">
          Turn your knowledge into income.
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Publish your books to a global storefront in minutes. Reach readers, build an audience,
          and get paid — without juggling tax forms, platforms, or marketing tools.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-6">
          {[
            { icon: DollarSign, label: "Sell books" },
            { icon: Globe, label: "Publish externally" },
            { icon: TrendingUp, label: "Earn revenue" },
            { icon: Users, label: "Build audience" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
              <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
        <Button size="lg" className="w-full mt-6 min-h-12" onClick={onStart}>
          Start Selling <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        {entitlementTier !== "free" && (
          <p className="text-xs text-center text-muted-foreground mt-3">
            <ShieldCheck className="inline h-3 w-3 mr-1" />
            You're on the <span className="font-medium capitalize">{entitlementTier.replace("_", " ")}</span> plan.
          </p>
        )}
      </Card>
    </div>
  );
}

function StepProfile({
  value, onChange, onBack, onNext, saving,
}: {
  value: DraftState["profile"];
  onChange: (v: DraftState["profile"]) => void;
  onBack: () => void; onNext: () => void; saving: boolean;
}) {
  return (
    <Card className="p-5 md:p-7 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-semibold">Your creator profile</h2>
        <p className="text-sm text-muted-foreground mt-1">This is what readers see on your storefront.</p>
      </div>
      <div className="space-y-4">
        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" className="text-foreground caret-foreground mt-1.5"
            value={value.display_name} autoComplete="name"
            onChange={(e) => onChange({ ...value, display_name: e.target.value, slug: value.slug || slugify(e.target.value) })} />
        </div>
        <div>
          <Label htmlFor="slug">Profile URL</Label>
          <div className="flex items-center mt-1.5 rounded-md border bg-background overflow-hidden">
            <span className="text-xs text-muted-foreground pl-3 pr-1 select-none whitespace-nowrap">/authors/</span>
            <Input id="slug" className="text-foreground caret-foreground border-0 focus-visible:ring-0"
              value={value.slug} placeholder="your-name" inputMode="url"
              onChange={(e) => onChange({ ...value, slug: slugify(e.target.value) })} />
          </div>
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" className="text-foreground caret-foreground mt-1.5 min-h-28"
            placeholder="A few sentences about you and what you write."
            value={value.bio} onChange={(e) => onChange({ ...value, bio: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="avatar">Avatar URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="avatar" className="text-foreground caret-foreground mt-1.5" inputMode="url"
            value={value.avatar_url} placeholder="https://…"
            onChange={(e) => onChange({ ...value, avatar_url: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Website</Label><Input className="text-foreground caret-foreground mt-1" inputMode="url" value={value.website_url} onChange={(e) => onChange({ ...value, website_url: e.target.value })} /></div>
          <div><Label className="text-xs">X / Twitter</Label><Input className="text-foreground caret-foreground mt-1" inputMode="url" value={value.x_url} onChange={(e) => onChange({ ...value, x_url: e.target.value })} /></div>
          <div><Label className="text-xs">LinkedIn</Label><Input className="text-foreground caret-foreground mt-1" inputMode="url" value={value.linkedin_url} onChange={(e) => onChange({ ...value, linkedin_url: e.target.value })} /></div>
        </div>
      </div>
      <StepNav onBack={onBack} onNext={onNext} saving={saving} nextLabel="Save & continue" />
    </Card>
  );
}

function StepPayout({
  profile, setProfile, onBack, onNext, saving,
}: {
  profile: any; setProfile: (p: any) => void;
  onBack: () => void; onNext: () => void; saving: boolean;
}) {
  const incomplete = !profile?.payout_email || !profile?.country_code;
  return (
    <Card className="p-5 md:p-7 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-semibold">Get paid</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us where to send earnings. You can switch to Stripe Connect once it's live.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
        <Wallet className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden />
        <div className="text-sm">
          <div className="font-medium">Stripe Connect onboarding</div>
          <p className="text-muted-foreground text-xs mt-0.5">
            Direct bank payouts via Stripe will roll out shortly. For now, set a payout email and country —
            we'll route earnings manually until Connect is enabled.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="payout_email">Payout email</Label>
          <Input id="payout_email" type="email" inputMode="email" autoComplete="email"
            className="text-foreground caret-foreground mt-1.5"
            value={profile?.payout_email ?? ""}
            onChange={(e) => setProfile({ ...(profile ?? {}), payout_email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" maxLength={2} placeholder="US"
            className="text-foreground caret-foreground mt-1.5 uppercase"
            value={profile?.country_code ?? ""}
            onChange={(e) => setProfile({ ...(profile ?? {}), country_code: e.target.value.toUpperCase() })} />
          <p className="text-xs text-muted-foreground mt-1">ISO 2-letter code (e.g. US, GB, DE).</p>
        </div>
      </div>

      {incomplete && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            Paid publishing stays open, but earnings can't be released until your payout email and country are saved.
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        By continuing, you confirm you're responsible for any local taxes on earnings.
        Full tax documentation will be requested before your first payout.
      </p>

      <StepNav onBack={onBack} onNext={onNext} saving={saving} nextLabel="Save & continue" />
    </Card>
  );
}

function StepPublish({
  books, value, onChange, onBack, onNext, saving,
  canPublishExternal, entitlementTier, entitlementLoading, editing,
  loadError, onRetryLoad,
}: {
  books: Book[]; value: DraftState["publish"];
  onChange: (v: DraftState["publish"]) => void;
  onBack: () => void; onNext: () => void; saving: boolean;
  canPublishExternal: boolean; entitlementTier: string; entitlementLoading: boolean;
  editing?: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const selected = books.find(b => b.id === value.book_id);

  if (loadError && books.length === 0) {
    return (
      <Card className="p-6 md:p-8 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" aria-hidden />
        <h2 className="text-2xl font-display font-semibold">We couldn't load your books</h2>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <p className="text-xs text-muted-foreground">
          This is usually a brief database hiccup. Your books are safe.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button size="lg" onClick={onRetryLoad}>Retry</Button>
          <Button asChild variant="outline" size="lg"><Link to="/library">Open library</Link></Button>
        </div>
        <Button variant="ghost" onClick={onBack} className="mt-2"><ArrowLeft className="h-4 w-4" />Back</Button>
      </Card>
    );
  }

  if (books.length === 0) {
    return (
      <Card className="p-6 md:p-8 text-center space-y-4">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden />
        <h2 className="text-2xl font-display font-semibold">Generate your first book</h2>
        <p className="text-sm text-muted-foreground">
          You'll need at least one book to start selling. It only takes a minute.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button asChild size="lg"><Link to="/generate"><Sparkles className="h-4 w-4" />Generate a book</Link></Button>
          <Button asChild variant="outline" size="lg"><Link to="/upload">Or upload one</Link></Button>
        </div>
        <Button variant="ghost" onClick={onBack} className="mt-2"><ArrowLeft className="h-4 w-4" />Back</Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 md:p-7 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-display font-semibold">
            {editing ? "Update your listing" : "Publish your first book"}
          </h2>
          {editing && (
            <Badge variant="secondary" className="gap-1"><Pencil className="h-3 w-3" />Editing</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {editing
            ? "Changes go live as soon as you save."
            : "Pick a book, add a price, and you're live."}
        </p>
      </div>

      <div>
        <Label htmlFor="book_select">Book</Label>
        <Select value={value.book_id} onValueChange={(v) => {
          const b = books.find(x => x.id === v);
          onChange({ ...value, book_id: v, slug: value.slug || slugify(b?.title ?? "") });
        }}>
          <SelectTrigger id="book_select" className="mt-1.5"><SelectValue placeholder="Choose a book" /></SelectTrigger>
          <SelectContent>
            {books.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <>
          <div>
            <Label htmlFor="blurb">Description</Label>
            <Textarea id="blurb" className="text-foreground caret-foreground mt-1.5 min-h-28"
              placeholder="A short, compelling pitch for readers."
              value={value.blurb} onChange={(e) => onChange({ ...value, blurb: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Price (USD)</Label>
              <Input id="price" inputMode="decimal" className="text-foreground caret-foreground mt-1.5"
                value={(value.price_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9.]/g, "")) || 0;
                  onChange({ ...value, price_cents: Math.round(n * 100) });
                }} />
              <p className="text-xs text-muted-foreground mt-1">Set $0.00 to give it away.</p>
            </div>
            <div>
              <Label htmlFor="samples">Free sample chapters</Label>
              <Input id="samples" inputMode="numeric" type="number" min={0} max={20}
                className="text-foreground caret-foreground mt-1.5"
                value={value.sample_chapters}
                onChange={(e) => onChange({ ...value, sample_chapters: Number(e.target.value) || 0 })} />
            </div>
          </div>

          <div>
            <Label htmlFor="slug2">Storefront URL</Label>
            <div className="flex items-center mt-1.5 rounded-md border bg-background overflow-hidden">
              <span className="text-xs text-muted-foreground pl-3 pr-1 whitespace-nowrap">/store/</span>
              <Input id="slug2" className="text-foreground caret-foreground border-0 focus-visible:ring-0"
                value={value.slug} inputMode="url"
                onChange={(e) => onChange({ ...value, slug: slugify(e.target.value) })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="visible" className="cursor-pointer">Make it public</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {value.is_public ? "Listed on the public storefront." : "Saved as a private draft."}
              </p>
            </div>
            <Switch id="visible" checked={value.is_public}
              onCheckedChange={(c) => onChange({ ...value, is_public: c })} />
          </div>

          {/* Advanced */}
          <div>
            <button type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAdvanced((s) => !s)}>
              {showAdvanced ? "Hide" : "More publishing options"}
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="cover">Custom cover URL</Label>
                  <Input id="cover" inputMode="url" className="text-foreground caret-foreground mt-1.5"
                    value={value.cover_override_url} placeholder="https://…"
                    onChange={(e) => onChange({ ...value, cover_override_url: e.target.value })} />
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-xs flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" aria-hidden />
                  <div className="space-y-1">
                    <p>Need SEO keywords, release schedules, external bundles, or Amazon KDP exports?</p>
                    <Link to={`/book/${value.book_id}/publish`} className="text-primary hover:underline inline-flex items-center gap-1">
                      Open full publishing settings <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Entitlement upsell */}
          {!entitlementLoading && !canPublishExternal && entitlementTier === "free" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lock className="h-4 w-4 text-primary" aria-hidden />
                Publish to Gumroad, Substack & more
              </div>
              <p className="text-xs text-muted-foreground">
                External publishing and release scheduling unlock on the Creator plan.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/pricing#creator">See Creator plans <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          )}
        </>
      )}

      <StepNav onBack={onBack} onNext={onNext} saving={saving} nextLabel={editing ? "Save changes" : "Publish"} disabled={!value.book_id} />
    </Card>
  );
}

function StepLaunch({
  slug, bookId, listingId, canPublishExternal, onReset,
}: {
  slug: string;
  bookId: string;
  listingId: string;
  canPublishExternal: boolean;
  onReset: () => void;
}) {
  const storefrontUrl = `${window.location.origin}/store/${slug}`;
  const [busy, setBusy] = useState<"" | "gumroad" | "shopify">("");
  const [stage, setStage] = useState<string>("");

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(storefrontUrl); toast.success("Link copied"); }
    catch { toast.error("Could not copy"); }
  };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Check out my book on ScrollLibrary", url: storefrontUrl }); }
      catch { /* user cancelled */ }
    } else { void copyLink(); }
  };

  // One-click flow shared by Gumroad / Shopify CTAs.
  // Mirrors BookPublishSettings.publishExternal so creators who haven't
  // discovered the Publishing Command Center can still launch in one tap.
  async function oneClick(platform: "gumroad" | "shopify") {
    if (!listingId) { toast.error("Listing not ready yet"); return; }
    setBusy(platform);
    setStage("Auditing export quality…");
    try {
      let res = await publishExternallyOneClick(listingId, bookId, platform);
      if (res.status === "bundling" && res.job_id) {
        setStage("Building bundle (PDF, EPUB, front matter)…");
        const final = await waitForBundle(res.job_id);
        if (final.status !== "completed") throw new Error(final.error_message || "Bundle failed to build");
        setStage("Creating upstream product…");
        res = await publishExternallyOneClick(listingId, bookId, platform);
      }
      if (res.status === "published" && res.publish) {
        toast.success(res.message ?? `Published to ${platform}`);
        const editUrl = res.publish.edit_url;
        if (editUrl) window.open(editUrl, "_blank", "noopener");
      } else if (res.status === "not_connected") {
        toast.error(res.message ?? `Connect ${platform} first`);
      } else if (res.status === "blocked") {
        toast.error(res.message ?? "Export quality blocked");
      } else if (res.status === "unsafe") {
        toast.error(res.message ?? `${platform} safety check failed`, { duration: 8000 });
      } else {
        toast.error(res.message ?? `${platform} publish failed`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? `${platform} publish failed`);
    } finally {
      setBusy(""); setStage("");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-6 md:p-8 text-center bg-gradient-to-br from-primary/10 via-background to-background border-primary/30">
        <PartyPopper className="h-12 w-12 mx-auto text-primary" aria-hidden />
        <h2 className="text-3xl font-display font-semibold mt-3">You're live.</h2>
        <p className="text-muted-foreground mt-2">
          Your book is now on the ScrollLibrary storefront. Share it to get your first readers.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-lg border bg-card p-2">
          <code className="flex-1 text-xs sm:text-sm text-left truncate px-2 text-muted-foreground">{storefrontUrl}</code>
          <Button size="sm" variant="ghost" onClick={copyLink} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <Button asChild size="lg" className="min-h-12"><a href={storefrontUrl} target="_blank" rel="noreferrer">View storefront <ExternalLink className="h-4 w-4" /></a></Button>
          <Button size="lg" variant="outline" className="min-h-12" onClick={share}><Share2 className="h-4 w-4" />Share</Button>
        </div>
      </Card>

      {/* One-click external selling */}
      <Card className="p-5 md:p-6">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="font-semibold">Sell on Gumroad or Shopify too</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          We prepare a print-ready bundle (PDF + EPUB + cover + license + listing copy) and create the product upstream — one tap.
        </p>
        {!canPublishExternal ? (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <span><Lock className="h-3.5 w-3.5 inline mr-1.5" aria-hidden />External publishing requires the Creator plan.</span>
            <Button asChild size="sm" variant="default"><Link to="/pricing#creator">Upgrade</Link></Button>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={!!busy || !listingId}
                onClick={() => oneClick("gumroad")}
                className="min-h-11"
              >
                <Store className="h-4 w-4 mr-2" aria-hidden />
                {busy === "gumroad" ? "Publishing…" : "Publish to Gumroad"}
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy || !listingId}
                onClick={() => oneClick("shopify")}
                className="min-h-11"
              >
                <ShoppingBag className="h-4 w-4 mr-2" aria-hidden />
                {busy === "shopify" ? "Publishing…" : "Publish to Shopify"}
              </Button>
            </div>
            {stage && (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2" aria-live="polite">
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden />
                {stage}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Connect Gumroad / Shopify first in{" "}
              <Link to="/account/intelligence" className="text-primary hover:underline">Publishing Intelligence</Link>.
            </p>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Next</div>
          <div className="font-medium mt-1">Earnings dashboard</div>
          <p className="text-xs text-muted-foreground mt-1">Track sales, payouts and ledger entries.</p>
          <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/account/earnings">View earnings</Link></Button>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">More</div>
          <div className="font-medium mt-1">Bundles & schedules</div>
          <p className="text-xs text-muted-foreground mt-1">Substack, Patreon, KDP, release schedules.</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to={`/book/${bookId}/publish`}>Open publishing center</Link>
          </Button>
        </Card>
      </div>

      <div className="text-center">
        <Button variant="ghost" onClick={onReset}>Publish another book</Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

function StepNav({
  onBack, onNext, saving, nextLabel, disabled,
}: { onBack: () => void; onNext: () => void; saving: boolean; nextLabel: string; disabled?: boolean; }) {
  return (
    <>
      <Separator />
      {/* Sticky bottom CTA for mobile, inline for desktop */}
      <div className="hidden sm:flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />Back</Button>
        <Button onClick={onNext} isPending={saving} pendingText="Saving…" disabled={disabled}>
          {nextLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="sm:hidden fixed left-0 right-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" onClick={onBack} className="min-h-11"><ArrowLeft className="h-4 w-4" />Back</Button>
          <Button onClick={onNext} isPending={saving} pendingText="Saving…" disabled={disabled} className="flex-1 min-h-11">
            {nextLabel} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function EducationCards({ tier }: { tier: string }) {
  const items = [
    { icon: DollarSign, title: "How creators earn", body: "Set any price. We process payments and credit your ledger after the platform fee." },
    { icon: ShieldCheck, title: "Platform fee", body: "ScrollLibrary keeps 10% of each sale on Free, less on Creator plans. No hidden costs." },
    { icon: Globe, title: "Why external publishing matters", body: "Bundle once, publish to Gumroad, Substack, KDP and more — without retyping metadata." },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map(({ icon: Icon, title, body }) => (
        <Card key={title} className="p-4">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          <div className="font-medium text-sm mt-2">{title}</div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
        </Card>
      ))}
      {tier === "free" && (
        <Card className="p-4 sm:col-span-3 border-primary/30 bg-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div>
              <div className="font-medium text-sm">Upgrade to Creator</div>
              <p className="text-xs text-muted-foreground mt-1">Lower fees, external publishing, release scheduling, priority generation.</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link to="/pricing#creator">See plans</Link></Button>
          </div>
        </Card>
      )}
    </div>
  );
}
