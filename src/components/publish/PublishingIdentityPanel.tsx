import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, BookKey, CheckCircle2, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PublisherMode = "own_imprint" | "platform_imprint" | "kdp_independent";
type ProductForm = "paperback" | "hardcover" | "epub";
type IdentifierStrategy = "own_isbn" | "platform_isbn" | "unassigned";

type Assignment = {
  id: string;
  productForm: string;
  language: string;
  editionLabel: string;
  isbn13: string | null;
  source: string | null;
  lockedAt: string | null;
  publicationId: string | null;
};

type PlatformImprint = {
  id: string;
  publisher_name: string;
  imprint_name: string;
  country_code: string | null;
  isbn_agency_name: string | null;
  registrant_name: string | null;
  availableIsbns: number;
};

type IdentityPayload = {
  book: { id: string; title: string };
  profile: {
    imprint_id: string | null;
    publisher_mode: PublisherMode;
    edition_label: string;
    publication_language: string;
    print_identifier_strategy: string;
    ebook_identifier_strategy: string;
    distribution_scope: string;
  } | null;
  imprint: {
    id: string;
    scope: string;
    publisher_name: string;
    imprint_name: string;
    country_code: string | null;
    isbn_agency_name: string | null;
    registrant_name: string | null;
    agency_record_attested: boolean;
    verified: boolean;
  } | null;
  assignments: Assignment[];
  platformImprints: PlatformImprint[];
};

interface Props {
  bookId: string;
}

const FORMS: Array<{ id: ProductForm; label: string; hint: string }> = [
  { id: "paperback", label: "Paperback", hint: "Use for KDP/Ingram paperback." },
  { id: "hardcover", label: "Hardcover", hint: "Requires a different ISBN from paperback." },
  { id: "epub", label: "EPUB / eBook", hint: "Use a separate ISBN when you choose to identify the EPUB edition." },
];

async function invokeIdentity(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("publishing-identity", { body });
  if (error) {
    let detail = error.message;
    const context = (error as any)?.context;
    try {
      const payload = context && typeof context.clone === "function"
        ? await context.clone().json()
        : context && typeof context.json === "function" ? await context.json() : null;
      detail = payload?.error || payload?.message || detail;
    } catch { /* keep safe connector message */ }
    throw new Error(detail || "Publishing identity request failed");
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export function PublishingIdentityPanel({ bookId }: Props) {
  const [data, setData] = useState<IdentityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyForm, setBusyForm] = useState<ProductForm | null>(null);
  const [mode, setMode] = useState<PublisherMode>("own_imprint");
  const [publisherName, setPublisherName] = useState("");
  const [imprintName, setImprintName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [registrantName, setRegistrantName] = useState("");
  const [confirmAgencyMatch, setConfirmAgencyMatch] = useState(false);
  const [platformImprintId, setPlatformImprintId] = useState("");
  const [editionLabel, setEditionLabel] = useState("First edition");
  const [language, setLanguage] = useState("en");
  const [printStrategy, setPrintStrategy] = useState<IdentifierStrategy>("own_isbn");
  const [ebookStrategy, setEbookStrategy] = useState<IdentifierStrategy>("unassigned");
  const [isbnInputs, setIsbnInputs] = useState<Record<ProductForm, string>>({ paperback: "", hardcover: "", epub: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await invokeIdentity({ action: "get", bookId }) as IdentityPayload;
      setData(payload);
      if (payload.profile) {
        setMode(payload.profile.publisher_mode);
        setEditionLabel(payload.profile.edition_label || "First edition");
        setLanguage(payload.profile.publication_language || "en");
        if (payload.profile.publisher_mode !== "kdp_independent") {
          setPrintStrategy((payload.profile.print_identifier_strategy as IdentifierStrategy) || "unassigned");
          setEbookStrategy((payload.profile.ebook_identifier_strategy as IdentifierStrategy) || "unassigned");
        }
      }
      if (payload.imprint?.scope === "user") {
        setPublisherName(payload.imprint.publisher_name || "");
        setImprintName(payload.imprint.imprint_name || "");
        setCountryCode(payload.imprint.country_code || "");
        setAgencyName(payload.imprint.isbn_agency_name || "");
        setRegistrantName(payload.imprint.registrant_name || "");
        setConfirmAgencyMatch(payload.imprint.agency_record_attested === true);
      } else if (payload.profile?.publisher_mode === "platform_imprint" && payload.profile.imprint_id) {
        setPlatformImprintId(payload.profile.imprint_id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load publishing identity");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { void load(); }, [load]);

  const assignments = useMemo(() => {
    const map = new Map<ProductForm, Assignment>();
    for (const assignment of data?.assignments ?? []) {
      if (assignment.productForm === "paperback" || assignment.productForm === "hardcover" || assignment.productForm === "epub") {
        map.set(assignment.productForm, assignment);
      }
    }
    return map;
  }, [data]);

  const selectedPlatform = useMemo(
    () => data?.platformImprints.find((row) => row.id === platformImprintId) ?? null,
    [data, platformImprintId],
  );

  async function saveProfile() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        action: "save_profile",
        bookId,
        publisherMode: mode,
        editionLabel,
        language,
        printIdentifierStrategy: mode === "kdp_independent" ? "kdp_free" : printStrategy,
        ebookIdentifierStrategy: mode === "kdp_independent" ? "unassigned" : ebookStrategy,
        distributionScope: mode === "kdp_independent" ? "kdp_only" : "global",
      };
      if (mode === "own_imprint") {
        Object.assign(body, {
          publisherName,
          imprintName,
          countryCode: countryCode || undefined,
          isbnAgencyName: agencyName || undefined,
          registrantName: registrantName || undefined,
          confirmAgencyMatch,
        });
      } else if (mode === "platform_imprint") {
        body.platformImprintId = platformImprintId;
      }
      await invokeIdentity(body);
      toast.success("Publishing identity saved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save publishing identity");
    } finally {
      setSaving(false);
    }
  }

  async function assign(form: ProductForm) {
    setBusyForm(form);
    try {
      if (!data?.profile) throw new Error("Save the publishing identity first");
      if (mode === "own_imprint") {
        const isbn13 = isbnInputs[form].trim();
        if (!isbn13) throw new Error(`Enter the registered ISBN-13 for ${form}`);
        await invokeIdentity({
          action: "assign_owned_isbn",
          bookId,
          isbn13,
          productForm: form,
          language,
          editionLabel,
        });
      } else if (mode === "platform_imprint") {
        await invokeIdentity({
          action: "allocate_platform_isbn",
          bookId,
          productForm: form,
          language,
          editionLabel,
        });
      } else {
        throw new Error("Amazon assigns its free ISBN during KDP submission; ScrollLibrary does not invent that number.");
      }
      toast.success(`${form.charAt(0).toUpperCase() + form.slice(1)} identifier assigned`);
      setIsbnInputs((current) => ({ ...current, [form]: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ISBN assignment failed");
    } finally {
      setBusyForm(null);
    }
  }

  if (loading) {
    return <Card className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading publisher identity…</div></Card>;
  }

  const profileSaved = !!data?.profile;
  const ownIncomplete = mode === "own_imprint" && (!publisherName.trim() || !imprintName.trim() || !confirmAgencyMatch);
  const platformIncomplete = mode === "platform_imprint" && !platformImprintId;

  return (
    <Card className="p-4 sm:p-6 space-y-5 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><BookKey className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Publisher & ISBN identity</h2>
            {profileSaved && <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />Saved</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            This identity is frozen into the publication record and reused by PDF, EPUB and distribution bundles. ScrollLibrary validates and allocates real ISBNs; it never manufactures ISBN numbers.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh publishing identity">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <Label>Publishing route</Label>
        <Select value={mode} onValueChange={(value) => setMode(value as PublisherMode)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="own_imprint">My registered publisher / imprint</SelectItem>
            <SelectItem value="platform_imprint" disabled={(data?.platformImprints.length ?? 0) === 0}>Verified ScrollLibrary publishing imprint</SelectItem>
            <SelectItem value="kdp_independent">Amazon KDP free ISBN — KDP only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "own_imprint" && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Registered publisher name</Label><Input className="mt-1" value={publisherName} onChange={(e) => setPublisherName(e.target.value)} placeholder="Exact ISBN-agency record" /></div>
            <div><Label>Imprint name</Label><Input className="mt-1" value={imprintName} onChange={(e) => setImprintName(e.target.value)} placeholder="Exact imprint used for these ISBNs" /></div>
            <div><Label>Country code</Label><Input className="mt-1" maxLength={2} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} placeholder="DE" /></div>
            <div><Label>ISBN agency</Label><Input className="mt-1" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Agency that issued your ISBNs" /></div>
            <div className="sm:col-span-2"><Label>Registrant name</Label><Input className="mt-1" value={registrantName} onChange={(e) => setRegistrantName(e.target.value)} placeholder="Publisher/registrant name shown in agency records" /></div>
          </div>
          <label className="flex items-start gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <Checkbox checked={confirmAgencyMatch} onCheckedChange={(checked) => setConfirmAgencyMatch(checked === true)} className="mt-0.5" />
            <span>I confirm the publisher/imprint entered here matches the registration record for the ISBNs I will assign. I understand a mismatched imprint can cause distributor rejection.</span>
          </label>
        </div>
      )}

      {mode === "platform_imprint" && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label>Verified platform imprint</Label>
          <Select value={platformImprintId} onValueChange={setPlatformImprintId}>
            <SelectTrigger><SelectValue placeholder="Select a verified imprint" /></SelectTrigger>
            <SelectContent>
              {(data?.platformImprints ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>{row.imprint_name} — {row.publisher_name} ({row.availableIsbns} ISBNs available)</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPlatform && (
            <div className="text-xs text-muted-foreground">
              Registered publisher: <span className="font-medium text-foreground">{selectedPlatform.publisher_name}</span> · Imprint: <span className="font-medium text-foreground">{selectedPlatform.imprint_name}</span>
            </div>
          )}
          {(data?.platformImprints.length ?? 0) === 0 && (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />No verified platform imprint/ISBN pool is configured. An administrator must load ISBNs obtained from an authorized ISBN agency before this option can be used.
            </div>
          )}
        </div>
      )}

      {mode === "kdp_independent" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="font-medium">Amazon KDP free ISBN</div>
          <p className="mt-1 text-muted-foreground">Amazon assigns the ISBN during KDP submission. It is KDP-only and the imprint is shown as “Independently published.” ScrollLibrary will not create a fake ISBN or reuse this route for Ingram/other distributors.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Edition</Label><Input className="mt-1" value={editionLabel} onChange={(e) => setEditionLabel(e.target.value)} /></div>
        <div><Label>Publication language</Label><Input className="mt-1" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" /></div>
      </div>

      {mode !== "kdp_independent" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Print identifier strategy</Label>
            <Select value={printStrategy} onValueChange={(value) => setPrintStrategy(value as IdentifierStrategy)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="own_isbn" disabled={mode !== "own_imprint"}>Use my ISBNs</SelectItem>
                <SelectItem value="platform_isbn" disabled={mode !== "platform_imprint"}>Allocate platform ISBN</SelectItem>
                <SelectItem value="unassigned">No print ISBN yet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>EPUB identifier strategy</Label>
            <Select value={ebookStrategy} onValueChange={(value) => setEbookStrategy(value as IdentifierStrategy)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="own_isbn" disabled={mode !== "own_imprint"}>Use my ISBN</SelectItem>
                <SelectItem value="platform_isbn" disabled={mode !== "platform_imprint"}>Allocate platform ISBN</SelectItem>
                <SelectItem value="unassigned">No EPUB ISBN</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Button className="w-full" onClick={() => void saveProfile()} disabled={saving || ownIncomplete || platformIncomplete}>
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving identity…</> : <><ShieldCheck className="mr-2 h-4 w-4" />Save canonical publishing identity</>}
      </Button>

      {profileSaved && mode !== "kdp_independent" && (
        <div className="space-y-3 border-t pt-5">
          <div>
            <h3 className="font-medium">Format-specific ISBN assignments</h3>
            <p className="text-xs text-muted-foreground">Paperback, hardcover and EPUB are separate products. The system will not reuse one ISBN across them.</p>
          </div>
          {FORMS.map((form) => {
            const assignment = assignments.get(form.id);
            const locked = !!assignment?.lockedAt;
            return (
              <div key={form.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-sm">{form.label}</div>
                  {assignment?.isbn13 && <Badge variant="outline">ISBN {assignment.isbn13}</Badge>}
                  {assignment?.source && <Badge variant="secondary">{assignment.source === "platform_pool" ? "Platform pool" : "Publisher-owned"}</Badge>}
                  {locked && <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" />Locked to publication</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{form.hint}</p>
                {!locked && !assignment?.isbn13 && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {mode === "own_imprint" && (
                      <Input value={isbnInputs[form.id]} onChange={(e) => setIsbnInputs((current) => ({ ...current, [form.id]: e.target.value }))} placeholder="Registered ISBN-13" />
                    )}
                    <Button variant="outline" onClick={() => void assign(form.id)} disabled={busyForm !== null || (mode === "own_imprint" && !isbnInputs[form.id].trim())}>
                      {busyForm === form.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookKey className="mr-2 h-4 w-4" />}
                      {mode === "platform_imprint" ? "Allocate ISBN" : "Assign ISBN"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
