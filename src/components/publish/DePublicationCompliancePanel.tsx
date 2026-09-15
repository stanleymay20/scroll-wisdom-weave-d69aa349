import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save, Scale } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type ProductForm = "paperback" | "hardcover" | "epub";
type CheckStatus = "passed" | "missing" | "not_applicable" | "manual_review" | "pending" | "overdue";
type PackagingResponsibility = "not_applicable" | "third_party_confirmed" | "publisher_responsible";
type LucidStatus = "not_applicable" | "registered" | "required_missing";

type ReadinessCheck = {
  id: string;
  label: string;
  source: "system" | "publisher_declaration";
  status: CheckStatus;
  blocking: boolean;
  detail: string;
};

type Declaration = {
  german_market_intended: boolean;
  commercial_release: boolean;
  publisher_state_code: string | null;
  publisher_operating_basis_confirmed: boolean;
  imprint_notice_confirmed: boolean;
  dnb_deposit_plan_confirmed: boolean;
  state_deposit_plan_confirmed: boolean;
  dnb_deposit_completed_at: string | null;
  state_deposit_completed_at: string | null;
  deposit_evidence_reference: string | null;
  direct_sales_enabled: boolean;
  direct_sales_legal_notice_confirmed: boolean;
  packaging_responsibility: PackagingResponsibility;
  lucid_status: LucidStatus;
  notes: string | null;
};

type CompliancePayload = {
  book: { id: string; title: string };
  jurisdiction: "DE";
  productForm: ProductForm;
  canonicalLanguage: string | null;
  canonicalEditionLabel: string | null;
  publisherMode: string | null;
  imprint: {
    publisher_name: string;
    imprint_name: string;
    country_code: string | null;
    verified: boolean;
  } | null;
  publishedAt: string | null;
  dnbDueAt: string | null;
  declaration: Declaration | null;
  preReleaseChecks: ReadinessCheck[];
  postReleaseChecks: ReadinessCheck[];
  preReleaseReady: boolean;
  postReleaseReady: boolean;
  overallReady: boolean;
  statusLabel: "CONTROLLED_RELEASE_READY" | "POST_RELEASE_ACTION_REQUIRED" | "REQUIRES_ATTENTION";
  assurance: { legalCertification: false; message: string };
  legalSources: Array<{ id: string; label: string; url: string }>;
};

type FormState = {
  germanMarketIntended: boolean;
  commercialRelease: boolean;
  publisherStateCode: string;
  publisherOperatingBasisConfirmed: boolean;
  imprintNoticeConfirmed: boolean;
  dnbDepositPlanConfirmed: boolean;
  stateDepositPlanConfirmed: boolean;
  dnbDepositCompleted: boolean;
  stateDepositCompleted: boolean;
  depositEvidenceReference: string;
  directSalesEnabled: boolean;
  directSalesLegalNoticeConfirmed: boolean;
  packagingResponsibility: PackagingResponsibility;
  lucidStatus: LucidStatus;
  notes: string;
};

const EMPTY: FormState = {
  germanMarketIntended: true,
  commercialRelease: true,
  publisherStateCode: "",
  publisherOperatingBasisConfirmed: false,
  imprintNoticeConfirmed: false,
  dnbDepositPlanConfirmed: false,
  stateDepositPlanConfirmed: false,
  dnbDepositCompleted: false,
  stateDepositCompleted: false,
  depositEvidenceReference: "",
  directSalesEnabled: false,
  directSalesLegalNoticeConfirmed: false,
  packagingResponsibility: "not_applicable",
  lucidStatus: "not_applicable",
  notes: "",
};

function fromDeclaration(value: Declaration | null): FormState {
  if (!value) return { ...EMPTY };
  return {
    germanMarketIntended: value.german_market_intended,
    commercialRelease: value.commercial_release,
    publisherStateCode: value.publisher_state_code ?? "",
    publisherOperatingBasisConfirmed: value.publisher_operating_basis_confirmed,
    imprintNoticeConfirmed: value.imprint_notice_confirmed,
    dnbDepositPlanConfirmed: value.dnb_deposit_plan_confirmed,
    stateDepositPlanConfirmed: value.state_deposit_plan_confirmed,
    dnbDepositCompleted: !!value.dnb_deposit_completed_at,
    stateDepositCompleted: !!value.state_deposit_completed_at,
    depositEvidenceReference: value.deposit_evidence_reference ?? "",
    directSalesEnabled: value.direct_sales_enabled,
    directSalesLegalNoticeConfirmed: value.direct_sales_legal_notice_confirmed,
    packagingResponsibility: value.packaging_responsibility,
    lucidStatus: value.lucid_status,
    notes: value.notes ?? "",
  };
}

function statusVariant(status: CheckStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "passed") return "default";
  if (status === "overdue" || status === "missing") return "destructive";
  if (status === "manual_review" || status === "pending") return "secondary";
  return "outline";
}

export function DePublicationCompliancePanel({ bookId }: { bookId: string }) {
  const [productForm, setProductForm] = useState<ProductForm>("paperback");
  const [payload, setPayload] = useState<CompliancePayload | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const requestGeneration = useRef(0);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("de-publication-compliance", { body });
    if (error) throw error;
    return data as CompliancePayload;
  }, []);

  const load = useCallback(async (requestedForm: ProductForm = productForm) => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const result = await invoke({ action: "get", bookId, productForm: requestedForm });
      if (generation !== requestGeneration.current) return;
      setPayload(result);
      setForm(fromDeclaration(result.declaration));
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      toast.error(error instanceof Error ? error.message : "Could not load Germany publication readiness");
      setPayload(null);
      setForm({ ...EMPTY });
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [bookId, invoke, productForm]);

  useEffect(() => { void load(productForm); }, [load, productForm]);

  const blockingCount = useMemo(
    () => [...(payload?.preReleaseChecks ?? []), ...(payload?.postReleaseChecks ?? [])].filter((item) => item.blocking).length,
    [payload],
  );

  async function save() {
    const capturedForm = productForm;
    setSaving(true);
    try {
      const result = await invoke({
        action: "save",
        bookId,
        productForm: capturedForm,
        germanMarketIntended: form.germanMarketIntended,
        commercialRelease: form.commercialRelease,
        publisherStateCode: form.publisherStateCode.trim() ? form.publisherStateCode.trim().toUpperCase() : null,
        publisherOperatingBasisConfirmed: form.publisherOperatingBasisConfirmed,
        imprintNoticeConfirmed: form.imprintNoticeConfirmed,
        dnbDepositPlanConfirmed: form.dnbDepositPlanConfirmed,
        stateDepositPlanConfirmed: form.stateDepositPlanConfirmed,
        dnbDepositCompleted: form.dnbDepositCompleted,
        stateDepositCompleted: form.stateDepositCompleted,
        depositEvidenceReference: form.depositEvidenceReference.trim() || null,
        directSalesEnabled: form.directSalesEnabled,
        directSalesLegalNoticeConfirmed: form.directSalesEnabled ? form.directSalesLegalNoticeConfirmed : false,
        packagingResponsibility: form.packagingResponsibility,
        lucidStatus: form.packagingResponsibility === "publisher_responsible" ? form.lucidStatus : "not_applicable",
        notes: form.notes.trim() || null,
      });
      if (capturedForm !== productForm) return;
      setPayload(result);
      setForm(fromDeclaration(result.declaration));
      toast.success(result.preReleaseReady ? "Germany controlled-release checks saved" : "Saved — readiness still requires attention");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save publication readiness");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <Card className="p-4 sm:p-6 space-y-5 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><Scale className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Germany Publication Readiness</h2>
            {payload && (
              <Badge variant={payload.overallReady ? "default" : "secondary"}>
                {payload.overallReady ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertCircle className="mr-1 h-3 w-3" />}
                {payload.statusLabel.replaceAll("_", " ")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Combines system checks with accountable publisher declarations for a Germany release. This is a workflow control, not legal advice or a legal certification.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load(productForm)} aria-label="Refresh Germany publication readiness">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["paperback", "hardcover", "epub"] as ProductForm[]).map((format) => (
          <Button key={format} type="button" variant={productForm === format ? "default" : "outline"} onClick={() => setProductForm(format)} className="capitalize">
            {format}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking release controls…</div>
      ) : (
        <>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>Publisher:</strong> {payload?.imprint?.imprint_name ?? "Not configured"}</span>
              <span><strong>Country:</strong> {payload?.imprint?.country_code ?? "—"}</span>
              <span><strong>Edition:</strong> {payload?.canonicalEditionLabel ?? "—"}</span>
              <span><strong>Language:</strong> {payload?.canonicalLanguage ?? "—"}</span>
              <span><strong>Blocking items:</strong> {blockingCount}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">System and declaration checks</h3>
            {[...(payload?.preReleaseChecks ?? []), ...(payload?.postReleaseChecks ?? [])].map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{item.label}</span>
                  <Badge variant={statusVariant(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                  <Badge variant="outline">{item.source === "system" ? "system checked" : "publisher declared"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="font-semibold">Publisher declarations</h3>
            <ToggleRow label="Commercial release" checked={form.commercialRelease} onCheckedChange={(value) => set("commercialRelease", value)} />
            <ToggleRow label="Intended for the German market" checked={form.germanMarketIntended} onCheckedChange={(value) => set("germanMarketIntended", value)} />

            <div>
              <Label>Publisher German state</Label>
              <Input className="mt-1" maxLength={2} placeholder="BB" value={form.publisherStateCode} onChange={(event) => set("publisherStateCode", event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))} />
              <p className="mt-1 text-xs text-muted-foreground">V1 explicitly models Brandenburg (BB). Other states fail closed for manual review.</p>
            </div>

            <ToggleRow label="Publisher operating/business basis reviewed" checked={form.publisherOperatingBasisConfirmed} onCheckedChange={(value) => set("publisherOperatingBasisConfirmed", value)} />
            <ToggleRow label="Book imprint / Impressum confirmed" checked={form.imprintNoticeConfirmed} onCheckedChange={(value) => set("imprintNoticeConfirmed", value)} />
            <ToggleRow label="DNB legal-deposit plan acknowledged" checked={form.dnbDepositPlanConfirmed} onCheckedChange={(value) => set("dnbDepositPlanConfirmed", value)} />
            <ToggleRow label="State legal-deposit plan acknowledged" checked={form.stateDepositPlanConfirmed} onCheckedChange={(value) => set("stateDepositPlanConfirmed", value)} />

            <ToggleRow label="Direct publisher-to-consumer sales enabled" checked={form.directSalesEnabled} onCheckedChange={(value) => set("directSalesEnabled", value)} />
            {form.directSalesEnabled && (
              <ToggleRow label="Direct-sales legal notice confirmed" checked={form.directSalesLegalNoticeConfirmed} onCheckedChange={(value) => set("directSalesLegalNoticeConfirmed", value)} />
            )}

            {(productForm === "paperback" || productForm === "hardcover") && form.germanMarketIntended && form.commercialRelease && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Packaging responsibility</Label>
                  <Select value={form.packagingResponsibility} onValueChange={(value) => {
                    const next = value as PackagingResponsibility;
                    set("packagingResponsibility", next);
                    if (next !== "publisher_responsible") set("lucidStatus", "not_applicable");
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_applicable">Not determined</SelectItem>
                      <SelectItem value="third_party_confirmed">Third party responsible — confirmed</SelectItem>
                      <SelectItem value="publisher_responsible">Publisher responsible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.packagingResponsibility === "publisher_responsible" && (
                  <div>
                    <Label>LUCID status</Label>
                    <Select value={form.lucidStatus} onValueChange={(value) => set("lucidStatus", value as LucidStatus)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="registered">Registered</SelectItem>
                        <SelectItem value="required_missing">Required / not yet confirmed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {payload?.publishedAt && (
              <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-sm font-medium">Post-release legal-deposit tracking</div>
                <ToggleRow label="DNB deposit completed" checked={form.dnbDepositCompleted} onCheckedChange={(value) => set("dnbDepositCompleted", value)} />
                {form.publisherStateCode === "BB" && (
                  <ToggleRow label="Brandenburg deposit completed" checked={form.stateDepositCompleted} onCheckedChange={(value) => set("stateDepositCompleted", value)} />
                )}
                <div>
                  <Label>Deposit evidence/reference</Label>
                  <Input className="mt-1" value={form.depositEvidenceReference} onChange={(event) => set("depositEvidenceReference", event.target.value)} placeholder="Receipt, submission reference or internal record" />
                </div>
                {payload.dnbDueAt && <p className="text-xs text-muted-foreground">Calculated DNB one-week deadline: {new Date(payload.dnbDueAt).toLocaleString()}</p>}
              </div>
            )}

            <div>
              <Label>Compliance notes</Label>
              <Textarea className="mt-1" rows={3} maxLength={4000} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Record counsel advice, fulfilment arrangements or evidence location. Do not store secrets." />
            </div>

            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save readiness declarations
            </Button>
          </div>

          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium">Authoritative references used by this V1 control model</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(payload?.legalSources ?? []).map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {source.label}<ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
