import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookKey, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type PlatformImprint = {
  id: string;
  publisher_name: string;
  imprint_name: string;
  country_code: string | null;
  isbn_agency_name: string | null;
  registrant_name: string | null;
  verified: boolean;
  verified_at: string | null;
  verification_reference: string | null;
  verification_method: string | null;
  verification_pending_reference: string | null;
  verification_pending_method: string | null;
  verification_submitted_by: string | null;
  verification_submitted_at: string | null;
  inventory: { total: number; availableVerified: number; assigned: number };
};

type PendingImprint = {
  id: string;
  scope: "platform" | "user";
  owner_user_id: string | null;
  publisher_name: string;
  imprint_name: string;
  country_code: string | null;
  isbn_agency_name: string | null;
  registrant_name: string | null;
  verified: boolean;
  verification_pending_reference: string | null;
  verification_pending_method: string | null;
  verification_pending_notes: string | null;
  verification_submitted_by: string | null;
  verification_submitted_at: string | null;
};

type PoolBatch = {
  id: string;
  imprint_id: string;
  provenance_reference: string;
  status: "pending" | "verified" | "rejected";
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  isbn_count: number;
};

type OwnedClaim = {
  id: string;
  user_id: string;
  imprint_id: string;
  isbn13: string;
  agency_reference: string;
  status: string;
  created_at: string;
};

type AdminState = {
  currentAdminUserId: string;
  platformImprints: PlatformImprint[];
  pendingImprints: PendingImprint[];
  poolBatches: PoolBatch[];
  ownedClaims: OwnedClaim[];
};

async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    const context = (error as any)?.context;
    try {
      const payload = context && typeof context.clone === "function"
        ? await context.clone().json()
        : context && typeof context.json === "function" ? await context.json() : null;
      detail = payload?.error || payload?.message || detail;
    } catch { /* preserve safe connector message */ }
    throw new Error(detail || `${name} request failed`);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

const splitIsbns = (value: string) => value
  .split(/[\s,;]+/)
  .map((item) => item.trim())
  .filter(Boolean);

export function IsbnGovernancePanel() {
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [selectedImprintId, setSelectedImprintId] = useState("new");
  const [publisherName, setPublisherName] = useState("ScrollLibrary Press");
  const [imprintName, setImprintName] = useState("ScrollLibrary Press");
  const [countryCode, setCountryCode] = useState("DE");
  const [agencyName, setAgencyName] = useState("");
  const [registrantName, setRegistrantName] = useState("");
  const [verificationReference, setVerificationReference] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("agency_allocation_record");
  const [verificationNotes, setVerificationNotes] = useState("");

  const [poolImprintId, setPoolImprintId] = useState("");
  const [isbnBlock, setIsbnBlock] = useState("");
  const [poolReference, setPoolReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await invokeFunction("isbn-admin-state", {});
      setState(payload as AdminState);
      const firstVerified = (payload as AdminState).platformImprints.find((row) => row.verified);
      setPoolImprintId((current) => current || firstVerified?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load ISBN governance state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verifiedPlatformImprints = useMemo(
    () => state?.platformImprints.filter((row) => row.verified) ?? [],
    [state],
  );

  function chooseImprint(id: string) {
    setSelectedImprintId(id);
    if (id === "new") return;
    const row = state?.platformImprints.find((item) => item.id === id);
    if (!row) return;
    setPublisherName(row.publisher_name || "");
    setImprintName(row.imprint_name || "");
    setCountryCode(row.country_code || "");
    setAgencyName(row.isbn_agency_name || "");
    setRegistrantName(row.registrant_name || "");
    setVerificationReference(row.verification_pending_reference || row.verification_reference || "");
    setVerificationMethod(row.verification_pending_method || row.verification_method || "agency_allocation_record");
  }

  async function submitImprintEvidence() {
    setBusy("imprint-submit");
    try {
      await invokeFunction("publishing-identity", {
        action: "upsert_platform_imprint",
        ...(selectedImprintId !== "new" ? { imprintId: selectedImprintId } : {}),
        publisherName,
        imprintName,
        countryCode,
        isbnAgencyName: agencyName,
        registrantName,
        verificationReference,
        verificationMethod,
        verificationNotes: verificationNotes || undefined,
      });
      toast.success("Publisher evidence submitted for independent review");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit publisher evidence");
    } finally {
      setBusy(null);
    }
  }

  async function reviewImprint(row: PendingImprint, approved: boolean) {
    setBusy(`imprint-${row.id}`);
    try {
      await invokeFunction("publishing-identity", {
        action: "review_imprint",
        imprintId: row.id,
        approved,
        verificationReference: row.verification_pending_reference,
        verificationMethod: row.verification_pending_method || "manual_agency_record_review",
        notes: approved ? "Independent publisher/ISBN-agency evidence review approved" : "Independent review rejected",
      });
      toast.success(approved ? "Publisher evidence approved" : "Publisher evidence rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publisher review failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitPool() {
    setBusy("pool-submit");
    try {
      const isbns = splitIsbns(isbnBlock);
      if (!poolImprintId) throw new Error("Choose a verified platform imprint");
      if (isbns.length === 0) throw new Error("Paste at least one ISBN-13");
      if (!poolReference.trim()) throw new Error("Enter the ISBN-agency allocation/provenance reference");
      await invokeFunction("publishing-identity", {
        action: "add_platform_pool",
        imprintId: poolImprintId,
        isbns,
        provenanceReference: poolReference.trim(),
      });
      toast.success(`${isbns.length} ISBN${isbns.length === 1 ? "" : "s"} submitted for independent provenance review`);
      setIsbnBlock("");
      setPoolReference("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit ISBN pool");
    } finally {
      setBusy(null);
    }
  }

  async function reviewPool(batch: PoolBatch, approved: boolean) {
    setBusy(`pool-${batch.id}`);
    try {
      await invokeFunction("publishing-identity", {
        action: "review_platform_pool",
        batchId: batch.id,
        approved,
        notes: approved ? "Independent ISBN allocation/provenance review approved" : "Independent ISBN pool review rejected",
      });
      toast.success(approved ? "ISBN pool verified" : "ISBN pool rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ISBN pool review failed");
    } finally {
      setBusy(null);
    }
  }

  async function reviewOwnedClaim(claim: OwnedClaim, approved: boolean) {
    setBusy(`claim-${claim.id}`);
    try {
      await invokeFunction("publishing-identity", {
        action: "review_owned_isbn_claim",
        claimId: claim.id,
        approved,
        notes: approved ? "Independent ISBN ownership evidence review approved" : "ISBN ownership evidence rejected",
      });
      toast.success(approved ? "Author-owned ISBN verified" : "Author-owned ISBN rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ISBN claim review failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Card><CardContent className="py-8"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading ISBN governance…</div></CardContent></Card>;
  }

  if (!state) return null;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><BookKey className="h-5 w-5 text-primary" />ISBN Governance</CardTitle>
              <CardDescription>Onboard legitimate publisher identity and ISBN inventory. Submission and approval are intentionally separate actions.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh ISBN governance"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.platformImprints.length === 0 ? (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />No platform publisher identity is active yet. Submit the real ScrollLibrary Press agency/registrant evidence below.
            </div>
          ) : state.platformImprints.map((row) => (
            <div key={row.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.imprint_name}</span>
                <Badge variant={row.verified ? "secondary" : "outline"}>{row.verified ? "Publisher verified" : "Not verified"}</Badge>
                {row.verification_submitted_at && <Badge variant="outline">Review pending</Badge>}
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                <span>Total pool: {row.inventory.total}</span>
                <span>Available + verified: {row.inventory.availableVerified}</span>
                <span>Assigned: {row.inventory.assigned}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>1. Publisher / Imprint Evidence</CardTitle><CardDescription>The platform must match the actual ISBN-agency registrant record. This submission does not self-verify.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Record</Label><Select value={selectedImprintId} onValueChange={chooseImprint}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Create new platform imprint record</SelectItem>{state.platformImprints.map((row) => <SelectItem key={row.id} value={row.id}>{row.imprint_name} — {row.publisher_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Publisher name</Label><Input className="mt-1" value={publisherName} onChange={(e) => setPublisherName(e.target.value)} /></div>
            <div><Label>Imprint name</Label><Input className="mt-1" value={imprintName} onChange={(e) => setImprintName(e.target.value)} /></div>
            <div><Label>Country code</Label><Input className="mt-1" maxLength={2} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} /></div>
            <div><Label>ISBN agency</Label><Input className="mt-1" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Agency shown on allocation record" /></div>
            <div className="sm:col-span-2"><Label>Registrant name</Label><Input className="mt-1" value={registrantName} onChange={(e) => setRegistrantName(e.target.value)} placeholder="Exact registrant / publisher name" /></div>
            <div><Label>Evidence reference</Label><Input className="mt-1" value={verificationReference} onChange={(e) => setVerificationReference(e.target.value)} placeholder="Agency order, allocation or registry reference" /></div>
            <div><Label>Verification method</Label><Input className="mt-1" value={verificationMethod} onChange={(e) => setVerificationMethod(e.target.value)} /></div>
          </div>
          <div><Label>Evidence notes</Label><Textarea className="mt-1" value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} placeholder="Describe where the independent reviewer can verify the registration." /></div>
          <Button onClick={() => void submitImprintEvidence()} disabled={busy !== null || !publisherName.trim() || !imprintName.trim() || countryCode.length !== 2 || !agencyName.trim() || !registrantName.trim() || !verificationReference.trim()}>
            {busy === "imprint-submit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Submit publisher evidence
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Independent Publisher Review</CardTitle><CardDescription>The admin who submitted the evidence cannot approve the same record.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {state.pendingImprints.length === 0 ? <p className="text-sm text-muted-foreground">No publisher verification reviews are pending.</p> : state.pendingImprints.map((row) => {
            const sameReviewer = row.verification_submitted_by === state.currentAdminUserId;
            return <div key={row.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{row.imprint_name}</span><Badge variant="outline">{row.scope}</Badge>{sameReviewer && <Badge variant="outline">Needs another admin</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">{row.publisher_name} · {row.registrant_name || "No registrant"} · Ref: {row.verification_pending_reference || "missing"}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void reviewImprint(row, true)} disabled={busy !== null || sameReviewer || !row.verification_pending_reference}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => void reviewImprint(row, false)} disabled={busy !== null || sameReviewer || !row.verification_pending_reference}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
              </div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Load ISBN Allocation</CardTitle><CardDescription>Only a verified platform imprint can receive pool inventory. Paste the real ISBNs allocated by the ISBN agency; duplicates and invalid checksums fail closed.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Verified imprint</Label><Select value={poolImprintId} onValueChange={setPoolImprintId}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose verified imprint" /></SelectTrigger><SelectContent>{verifiedPlatformImprints.map((row) => <SelectItem key={row.id} value={row.id}>{row.imprint_name} — {row.publisher_name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>ISBN-13 block</Label><Textarea className="mt-1 min-h-32 font-mono" value={isbnBlock} onChange={(e) => setIsbnBlock(e.target.value)} placeholder={"978...\n978...\n978..."} /></div>
          <div><Label>Agency allocation / provenance reference</Label><Input className="mt-1" value={poolReference} onChange={(e) => setPoolReference(e.target.value)} /></div>
          <Button onClick={() => void submitPool()} disabled={busy !== null || !poolImprintId || splitIsbns(isbnBlock).length === 0 || !poolReference.trim()}>{busy === "pool-submit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookKey className="mr-2 h-4 w-4" />}Submit ISBN block for review</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. Independent ISBN Pool Review</CardTitle><CardDescription>Approval converts pending pool entries into provenance-verified inventory that may be allocated to books.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {state.poolBatches.filter((row) => row.status === "pending").length === 0 ? <p className="text-sm text-muted-foreground">No ISBN pool batches are pending.</p> : state.poolBatches.filter((row) => row.status === "pending").map((batch) => {
            const sameReviewer = batch.submitted_by === state.currentAdminUserId;
            return <div key={batch.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{batch.isbn_count} ISBN{batch.isbn_count === 1 ? "" : "s"}</span><Badge variant="outline">pending</Badge>{sameReviewer && <Badge variant="outline">Needs another admin</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">Reference: {batch.provenance_reference}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void reviewPool(batch, true)} disabled={busy !== null || sameReviewer}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => void reviewPool(batch, false)} disabled={busy !== null || sameReviewer}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
              </div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>5. Author-Owned ISBN Claims</CardTitle><CardDescription>Independent admin review for ISBNs authors say are registered to their own verified imprint.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {state.ownedClaims.length === 0 ? <p className="text-sm text-muted-foreground">No author-owned ISBN claims are pending.</p> : state.ownedClaims.map((claim) => (
            <div key={claim.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{claim.isbn13}</span><Badge variant="outline">pending</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">Agency reference: {claim.agency_reference}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void reviewOwnedClaim(claim, true)} disabled={busy !== null}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => void reviewOwnedClaim(claim, false)} disabled={busy !== null}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
