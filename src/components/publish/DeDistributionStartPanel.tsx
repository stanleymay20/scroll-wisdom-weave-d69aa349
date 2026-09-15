import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type ProductForm = "paperback" | "hardcover" | "epub";

type Declaration = {
  german_market_intended: boolean;
  commercial_release: boolean;
  publisher_state_code: string | null;
  publisher_operating_basis_confirmed: boolean;
  imprint_notice_confirmed: boolean;
  dnb_deposit_plan_confirmed: boolean;
  state_deposit_plan_confirmed: boolean;
  distribution_started_at: string | null;
  dnb_deposit_completed_at: string | null;
  state_deposit_completed_at: string | null;
  deposit_evidence_reference: string | null;
  direct_sales_enabled: boolean;
  direct_sales_legal_notice_confirmed: boolean;
  packaging_responsibility: "not_applicable" | "third_party_confirmed" | "publisher_responsible";
  lucid_status: "not_applicable" | "registered" | "required_missing";
  notes: string | null;
};

type Payload = {
  productForm: ProductForm;
  publishedAt: string | null;
  dnbDueAt: string | null;
  declaration: Declaration | null;
  statusLabel: string;
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function DeDistributionStartPanel({ bookId }: { bookId: string }) {
  const [productForm, setProductForm] = useState<ProductForm>("paperback");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async (form: ProductForm) => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("de-publication-compliance", {
        body: { action: "get", bookId, productForm: form },
      });
      if (error) throw error;
      if (current !== generation.current) return;
      const next = data as Payload;
      setPayload(next);
      setStartedAt(toLocalInput(next.declaration?.distribution_started_at));
    } catch (error) {
      if (current !== generation.current) return;
      toast.error(error instanceof Error ? error.message : "Could not load distribution-start record");
      setPayload(null);
      setStartedAt("");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { void load(productForm); }, [load, productForm]);

  async function save() {
    const declaration = payload?.declaration;
    if (!payload?.publishedAt) {
      toast.error("Create the immutable Publication before recording distribution start");
      return;
    }
    if (!declaration) {
      toast.error("Complete and save the Germany readiness declarations first");
      return;
    }
    if (!startedAt) {
      toast.error("Enter the actual date and time distribution or public access began");
      return;
    }

    const parsed = new Date(startedAt);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Enter a valid distribution-start date and time");
      return;
    }

    const capturedForm = productForm;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("de-publication-compliance", {
        body: {
          action: "save",
          bookId,
          productForm: capturedForm,
          germanMarketIntended: declaration.german_market_intended,
          commercialRelease: declaration.commercial_release,
          publisherStateCode: declaration.publisher_state_code,
          publisherOperatingBasisConfirmed: declaration.publisher_operating_basis_confirmed,
          imprintNoticeConfirmed: declaration.imprint_notice_confirmed,
          dnbDepositPlanConfirmed: declaration.dnb_deposit_plan_confirmed,
          stateDepositPlanConfirmed: declaration.state_deposit_plan_confirmed,
          distributionStartedAt: parsed.toISOString(),
          dnbDepositCompleted: !!declaration.dnb_deposit_completed_at,
          stateDepositCompleted: !!declaration.state_deposit_completed_at,
          depositEvidenceReference: declaration.deposit_evidence_reference,
          directSalesEnabled: declaration.direct_sales_enabled,
          directSalesLegalNoticeConfirmed: declaration.direct_sales_legal_notice_confirmed,
          packagingResponsibility: declaration.packaging_responsibility,
          lucidStatus: declaration.lucid_status,
          notes: declaration.notes,
        },
      });
      if (error) throw error;
      if (capturedForm !== productForm) return;
      const next = data as Payload;
      setPayload(next);
      setStartedAt(toLocalInput(next.declaration?.distribution_started_at));
      toast.success("Actual distribution start recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record distribution start");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><CalendarClock className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Distribution Start & Deposit Clock</h2>
            {payload?.declaration?.distribution_started_at && <Badge variant="secondary">start recorded</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Record when this exact product actually entered distribution or became publicly accessible. ScrollLibrary uses this timestamp—not its internal publication time—to calculate the DNB one-week deposit window.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["paperback", "hardcover", "epub"] as ProductForm[]).map((format) => (
          <Button key={format} type="button" variant={productForm === format ? "default" : "outline"} onClick={() => setProductForm(format)} className="capitalize">
            {format}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading distribution timeline…</div>
      ) : !payload?.publishedAt ? (
        <p className="text-sm text-muted-foreground">This control becomes active after the immutable Publication exists.</p>
      ) : !payload.declaration ? (
        <p className="text-sm text-muted-foreground">Save the Germany Publication Readiness declarations above before recording distribution start.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor={`distribution-start-${productForm}`}>Actual distribution/public-access start</Label>
            <Input
              id={`distribution-start-${productForm}`}
              className="mt-1 max-w-md"
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Changing an existing value changes the computed legal-deposit deadline. Keep supporting release evidence.</p>
          </div>
          {payload.dnbDueAt && (
            <p className="text-sm"><strong>Calculated DNB deadline:</strong> {new Date(payload.dnbDueAt).toLocaleString()}</p>
          )}
          <Button type="button" onClick={() => void save()} disabled={saving || !startedAt}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Record distribution start
          </Button>
        </div>
      )}
    </Card>
  );
}
