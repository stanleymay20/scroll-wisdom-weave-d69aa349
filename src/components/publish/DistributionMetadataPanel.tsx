import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type ProductForm = "paperback" | "hardcover" | "epub";

type DistributionRecord = {
  publication_date: string | null;
  warengruppe_code: string | null;
  product_availability: string | null;
  publishing_status: string | null;
  price_type: "02" | "04" | "12" | "14" | null;
  price_cents: number | null;
  currency: string | null;
  price_country: string | null;
  tax_rate_code: "R" | "S" | null;
  tax_rate_percent: number | null;
  unpriced_item_type: "01" | "02" | null;
  thema_codes: string[];
  keywords: string[];
};

type DistributionPayload = {
  bookId: string;
  productForm: ProductForm;
  canonicalLanguage: string;
  canonicalEditionLabel: string;
  isbnAssigned: boolean;
  published?: boolean;
  saved?: boolean;
  metadata: DistributionRecord | null;
};

type FormState = {
  publicationDate: string;
  warengruppeCode: string;
  productAvailability: string;
  publishingStatus: string;
  priceType: "" | "02" | "04" | "12" | "14";
  price: string;
  currency: string;
  priceCountry: string;
  taxRateCode: "" | "R" | "S";
  taxRatePercent: string;
  themaCodes: string;
  keywords: string;
};

const EMPTY: FormState = {
  publicationDate: "",
  warengruppeCode: "",
  productAvailability: "20",
  publishingStatus: "04",
  priceType: "04",
  price: "",
  currency: "EUR",
  priceCountry: "DE",
  taxRateCode: "R",
  taxRatePercent: "7",
  themaCodes: "",
  keywords: "",
};

function fromRecord(record: DistributionRecord | null): FormState {
  if (!record) return { ...EMPTY };
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
    themaCodes: (record.thema_codes ?? []).join(", "),
    keywords: (record.keywords ?? []).join(", "),
  };
}

async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!(error instanceof Error)) return fallback;
  let message = error.message || fallback;
  try {
    const context = (error as Error & { context?: { json?: () => Promise<unknown> } }).context;
    if (context?.json) {
      const body = await context.json() as {
        message?: string;
        error?: string;
        blockers?: string[];
        issues?: string[];
      };
      if (body.message) message = body.message;
      else if (body.error) message = body.error;
      if (body.blockers?.length) message += `: ${body.blockers.join(", ")}`;
      if (body.issues?.length) message += `: ${body.issues.join("; ")}`;
    }
  } catch {
    // Preserve the transport error if the response body was already consumed.
  }
  return message;
}

export function DistributionMetadataPanel({ bookId }: { bookId: string }) {
  const [productForm, setProductForm] = useState<ProductForm>("paperback");
  const [payload, setPayload] = useState<DistributionPayload | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestGenerationRef = useRef(0);
  const selectedProductFormRef = useRef<ProductForm>(productForm);

  const load = useCallback(async (format: ProductForm) => {
    const requestGeneration = ++requestGenerationRef.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("distribution-metadata", {
        body: { action: "get", bookId, productForm: format },
      });
      if (error) throw error;
      if (
        requestGeneration !== requestGenerationRef.current
        || format !== selectedProductFormRef.current
      ) return;

      const next = data as DistributionPayload;
      if (next.productForm !== format) {
        throw new Error("Distribution metadata response did not match the requested product format");
      }

      setPayload(next);
      setForm(fromRecord(next.metadata));
    } catch (error) {
      if (
        requestGeneration !== requestGenerationRef.current
        || format !== selectedProductFormRef.current
      ) return;

      setPayload(null);
      setForm({ ...EMPTY });
      toast.error(await edgeErrorMessage(error, "Could not load distribution metadata"));
    } finally {
      if (
        requestGeneration === requestGenerationRef.current
        && format === selectedProductFormRef.current
      ) {
        setLoading(false);
      }
    }
  }, [bookId]);

  useEffect(() => {
    selectedProductFormRef.current = productForm;
    void load(productForm);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [load, productForm]);

  const selectProductForm = (format: ProductForm) => {
    if (format === selectedProductFormRef.current) return;
    requestGenerationRef.current += 1;
    selectedProductFormRef.current = format;
    setLoading(true);
    setProductForm(format);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    const savedProductForm = productForm;
    const priceCents = form.price.trim()
      ? Math.round(Number(form.price) * 100)
      : null;
    const taxRatePercent = form.taxRatePercent.trim()
      ? Number(form.taxRatePercent)
      : null;

    if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) {
      toast.error("Enter a valid non-negative price");
      return;
    }
    if (priceCents != null && !form.priceType) {
      toast.error("Select an ONIX price type");
      return;
    }
    if (form.warengruppeCode && !/^\d{4}$/.test(form.warengruppeCode)) {
      toast.error("Warengruppe must contain exactly four digits");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("distribution-metadata", {
        body: {
          action: "save",
          bookId,
          productForm: savedProductForm,
          publicationDate: form.publicationDate || null,
          warengruppeCode: form.warengruppeCode || null,
          productAvailability: form.productAvailability || null,
          publishingStatus: form.publishingStatus || null,
          priceType: form.priceType || null,
          priceCents,
          currency: form.currency.trim().toUpperCase(),
          priceCountry: form.priceCountry.trim().toUpperCase(),
          taxRateCode: form.taxRateCode || null,
          taxRatePercent,
          unpricedItemType: null,
          themaCodes: form.themaCodes.split(",").map((value) => value.trim()).filter(Boolean),
          keywords: form.keywords.split(",").map((value) => value.trim()).filter(Boolean),
        },
      });
      if (error) throw error;
      const next = data as DistributionPayload;
      if (next.productForm !== savedProductForm) {
        throw new Error("Distribution metadata response did not match the requested product format");
      }
      if (selectedProductFormRef.current === savedProductForm) {
        setPayload(next);
        setForm(fromRecord(next.metadata));
      }
      toast.success(`${savedProductForm} distribution metadata saved`);
    } catch (error) {
      toast.error(await edgeErrorMessage(error, "Could not save distribution metadata"));
    } finally {
      setSaving(false);
    }
  }

  async function exportOnix() {
    const exportProductForm = productForm;
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-onix", {
        body: { bookId, productForm: exportProductForm },
      });
      if (error) throw error;

      const xml = data instanceof Blob
        ? await data.text()
        : typeof data === "string"
          ? data
          : "";

      if (!xml.trim().startsWith("<?xml") || !xml.includes("<ONIXMessage")) {
        throw new Error("ONIX exporter returned an invalid XML document");
      }

      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `scrolllibrary-${exportProductForm}-onix-3.1.xml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      toast.success("ONIX 3.1 export downloaded");
    } catch (error) {
      toast.error(await edgeErrorMessage(error, "ONIX export failed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="p-4 sm:p-6 space-y-5 border-primary/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Trade Distribution Metadata</h2>
            {payload?.isbnAssigned && <Badge variant="secondary">ISBN assigned</Badge>}
            {payload?.published && <Badge>publication frozen</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Controlled ONIX/VLB metadata for one canonical product format. Browser roles cannot write
            these database rows directly; saves and exports run through the server authority.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load(productForm)} aria-label="Refresh distribution metadata">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["paperback", "hardcover", "epub"] as ProductForm[]).map((format) => (
          <Button
            key={format}
            type="button"
            variant={productForm === format ? "default" : "outline"}
            onClick={() => selectProductForm(format)}
            className="capitalize"
          >
            {format}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading distribution metadata…
        </div>
      ) : (
        <>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <span><strong className="text-foreground">Language:</strong> {payload?.canonicalLanguage ?? "—"}</span>
            <span className="mx-2">·</span>
            <span><strong className="text-foreground">Edition:</strong> {payload?.canonicalEditionLabel ?? "—"}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Publication date">
              <Input type="date" value={form.publicationDate} onChange={(e) => set("publicationDate", e.target.value)} />
            </Field>
            <Field label="VLB Warengruppe">
              <Input inputMode="numeric" maxLength={4} placeholder={productForm === "epub" ? "9xxx" : "1xxx"} value={form.warengruppeCode}
                onChange={(e) => set("warengruppeCode", e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
            <Field label="Product availability (ONIX)">
              <Input maxLength={2} value={form.productAvailability} onChange={(e) => set("productAvailability", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
            <Field label="Publishing status (ONIX)">
              <Input maxLength={2} value={form.publishingStatus} onChange={(e) => set("publishingStatus", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </Field>
            <Field label="Price type">
              <Select value={form.priceType || "none"} onValueChange={(value) => set("priceType", value === "none" ? "" : value as FormState["priceType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="04">04 — Fixed retail price</SelectItem>
                  <SelectItem value="02">02 — RRP incl. tax</SelectItem>
                  <SelectItem value="12">12 — Agency price</SelectItem>
                  <SelectItem value="14">14 — Agency price incl. tax</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Retail price">
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="19.99" />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} />
            </Field>
            <Field label="Price country">
              <Input maxLength={2} value={form.priceCountry} onChange={(e) => set("priceCountry", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
            </Field>
            <Field label="Tax rate code">
              <Select value={form.taxRateCode || "none"} onValueChange={(value) => set("taxRateCode", value === "none" ? "" : value as FormState["taxRateCode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="R">R — Reduced</SelectItem>
                  <SelectItem value="S">S — Standard</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tax rate %">
              <Input type="number" min="0" max="100" step="0.01" value={form.taxRatePercent} onChange={(e) => set("taxRatePercent", e.target.value)} />
            </Field>
            <Field label="THEMA codes">
              <Input value={form.themaCodes} onChange={(e) => set("themaCodes", e.target.value)} placeholder="Comma-separated" />
            </Field>
            <Field label="Keywords">
              <Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="Comma-separated" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save distribution metadata
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void exportOnix()}
              disabled={exporting || !payload?.published}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export ONIX 3.1
            </Button>
          </div>

          {!payload?.published && (
            <p className="text-xs text-muted-foreground">
              ONIX export unlocks after an immutable canonical Publication exists.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
