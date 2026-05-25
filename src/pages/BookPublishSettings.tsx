import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { Sparkles, Package, BookOpen, Heart, Store, ShoppingBag, FileText, ExternalLink, CheckCircle2, Zap } from "lucide-react";
import { ReleaseScheduleSection } from "@/components/publish/ReleaseScheduleSection";
import { publishToGumroad, publishToShopify } from "@/lib/platformConnections";
import { useCreatorEntitlements } from "@/hooks/useCreatorEntitlements";
import { Lock } from "lucide-react";

type BundleKind = "kdp" | "gumroad" | "substack" | "patreon" | "etsy";

const BUNDLE_BUTTONS: Array<{ kind: BundleKind; label: string; icon: any; variant?: "default" | "outline" | "secondary" }> = [
  { kind: "kdp",      label: "Amazon KDP",   icon: Package,  variant: "default"  },
  { kind: "gumroad",  label: "Gumroad",      icon: Store,    variant: "outline"  },
  { kind: "substack", label: "Substack",     icon: BookOpen, variant: "outline"  },
  { kind: "patreon",  label: "Patreon",      icon: Heart,    variant: "outline"  },
  { kind: "etsy",     label: "Etsy",         icon: FileText, variant: "outline"  },
];

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

const LICENSE_OPTIONS = [
  { value: "personal", label: "Personal use" },
  { value: "commercial", label: "Commercial" },
  { value: "educational", label: "Educational" },
  { value: "institutional", label: "Institutional" },
  { value: "resale", label: "Resale rights" },
];

export default function BookPublishSettings() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [bundling, setBundling] = useState<"" | BundleKind>("");
  const [publishingGumroad, setPublishingGumroad] = useState(false);
  const { entitlements } = useCreatorEntitlements();
  const canPublishExternal = entitlements.can_publish_external;
  const [publishingShopify, setPublishingShopify] = useState(false);
  const [pubs, setPubs] = useState<any[]>([]);
  const [newPub, setNewPub] = useState<{ platform: BundleKind | "other"; url: string }>({ platform: "kdp", url: "" });

  const [form, setForm] = useState({
    listing_id: "",
    is_public: false,
    slug: "",
    price_cents: 0,
    sample_chapters: 1,
    blurb: "",
    subtitle: "",
    amazon_description: "",
    seo_keywords: "",
    seo_categories: "",
    backend_keywords: "",
    license_type: "personal",
    series_id: "",
    series_order: "",
    cover_override_url: "",
  });

  useEffect(() => {
    if (!bookId) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      const { data: b } = await supabase.from("books").select("id, title, user_id, cover_image_url").eq("id", bookId).maybeSingle();
      if (!b || b.user_id !== user.id) { toast.error("Not your book"); navigate("/dashboard"); return; }
      setBook(b);
      const { data: l } = await supabase.from("public_listings").select("*").eq("book_id", bookId).maybeSingle();
      if (l) setForm({
        listing_id: l.id, is_public: l.is_public, slug: l.slug, price_cents: l.price_cents,
        sample_chapters: l.sample_chapters, blurb: l.blurb ?? "", subtitle: l.subtitle ?? "",
        amazon_description: l.amazon_description ?? "",
        seo_keywords: (l.seo_keywords ?? []).join(", "),
        seo_categories: (l.seo_categories ?? []).join(", "),
        backend_keywords: (l.backend_keywords ?? []).join(", "),
        license_type: l.license_type, series_id: l.series_id ?? "",
        series_order: l.series_order?.toString() ?? "", cover_override_url: l.cover_override_url ?? "",
      });
      else setForm((f) => ({ ...f, slug: slugify(b.title) }));
      const { data: s } = await supabase.from("book_series").select("id, title").eq("user_id", user.id);
      setSeries(s ?? []);
      const { data: ep } = await supabase.from("external_publications")
        .select("id, platform, external_url, status, published_at")
        .eq("book_id", bookId).order("published_at", { ascending: false });
      setPubs(ep ?? []);
      setLoading(false);
    })();
  }, [bookId, navigate]);

  async function recordPublication() {
    if (!bookId || !newPub.url.trim()) { toast.error("URL required"); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("external_publications").insert({
        user_id: user.id, book_id: bookId,
        platform: newPub.platform, external_url: newPub.url.trim(), status: "live",
      }).select("*").single();
      if (error) throw error;
      setPubs((p) => [data, ...p]);
      setNewPub({ platform: "kdp", url: "" });
      toast.success("Publication recorded");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record");
    }
  }

  async function save() {
    if (!bookId) return;
    setSaving(true);
    try {
      const payload: any = {
        book_id: bookId,
        slug: form.slug || slugify(book.title),
        is_public: form.is_public,
        price_cents: Number(form.price_cents) || 0,
        sample_chapters: Math.max(0, Number(form.sample_chapters) || 1),
        blurb: form.blurb || null,
        subtitle: form.subtitle || null,
        amazon_description: form.amazon_description || null,
        seo_keywords: form.seo_keywords.split(",").map((s) => s.trim()).filter(Boolean),
        seo_categories: form.seo_categories.split(",").map((s) => s.trim()).filter(Boolean),
        backend_keywords: form.backend_keywords.split(",").map((s) => s.trim()).filter(Boolean),
        license_type: form.license_type,
        series_id: form.series_id || null,
        series_order: form.series_order ? Number(form.series_order) : null,
        cover_override_url: form.cover_override_url || null,
      };
      const { data, error } = form.listing_id
        ? await supabase.from("public_listings").update(payload).eq("id", form.listing_id).select("id, is_public").single()
        : await supabase.from("public_listings").insert(payload).select("id, is_public").single();
      if (error) throw error;
      if (data) {
        setForm((f) => ({ ...f, listing_id: data.id }));
        trackStorefrontEvent(data.id, data.is_public ? "listing_publish" : "listing_unpublish");
      }
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally { setSaving(false); }
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-publishing-metadata", { body: { book_id: bookId } });
      if (error) throw error;
      const s = (data as any)?.suggestion;
      if (!s) throw new Error("Empty suggestion");
      setForm((f) => ({
        ...f,
        subtitle: s.subtitle ?? f.subtitle,
        amazon_description: s.amazon_description ?? f.amazon_description,
        seo_keywords: (s.keywords ?? []).join(", "),
        seo_categories: (s.categories ?? []).join(", "),
        backend_keywords: (s.backend_keywords ?? []).join(", "),
      }));
      toast.success("AI suggestions applied — review and save");
    } catch (e: any) {
      toast.error(e.message ?? "AI suggestion failed");
    } finally { setSuggesting(false); }
  }

  async function enqueue(kind: BundleKind) {
    setBundling(kind);
    try {
      const { data, error } = await supabase.functions.invoke("enqueue-export-bundle", {
        body: { book_id: bookId, bundle_type: kind, listing_id: form.listing_id || undefined, options: {} },
      });
      if (error) throw error;
      toast.success(`Bundle queued (job ${(data as any).job_id.slice(0, 8)}…)`);
      navigate("/account/exports");
    } catch (e: any) {
      toast.error(e.message ?? "Could not queue bundle");
    } finally { setBundling(""); }
  }
  async function refreshPubs() {
    const { data: ep } = await supabase.from("external_publications")
      .select("id, platform, external_url, status, published_at")
      .eq("book_id", bookId!).order("published_at", { ascending: false });
    setPubs(ep ?? []);
  }
  async function publishGumroadDirect() {
    if (!form.listing_id) { toast.error("Save the listing first"); return; }
    setPublishingGumroad(true);
    try {
      const r = await publishToGumroad(form.listing_id);
      if (r.idempotent) toast.info("Already published to Gumroad");
      else toast.success("Published to Gumroad");
      await refreshPubs();
      if (r.edit_url) window.open(r.edit_url, "_blank", "noopener");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("not_connected")) toast.error("Connect Gumroad first (Publishing Intelligence → Connect)");
      else if (m.includes("expired")) toast.error("Gumroad connection expired — reconnect");
      else toast.error(m || "Gumroad publish failed");
    } finally { setPublishingGumroad(false); }
  }
  async function publishShopifyDirect() {
    if (!form.listing_id) { toast.error("Save the listing first"); return; }
    setPublishingShopify(true);
    try {
      const r = await publishToShopify(form.listing_id);
      if (r.idempotent) toast.info("Already published to Shopify");
      else toast.success("Published to Shopify");
      await refreshPubs();
      if (r.edit_url) window.open(r.edit_url, "_blank", "noopener");
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("not_connected")) toast.error("Connect Shopify first (Publishing Intelligence → Connect)");
      else if (m.includes("expired") || m.includes("revoked")) toast.error("Shopify connection expired — reconnect");
      else if (m.includes("shop_missing")) toast.error("Shopify shop domain missing — reconnect");
      else toast.error(m || "Shopify publish failed");
    } finally { setPublishingShopify(false); }
  }


  // Publishing wizard checklist
  const checklist = [
    { ok: !!(form.subtitle || "").trim(), label: "Subtitle" },
    { ok: !!(form.amazon_description || "").trim(), label: "Description (150+ chars)" },
    { ok: (form.seo_keywords.split(",").filter((s) => s.trim()).length) >= 5, label: "5+ keywords" },
    { ok: !!(book?.cover_image_url || form.cover_override_url), label: "Cover image" },
    { ok: (form.blurb || "").trim().length >= 20, label: "Storefront blurb" },
  ];
  const readyCount = checklist.filter((c) => c.ok).length;

  if (loading) return <div className="container mx-auto max-w-3xl p-8">Loading…</div>;

  return (
    <div className="min-h-dvh bg-background">
      <SEO title={`Publish — ${book?.title}`} description="Manage storefront listing." noindex />
      <div className="container mx-auto max-w-3xl px-4 py-6 sm:py-10 pb-32">
        <Link to={`/book/${bookId}`} className="inline-flex items-center min-h-11 text-sm text-primary hover:underline">
          ← Back to book
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold mt-2 break-words">Publish: {book?.title}</h1>

        <Card className="mt-6 p-4 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-base">Public on storefront</Label>
              <p className="text-sm text-muted-foreground mt-0.5 break-all">
                Make this book visible at /store/{form.slug}
              </p>
            </div>
            <Switch checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} aria-label="Make public on storefront" />
          </div>

          <div>
            <Label htmlFor="pub-slug">Slug</Label>
            <Input id="pub-slug" className="text-foreground caret-foreground" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pub-price">Price (USD)</Label>
              <Input id="pub-price" type="number" inputMode="decimal" min={0} className="text-foreground caret-foreground"
                value={(form.price_cents / 100).toString()}
                onChange={(e) => setForm({ ...form, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })} />
            </div>
            <div>
              <Label htmlFor="pub-samples">Sample chapters</Label>
              <Input id="pub-samples" type="number" inputMode="numeric" min={0} className="text-foreground caret-foreground"
                value={form.sample_chapters}
                onChange={(e) => setForm({ ...form, sample_chapters: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label>Storefront blurb</Label>
            <Textarea className="text-foreground caret-foreground" value={form.blurb}
              onChange={(e) => setForm({ ...form, blurb: e.target.value })} placeholder="One-sentence pitch shown on the card." />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-base">Publishing metadata</Label>
            <Button variant="outline" size="sm" onClick={suggest} disabled={suggesting}>
              <Sparkles className="w-4 h-4 mr-2" />{suggesting ? "Generating…" : "AI suggest"}
            </Button>
          </div>

          <div>
            <Label>Subtitle</Label>
            <Input className="text-foreground caret-foreground" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </div>
          <div>
            <Label>Amazon description</Label>
            <Textarea className="text-foreground caret-foreground min-h-32" value={form.amazon_description}
              onChange={(e) => setForm({ ...form, amazon_description: e.target.value })} />
          </div>
          <div>
            <Label>SEO / Amazon keywords (comma-separated, max 7)</Label>
            <Input className="text-foreground caret-foreground" value={form.seo_keywords} onChange={(e) => setForm({ ...form, seo_keywords: e.target.value })} />
          </div>
          <div>
            <Label>Categories (comma-separated, max 2)</Label>
            <Input className="text-foreground caret-foreground" value={form.seo_categories} onChange={(e) => setForm({ ...form, seo_categories: e.target.value })} />
          </div>
          <div>
            <Label>Backend keywords (Amazon-only, comma-separated)</Label>
            <Input className="text-foreground caret-foreground" value={form.backend_keywords} onChange={(e) => setForm({ ...form, backend_keywords: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>License</Label>
              <Select value={form.license_type} onValueChange={(v) => setForm({ ...form, license_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LICENSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Series (optional)</Label>
              <Select value={form.series_id || "none"} onValueChange={(v) => setForm({ ...form, series_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No series" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No series</SelectItem>
                  {series.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.series_id && (
            <div>
              <Label>Series order</Label>
              <Input type="number" inputMode="numeric" min={1} className="text-foreground caret-foreground" value={form.series_order} onChange={(e) => setForm({ ...form, series_order: e.target.value })} />
            </div>
          )}

          <div>
            <Label>Cover override URL (optional)</Label>
            <Input className="text-foreground caret-foreground" value={form.cover_override_url} onChange={(e) => setForm({ ...form, cover_override_url: e.target.value })} />
          </div>

          <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save listing"}</Button>
        </Card>

        {/* Publishing Wizard checklist */}
        <Card className="mt-6 p-4 sm:p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Publishing readiness
            <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
              {readyCount}/{checklist.length}
            </span>
          </h2>
          <div
            className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={readyCount}
            aria-valuemin={0}
            aria-valuemax={checklist.length}
            aria-label="Publishing readiness"
          >
            <div
              className="h-full bg-primary transition-[width] duration-500"
              style={{ width: `${(readyCount / checklist.length) * 100}%` }}
            />
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${c.ok ? "text-primary" : "text-muted-foreground/40"}`} aria-hidden="true" />
                <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Bundles */}
        <Card className="mt-6 p-4 sm:p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="w-5 h-5" /> Publish bundles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a ZIP bundle ready to upload elsewhere. Heavy jobs run in the background — track progress in{" "}
            <Link to="/account/exports" className="text-primary hover:underline">Exports</Link>. KDP is never auto-published.
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BUNDLE_BUTTONS.map(({ kind, label, icon: Icon, variant }) => {
              const isExternal = kind !== "kdp";
              const locked = isExternal && !canPublishExternal;
              return (
                <Button
                  key={kind}
                  variant={variant}
                  onClick={() => locked ? navigate("/pricing#creator") : enqueue(kind)}
                  disabled={!!bundling}
                  className="justify-start min-h-11"
                  title={locked ? "Creator tier required" : undefined}
                  aria-label={locked ? `${label} — Creator tier required` : `Queue ${label} bundle`}
                >
                  {locked ? <Lock className="w-4 h-4 mr-2 shrink-0" aria-hidden="true" /> : <Icon className="w-4 h-4 mr-2 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{bundling === kind ? "Queuing…" : locked ? `${label} (Pro)` : label}</span>
                </Button>
              );
            })}
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-sm font-medium flex items-center gap-2"><Zap className="w-4 h-4" aria-hidden="true" /> Direct publishing</p>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-create the product on a connected platform. Connect accounts in{" "}
              <Link to="/account/intelligence" className="text-primary hover:underline">Publishing Intelligence</Link>.
            </p>
            {!canPublishExternal && (
              <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground">
                  <Lock className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true" />
                  External publishing requires <strong>Creator</strong> (€19/mo) or higher.
                </span>
                <Button size="sm" variant="default" onClick={() => navigate("/pricing#creator")}>
                  Upgrade
                </Button>
              </div>
            )}
            {!form.listing_id && canPublishExternal && (
              <p className="mt-3 text-xs text-muted-foreground">
                Save the listing first to enable direct publishing.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={publishingGumroad || !form.listing_id || !canPublishExternal}
                onClick={publishGumroadDirect}
                className="min-h-11"
              >
                <Store className="w-4 h-4 mr-2" aria-hidden="true" />
                {publishingGumroad ? "Publishing…" : "Publish to Gumroad"}
              </Button>
              <Button
                variant="secondary"
                disabled={publishingShopify || !form.listing_id || !canPublishExternal}
                onClick={publishShopifyDirect}
                className="min-h-11"
              >
                <ShoppingBag className="w-4 h-4 mr-2" aria-hidden="true" />
                {publishingShopify ? "Publishing…" : "Publish to Shopify"}
              </Button>
            </div>
          </div>
        </Card>


        {/* External publications ledger */}
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ExternalLink className="w-5 h-5" /> External publications
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Record where you've uploaded this book. Builds your distribution history.
          </p>

          {pubs.length > 0 && (
            <ul className="mt-4 space-y-2">
              {pubs.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium capitalize">{p.platform}</div>
                    {p.external_url && (
                      <a href={p.external_url} target="_blank" rel="noreferrer noopener"
                         className="text-xs text-primary hover:underline truncate block">
                        {p.external_url}
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground capitalize shrink-0">{p.status}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-[140px_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Platform</Label>
              <Select value={newPub.platform} onValueChange={(v) => setNewPub({ ...newPub, platform: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kdp">Amazon KDP</SelectItem>
                  <SelectItem value="gumroad">Gumroad</SelectItem>
                  <SelectItem value="substack">Substack</SelectItem>
                  <SelectItem value="patreon">Patreon</SelectItem>
                  <SelectItem value="etsy">Etsy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                className="text-foreground caret-foreground"
                placeholder="https://…"
                value={newPub.url}
                onChange={(e) => setNewPub({ ...newPub, url: e.target.value })}
              />
            </div>
            <Button onClick={recordPublication} disabled={!newPub.url.trim()}>Record</Button>
          </div>
        </Card>

        {/* Serialized publishing */}
        {bookId && book?.user_id && (
          <div className="mt-6">
            <ReleaseScheduleSection bookId={bookId} ownerUserId={book.user_id} />
          </div>
        )}

      </div>
    </div>
  );
}
