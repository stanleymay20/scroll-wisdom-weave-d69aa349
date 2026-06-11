/**
 * CreatorAssets — M3 of the Author Revenue OS.
 * Creator UI for digital products (workbooks, templates, prompt packs, guides, etc.).
 * Route: /creator/assets
 *
 * Reuses the existing creator_assets/creator_asset_files schema and
 * the universal commerce stack. No parallel checkout/payout/listing systems.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Trash2, ExternalLink, FileText, Loader2, Pencil } from "lucide-react";

// Non-book digital-product types the UI lets creators create directly.
// (Books continue to flow through the existing publishing pipeline.)
const DIGITAL_TYPES = [
  { value: "workbook",      label: "Workbook" },
  { value: "template",      label: "Template" },
  { value: "prompt_pack",   label: "Prompt pack" },
  { value: "research_pack", label: "Research pack" },
  { value: "checklist",     label: "Checklist" },
  { value: "guide",         label: "Guide" },
  { value: "audiobook",     label: "Audiobook" },
] as const;

const FUNNEL_ROLES = [
  { value: "lead_magnet", label: "Lead magnet" },
  { value: "core",        label: "Core offer" },
  { value: "upsell",      label: "Upsell" },
  { value: "backend",     label: "Backend offer" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", review: "In review", live: "Live", paused: "Paused", archived: "Archived",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", review: "secondary", live: "default", paused: "secondary", archived: "outline",
};

interface AssetRow {
  id: string;
  creator_user_id: string;
  asset_type: string;
  source_book_id: string | null;
  title: string;
  slug: string | null;
  summary: string | null;
  cover_url: string | null;
  category: string | null;
  price_cents: number;
  currency: string;
  pricing_model: string;
  status: string;
  display_order: number;
  funnel_role: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AssetFileRow {
  id: string;
  asset_id: string;
  file_name: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  display_order: number;
  created_at: string;
}

const fmtMoney = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format((cents ?? 0) / 100);

const fmtBytes = (b: number | null) => {
  if (!b || b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CreatorAssets() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [tab, setTab] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);

  const load = async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("creator_assets")
      .select("*")
      .eq("creator_user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load products", description: error.message, variant: "destructive" });
    } else {
      setAssets((data ?? []) as AssetRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) await load(uid);
      else setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const nonBook = assets.filter((a) => a.asset_type !== "book");
    if (tab === "all") return nonBook;
    if (tab === "live") return nonBook.filter((a) => a.status === "live");
    if (tab === "drafts") return nonBook.filter((a) => a.status === "draft" || a.status === "review");
    if (tab === "paused") return nonBook.filter((a) => a.status === "paused" || a.status === "archived");
    return nonBook;
  }, [assets, tab]);

  const refresh = () => { if (userId) load(userId); };

  if (!loading && !userId) {
    return (
      <ResponsiveShell>
        <div className="container mx-auto max-w-3xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Sign in to manage your products</h1>
          <Link to="/auth"><Button>Sign in</Button></Link>
        </div>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell>
      <SEO
        title="Digital products — Creator"
        description="Create and manage your digital products: workbooks, templates, prompt packs, guides, and more."
        canonical="/creator/assets"
      />
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Digital products</h1>
            <p className="text-muted-foreground mt-1">
              Workbooks, templates, prompt packs and more — sold through your existing storefront and checkout.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New product
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mb-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="paused">Paused / archived</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState onCreate={() => setCreateOpen(true)} />
            ) : (
              <div className="grid gap-3">
                {filtered.map((a) => (
                  <AssetCard key={a.id} asset={a} onEdit={() => setEditing(a)} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateAssetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={userId!}
        onCreated={(row) => { setCreateOpen(false); setAssets((p) => [row, ...p]); setEditing(row); }}
      />
      <EditAssetSheet
        asset={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onChanged={refresh}
      />
    </ResponsiveShell>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold">No digital products yet</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-md mx-auto">
          Package your expertise into a workbook, template or prompt pack. It sells through the same checkout
          and payout system as your books.
        </p>
        <Button className="mt-4" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> Create your first product
        </Button>
      </CardContent>
    </Card>
  );
}

function AssetCard({ asset, onEdit }: { asset: AssetRow; onEdit: () => void }) {
  const typeLabel = DIGITAL_TYPES.find((t) => t.value === asset.asset_type)?.label ?? asset.asset_type;
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {asset.cover_url
            ? <img src={asset.cover_url} alt={asset.title} className="w-full h-full object-cover" />
            : <FileText className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{asset.title}</h3>
            <Badge variant={STATUS_VARIANT[asset.status] ?? "outline"}>{STATUS_LABEL[asset.status] ?? asset.status}</Badge>
            <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
            {asset.funnel_role && (
              <Badge variant="outline" className="text-xs capitalize">
                {asset.funnel_role.replace("_", " ")}
              </Badge>
            )}
          </div>
          {asset.summary && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{asset.summary}</p>
          )}
          <p className="text-sm mt-1">
            <span className="font-medium">{fmtMoney(asset.price_cents, asset.currency)}</span>
            <span className="text-muted-foreground"> · {asset.pricing_model.replace("_", " ")}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </Button>
      </CardContent>
    </Card>
  );
}

function CreateAssetDialog({
  open, onOpenChange, userId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onCreated: (row: AssetRow) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [assetType, setAssetType] = useState<string>("workbook");
  const [priceUsd, setPriceUsd] = useState("9");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setTitle(""); setAssetType("workbook"); setPriceUsd("9"); setSummary(""); }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const priceCents = Math.max(0, Math.round(parseFloat(priceUsd || "0") * 100));
    setSaving(true);
    const { data, error } = await supabase
      .from("creator_assets")
      .insert({
        creator_user_id: userId,
        asset_type: assetType,
        title: title.trim(),
        summary: summary.trim() || null,
        price_cents: priceCents,
        currency: "usd",
        pricing_model: "one_time",
        status: "draft",
      } as any)
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) {
      toast({ title: "Could not create product", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product created", description: "Add files and publish when ready." });
    onCreated(data as AssetRow);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New digital product</DialogTitle>
          <DialogDescription>
            Start as a draft. You'll add files, cover and pricing details next.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Founder Workbook" autoFocus
              className="text-foreground caret-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIGITAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (USD)</Label>
              <Input id="price" type="number" step="0.01" min="0" value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                className="text-foreground caret-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Short description</Label>
            <Textarea id="summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two sentences about what this product helps with."
              className="text-foreground caret-foreground" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAssetSheet({
  asset, onOpenChange, onChanged,
}: {
  asset: AssetRow | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<AssetRow | null>(null);
  const [files, setFiles] = useState<AssetFileRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(asset);
    if (asset) {
      (async () => {
        const { data } = await supabase
          .from("creator_asset_files")
          .select("*")
          .eq("asset_id", asset.id)
          .order("display_order", { ascending: true });
        setFiles((data ?? []) as AssetFileRow[]);
      })();
    } else {
      setFiles([]);
    }
  }, [asset]);

  if (!asset || !form) return <Sheet open={false} onOpenChange={onOpenChange}><SheetContent /></Sheet>;

  const setField = <K extends keyof AssetRow>(k: K, v: AssetRow[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    setSaving(true);
    const priceCents = Math.max(0, Math.round(Number(form.price_cents) || 0));
    const { error } = await supabase
      .from("creator_assets")
      .update({
        title: form.title.trim(),
        summary: form.summary?.trim() || null,
        cover_url: form.cover_url?.trim() || null,
        category: form.category?.trim() || null,
        price_cents: priceCents,
        currency: form.currency || "usd",
        pricing_model: form.pricing_model,
        funnel_role: form.funnel_role || null,
        status: form.status,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    onChanged();
  };

  const uploadFile = async (file: File) => {
    if (!form) return;
    setUploading(true);
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${form.creator_user_id}/${form.id}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage.from("creator-assets").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || undefined,
    });
    if (upErr) {
      setUploading(false);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("creator_asset_files")
      .insert({
        asset_id: form.id,
        creator_user_id: form.creator_user_id,
        file_name: file.name,
        storage_bucket: "creator-assets",
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        display_order: files.length,
      } as any)
      .select("*")
      .single();
    setUploading(false);
    if (error || !data) {
      toast({ title: "Could not record file", description: error?.message, variant: "destructive" });
      return;
    }
    setFiles((p) => [...p, data as AssetFileRow]);
    toast({ title: "File uploaded" });
  };

  const removeFile = async (f: AssetFileRow) => {
    if (f.storage_path) {
      await supabase.storage.from(f.storage_bucket || "creator-assets").remove([f.storage_path]);
    }
    const { error } = await supabase.from("creator_asset_files").delete().eq("id", f.id);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    setFiles((p) => p.filter((x) => x.id !== f.id));
  };

  const publish = async () => {
    setField("status", "live");
    const { error } = await supabase
      .from("creator_assets")
      .update({ status: "live" })
      .eq("id", form.id);
    if (error) {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product is live" });
    onChanged();
  };

  const priceUsd = (form.price_cents / 100).toFixed(2);

  return (
    <Sheet open={!!asset} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit product</SheetTitle>
          <SheetDescription>Update details, upload deliverables, and control publishing.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)}
              className="text-foreground caret-foreground" />
          </div>
          <div className="space-y-2">
            <Label>Short description</Label>
            <Textarea rows={3} value={form.summary ?? ""}
              onChange={(e) => setField("summary", e.target.value)}
              className="text-foreground caret-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Price (USD)</Label>
              <Input type="number" step="0.01" min="0" value={priceUsd}
                onChange={(e) => setField("price_cents", Math.round(parseFloat(e.target.value || "0") * 100))}
                className="text-foreground caret-foreground" />
            </div>
            <div className="space-y-2">
              <Label>Pricing model</Label>
              <Select value={form.pricing_model} onValueChange={(v) => setField("pricing_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Funnel role</Label>
              <Select
                value={form.funnel_role ?? "none"}
                onValueChange={(v) => setField("funnel_role", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {FUNNEL_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cover image URL (optional)</Label>
            <Input value={form.cover_url ?? ""} onChange={(e) => setField("cover_url", e.target.value)}
              placeholder="https://…"
              className="text-foreground caret-foreground" />
          </div>

          <div className="border-t pt-5">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base">Deliverable files</Label>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files yet. Buyers will receive whatever you upload here.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 p-2 border rounded-md">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.mime_type || "file"} · {fmtBytes(f.size_bytes)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeFile(f)} aria-label="Remove file">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-8 pb-6">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save changes
          </Button>
          {form.status !== "live" && (
            <Button variant="secondary" onClick={publish}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Publish
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
