import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Database, Download, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DistributionProductForm = "paperback" | "hardcover" | "epub";

type MetadataRecord = {
  publication_date: string | null;
  warengruppe_code: string | null;
  product_availability: string | null;
  publishing_status: string | null;
  price_type: string | null;
  price_cents: number | null;
  currency: string | null;
  price_country: string | null;
  tax_rate_code: string | null;
  tax_rate_percent: number | string | null;
  unpriced_item_type: string | null;
  thema_codes: string[] | null;
  keywords: string[] | null;
  updated_at?: string | null;
};

type MetadataResponse = {
  bookId: string;
  productForm: DistributionProductForm;
  canonicalLanguage: string;
  canonicalEditionLabel: string;
  isbnAssigned: boolean;
  published?: boolean;
  metadata: MetadataRecord | null;
};

type FormState = {
  publicationDate: string;
  warengruppeCode: string;
  productAvailability: string;
  publishingStatus: string;
  priceType: string;
  price: string;
  currency: string;
  priceCountry: string;
  taxRateCode: string;
  taxRatePercent: string;
  unpricedItemType: string;
  themaCodes: string;
  keywords: string;
};

const EMPTY_FORM: FormState = {
  publicationDate: "",
  warengruppeCode: "",
  productAvailability: "",
  publishingStatus: "",
  priceType: "",
  price: "",
  currency: "EUR",
  priceCountry: "DE",
  taxRateCode: "",
  taxRatePercent: "",
  unpricedItemType: "",
  themaCodes: "",
  keywords: "",
};

function joinList(values: string[] | null | undefined): string {
  return (values ?? []).join(", ");
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function recordToForm(record: MetadataRecord | null): FormState {
  if (!record) return { ...EMPTY_FORM };
  return {
    publicationDate: record.publication_date ?? "",
    warengruppeCode: record.warengruppe_code ?? "",
    productAvailability: record.product_availability ?? "",
    publishingStatus: record.publishing_status ?? "",
    priceType: record.price_type ?? "",
    price: record.price_cents == null ? "" : (record.price_cents / 100).toFixed(2),
    currency: record.currency ?? "EUR",
    priceCountry: record.price_country ?? "DE",
    taxRateCode: record.tax_rate_code ?? "",
    taxRatePercent: record.tax_rate_percent == null ? "" : String(record.tax_rate_percent),
    unpricedItemType: record.unpriced_item_type ?? "",
    themaCodes: joinList(record.thema_codes),
    keywords: joinList(record.keywords),
  };
}

export function DistributionMetadataPanel({ bookId }: { bookId: string }) {
  const [productForm, setProductForm] = useState<DistributionProductForm>("paperback");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [canonicalLanguage, setCanonicalLanguage] = useState<string>("");
  const [canonicalEditionLabel, setCanonicalEditionLabel] = useState<string>("");
  const [isbnAssigned, setIsbnAssigned] = useState(false);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("distribution-metadata", {
        body: { action: "get", bookId, productForm },
      });
      if (error) throw error;
      const result = data as MetadataResponse;
      setCanonicalLanguage(result.canonicalLanguage ?? "");
      setCanonicalEditionLabel(result.canonicalEditionLabel ?? "");
      setIsbnAssigned(!!result.isbnAssigned);
      setPublished(!!result.published);
      setForm(recordToForm(result.metadata));
    } catch (error: any) {
      toast.error(error?.message ?? "Could not load distribution metadata");
      setForm({ ...EMPTY_FORM });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, productForm]);

  const requiredChecks = useMemo(() => [
    { label: "Certified publication exists", ok: published },
    { label: `Format-specific ISBN assigned (${productForm})`, ok: isbnAssigned },
    { label: "Canonical language and edition", ok: !!canonicalLanguage && !!canonicalEditionLabel },
    { label: "Publication date", ok: /^\d{4}-\d{2}-\d{2}$/.test(form.publicationDate) },
    { label: "VLB Warengruppe", ok: /^\d{4}$/.test(form.warengruppeCode) },
    { label: "ONIX availability code", ok: /^\d{2}$/.test(form.productAvailability) },
    { label: "Explicit price type and amount", ok: !!form.priceType && form.price !== "" },
    { label: "Explicit tax code and rate", ok: !!form.taxRateCode && form.taxRatePercent !== "" },
  ], [canonicalEditionLabel, canonicalLanguage, form, isbnAssigned, productForm, published]);

  const readyCount = requiredChecks.filter((check) => check.ok).length;
  const onixReady = readyCount === requiredChecks.length;

  async function save() {
    setSaving(true);
    try {
      const parsedPrice = form.price.trim() === "" ? null : Number(form.price);
      if (parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        throw new Error("Price must be a non-negative number");
      }
      const parsedTax = form.taxRatePercent.trim() === "" ? null : Number(form.taxRatePercent);
      if (parsedTax != null && (!Number.isFinite(parsedTax) || parsedTax < 0 || parsedTax > 100)) {
        throw new Error("Tax rate must be between 0 and 100");
      }

      const { error } = await supabase.functions.invoke("distribution-metadata", {
        body: {
          action: "save",
          bookId,
          productForm,
          publicationDate: form.publicationDate || null,
          warengruppeCode: form.warengruppeCode || null,
          productAvailability: form.productAvailability || null,
          publishingStatus: form.publishingStatus || null,
          priceType: form.priceType || null,
          priceCents: parsedPrice == null ? null : Math.round(parsedPrice * 100),
          currency: form.currency || "EUR",
          priceCountry: form.priceCountry || "DE",
          taxRateCode: form.taxRateCode || null,
          taxRatePercent: parsedTax,
          unpricedItemType: form.unpricedItemType || null,
          themaCodes: splitList(form.themaCodes),
          keywords: splitList(form.keywords),
        },
      });
      if (error) throw error;
      toast.success(`${productForm} distribution metadata saved`);
      await load();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save distribution metadata");
    } finally {
      setSaving(false);
    }
  }

  async function downloadOnix() {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-onix", {
        body: { bookId, productForm },
      });
      if (error) throw error;

      const blob = data instanceof Blob
        ? data
        : new Blob([typeof data === "string" ? data : String(data ?? "")], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `scrolllibrary-${productForm}-onix-3.1.xml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("ONIX 3.1 metadata exported");
    } catch (error: any) {
      toast.error(error?.message ?? "ONIX export failed");
    } finally {
      setExporting(false);
    }
  }

  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5" /> Trade & distribution metadata
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One controlled record feeds ONIX/VLB and future bookstore/library exports. Bibliographic identity
            (title, contributors, publisher, edition, language and ISBN) comes from the certified Publication;
            commercial fields below remain editable without changing the edition identity.
          </p>
        </div>
        <Badge variant={onixReady ? "default" : "secondary"} className="self-start">
          {onixReady ? "ONIX ready" : `${readyCount}/${requiredChecks.length} required`}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(["paperback", "hardcover", "epub"] as DistributionProductForm[]).map((format) => (
          <Button
            key={format}
            type="button"
            variant={productForm === format ? "default" : "outline"}
            onClick={() => setProductForm(format)}
            className="capitalize"
          >
            {format}
          </Button>
        ))}
      </div>

      <div className="mt-4 rounded-md border bg-muted/20 p-3 text-xs sm:text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><strong>Language:</strong> {canonicalLanguage || "Not configured"}</span>
          <span><strong>Edition:</strong> {canonicalEditionLabel || "Not configured"}</span>
          <span><strong>ISBN:</strong> {isbnAssigned ? "Assigned" : "Missing for this format"}</span>
          <span><strong>Publication:</strong> {published ? "Certified" : "Not yet certified"}</span>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 text-sm text-muted-foreground">Loading metadata…</div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Publication date</Label>
              <Input type="date" value={form.publicationDate} onChange={(event) => set("publicationDate", event.target.value)} />
            </div>
            <div>
              <Label>VLB Warengruppe</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder={productForm === "epub" ? "9xxx" : "1xxx"}
                value={form.warengruppeCode}
                onChange={(event) => set("warengruppeCode", event.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <p className="text-xs text-muted-foreground mt-1">Print codes begin with 1; EPUB codes begin with 9.</p>
            </div>
            <div>
              <Label>ONIX ProductAvailability code</Label>
              <Input
                inputMode="numeric"
                maxLength={2}
                placeholder="20"
                value={form.productAvailability}
                onChange={(event) => set("productAvailability", event.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </div>
            <div>
              <Label>ONIX PublishingStatus code (optional)</Label>
              <Input
                inputMode="numeric"
                maxLength={2}
                placeholder="04"
                value={form.publishingStatus}
                onChange={(event) => set("publishingStatus", event.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </div>
          </div>

          <div>
            <Label>Thema subject codes</Label>
            <Input
              placeholder="KFF, KJ"
              value={form.themaCodes}
              onChange={(event) => set("themaCodes", event.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated. Exported as ONIX SubjectSchemeIdentifier 93; ScrollLibrary never invents a classification at export time.
            </p>
          </div>

          <div>
            <Label>Trade keywords</Label>
            <Input
              placeholder="financial systems, money, economics"
              value={form.keywords}
              onChange={(event) => set("keywords", event.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Exported as ONIX keyword subject metadata (scheme 20).</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Price type</Label>
              <Select value={form.priceType || "none"} onValueChange={(value) => set("priceType", value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="02">02</SelectItem>
                  <SelectItem value="04">04</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="14">14</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="24.99" value={form.price} onChange={(event) => set("price", event.target.value)} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input maxLength={3} value={form.currency} onChange={(event) => set("currency", event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} />
            </div>
            <div>
              <Label>Price country</Label>
              <Input maxLength={2} value={form.priceCountry} onChange={(event) => set("priceCountry", event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
            </div>
            <div>
              <Label>Tax rate code</Label>
              <Select value={form.taxRateCode || "none"} onValueChange={(value) => set("taxRateCode", value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="R">R</SelectItem>
                  <SelectItem value="S">S</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tax rate %</Label>
              <Input type="number" inputMode="decimal" min="0" max="100" step="0.001" placeholder="7" value={form.taxRatePercent} onChange={(event) => set("taxRatePercent", event.target.value)} />
            </div>
          </div>

          <div>
            <Label>Unpriced item type (optional)</Label>
            <Select
              value={form.unpricedItemType || "none"}
              onValueChange={(value) => set("unpricedItemType", value === "none" ? "" : value)}
              disabled={form.price !== "" || form.priceType !== ""}
            >
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                <SelectItem value="01">01</SelectItem>
                <SelectItem value="02">02</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">Metadata readiness</div>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs sm:text-sm">
              {requiredChecks.map((check) => (
                <li key={check.label} className="flex items-center gap-2">
                  {check.ok
                    ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden />
                    : <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />}
                  <span className={check.ok ? "" : "text-muted-foreground"}>{check.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save metadata"}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Button variant="secondary" onClick={downloadOnix} disabled={!onixReady || exporting}>
              <Download className="w-4 h-4 mr-2" /> {exporting ? "Exporting…" : "Download ONIX 3.1"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
