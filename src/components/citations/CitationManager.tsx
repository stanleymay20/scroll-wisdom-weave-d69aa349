/**
 * CitationManager — Phase 2.1 Evidence & Citation Engine UI.
 * Authors can list, add, edit, delete, and verify structured citations.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Plus, ShieldCheck, Trash2, Pencil, X } from "lucide-react";
import { formatCitation, sourceTypeLabel, type CitationRecord } from "@/lib/citationStyles";
import { resolveDesign, type DesignSettings } from "@/lib/publisherDesign";

const SOURCE_TYPES = [
  "journal_article","book","government_report","company_report",
  "white_paper","news_article","standard","regulation","website","dataset",
] as const;

interface Props { bookId: string; design?: Partial<DesignSettings> | null }

interface DraftAuthor { family?: string; given?: string; literal?: string }

interface Draft {
  id?: string;
  citation_key: string;
  source_type: string;
  citation_text: string;
  authors: DraftAuthor[];
  publisher: string;
  container_title: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  isbn: string;
  url: string;
  accessed_at: string;
  publication_date: string;
  notes: string;
}

const EMPTY: Draft = {
  citation_key: "", source_type: "journal_article", citation_text: "",
  authors: [{ family: "", given: "" }],
  publisher: "", container_title: "", volume: "", issue: "", pages: "",
  doi: "", isbn: "", url: "", accessed_at: "", publication_date: "", notes: "",
};

export function CitationManager({ bookId, design }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    items: Array<Record<string, unknown> & { _will_skip?: boolean; _dup_key?: boolean; _dup_doi?: boolean }>;
    wouldInsert: number;
  } | null>(null);
  const style = resolveDesign(design).citation_style;

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("book_citations")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });

    if (!isCurrent()) return;

    if (error) {
      setRows([]);
      setLoading(false);
      toast({ title: "Citation load failed", description: error.message, variant: "destructive" });
      return;
    }

    setRows((data ?? []) as unknown as CitationRecord[]);
    setLoading(false);
  }, [bookId, toast]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  const startEdit = (rec?: CitationRecord) => {
    if (!rec) { setEditing({ ...EMPTY }); return; }
    setEditing({
      id: rec.id,
      citation_key: rec.citation_key,
      source_type: rec.source_type,
      citation_text: rec.citation_text ?? "",
      authors: (rec.authors as DraftAuthor[]) ?? [{}],
      publisher: rec.publisher ?? "",
      container_title: rec.container_title ?? "",
      volume: rec.volume ?? "",
      issue: rec.issue ?? "",
      pages: rec.pages ?? "",
      doi: rec.doi ?? "",
      isbn: rec.isbn ?? "",
      url: rec.url ?? "",
      accessed_at: rec.accessed_at ?? "",
      publication_date: rec.publication_date ?? "",
      notes: rec.notes ?? "",
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.citation_key || !editing.citation_text) {
      toast({ title: "Missing fields", description: "Key and title are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      ...editing,
      book_id: bookId,
      authors: editing.authors.filter((a) => a.family || a.given || a.literal),
      accessed_at: editing.accessed_at || null,
    };
    const { error } = await supabase.functions.invoke("upsert-citation", { body: payload });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Citation saved" });
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this citation?")) return;
    const { error } = await supabase.from("book_citations").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  const verify = async (id: string) => {
    setVerifyingId(id);
    const { data, error } = await supabase.functions.invoke("verify-citation", { body: { citation_id: id } });
    setVerifyingId(null);
    if (error) { toast({ title: "Verify failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: data?.verified ? "Verified ✓" : "Not verified", description: data?.verified ? "Confidence raised" : "External lookup found no match" });
    await load();
  };

  const parseImportItems = (): Array<Record<string, unknown>> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      throw new Error("Paste valid CSL-style JSON");
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : null;
    if (!items?.length) throw new Error("JSON must be a non-empty array, or an object with an items array");
    if (items.length > 200) throw new Error("Import at most 200 citations at a time");
    return items as Array<Record<string, unknown>>;
  };

  const previewImport = async () => {
    setImporting(true);
    try {
      const items = parseImportItems();
      const { data, error } = await supabase.functions.invoke("import-citations", {
        body: { book_id: bookId, items, commit: false },
      });
      if (error) throw error;
      const result = data as {
        preview?: Array<Record<string, unknown> & { _will_skip?: boolean; _dup_key?: boolean; _dup_doi?: boolean }>;
        would_insert?: number;
      };
      setImportPreview({
        items: result.preview ?? [],
        wouldInsert: Number(result.would_insert ?? 0),
      });
      toast({
        title: "Import preview ready",
        description: `${Number(result.would_insert ?? 0)} new citation(s) can be inserted.`,
      });
    } catch (error) {
      setImportPreview(null);
      toast({
        title: "Import preview failed",
        description: error instanceof Error ? error.message : "Invalid citation import",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const commitImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const items = parseImportItems();
      const { data, error } = await supabase.functions.invoke("import-citations", {
        body: { book_id: bookId, items, commit: true },
      });
      if (error) throw error;
      const result = data as { inserted?: number; skipped?: number };
      toast({
        title: "Citations imported",
        description: `Inserted ${result.inserted ?? 0}; skipped ${result.skipped ?? 0} duplicate(s).`,
      });
      setImportOpen(false);
      setImportText("");
      setImportPreview(null);
      await load();
    } catch (error) {
      toast({
        title: "Citation import failed",
        description: error instanceof Error ? error.message : "Import failed",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const preview = useMemo(
    () => rows.slice(0, 3).map((r) => formatCitation(r, style)),
    [rows, style],
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Evidence & Citations</h2>
          <p className="text-sm text-muted-foreground">
            Structured sources rendered in your chosen style ({style.toUpperCase()}). Use <code>[cite:key]</code> inline in chapters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportOpen(true); setImportPreview(null); }} size="sm">
            <FileUp className="h-4 w-4 mr-1" />Import JSON
          </Button>
          <Button onClick={() => startEdit()} size="sm"><Plus className="h-4 w-4 mr-1" />Add citation</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
          No citations yet. Add structured sources to ground your book in evidence.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-md p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.citation_key}</code>
                  <Badge variant="outline" className="text-xs">{sourceTypeLabel(r.source_type)}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      r.confidence === "verified" ? "border-green-500 text-green-700" :
                      r.confidence === "requires_review" ? "border-amber-500 text-amber-700" :
                      "border-muted-foreground text-muted-foreground"
                    }`}
                  >
                    {r.confidence}
                  </Badge>
                </div>
                <div className="text-sm text-foreground line-clamp-2">{formatCitation(r, style)}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {(r.doi || r.isbn) && (
                  <Button variant="ghost" size="sm" onClick={() => verify(r.id)} disabled={verifyingId === r.id}>
                    {verifyingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          <div className="font-medium mb-1 text-foreground">References preview</div>
          {preview.map((p, i) => <div key={i} className="truncate">{i + 1}. {p}</div>)}
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">Bulk citation import</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste a CSL-style JSON array using ScrollLibrary citation field names. Preview detects
                  duplicate citation keys and DOIs before commit.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setImportOpen(false); setImportPreview(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Textarea
              aria-label="Citation import JSON"
              rows={14}
              value={importText}
              onChange={(event) => { setImportText(event.target.value); setImportPreview(null); }}
              placeholder={'[{"citation_key":"smith2025","source_type":"journal_article","citation_text":"Article title","authors":[{"family":"Smith","given":"Ada"}],"doi":"10.xxxx/example"}]'}
              className="font-mono text-xs"
            />

            {importPreview && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">
                  {importPreview.wouldInsert} new · {importPreview.items.length - importPreview.wouldInsert} duplicate/skipped
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {importPreview.items.slice(0, 30).map((item, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 text-xs border-b border-border/40 py-1">
                      <span className="font-mono truncate">{String(item.citation_key ?? `item-${index + 1}`)}</span>
                      <Badge variant={item._will_skip ? "secondary" : "default"}>
                        {item._will_skip
                          ? item._dup_key ? "duplicate key" : item._dup_doi ? "duplicate DOI" : "skip"
                          : "insert"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void previewImport()} disabled={importing || !importText.trim()}>
                {importing && !importPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Preview import
              </Button>
              <Button
                onClick={() => void commitImport()}
                disabled={importing || !importPreview || importPreview.wouldInsert === 0}
              >
                {importing && importPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
                Import {importPreview?.wouldInsert ?? 0}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{editing.id ? "Edit" : "New"} citation</h3>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Key</Label>
                <Input value={editing.citation_key} onChange={(e) => setEditing({ ...editing, citation_key: e.target.value })} placeholder="kahneman1979" className="text-foreground" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={editing.source_type} onValueChange={(v) => setEditing({ ...editing, source_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => <SelectItem key={t} value={t}>{sourceTypeLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Title</Label>
                <Input value={editing.citation_text} onChange={(e) => setEditing({ ...editing, citation_text: e.target.value })} className="text-foreground" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Authors (one per line, "Family, Given" or "Organization")</Label>
                <Textarea
                  rows={3}
                  value={editing.authors.map((a) => a.literal ? a.literal : [a.family, a.given].filter(Boolean).join(", ")).join("\n")}
                  onChange={(e) => {
                    const authors: DraftAuthor[] = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
                      if (line.includes(",")) {
                        const [family, given] = line.split(",").map((s) => s.trim());
                        return { family, given };
                      }
                      return { literal: line };
                    });
                    setEditing({ ...editing, authors });
                  }}
                  className="text-foreground"
                />
              </div>
              <div className="space-y-1">
                <Label>Publisher / Agency</Label>
                <Input value={editing.publisher} onChange={(e) => setEditing({ ...editing, publisher: e.target.value })} className="text-foreground" />
              </div>
              <div className="space-y-1">
                <Label>Journal / Site / Container</Label>
                <Input value={editing.container_title} onChange={(e) => setEditing({ ...editing, container_title: e.target.value })} className="text-foreground" />
              </div>
              <div className="space-y-1"><Label>Year / Date</Label><Input value={editing.publication_date} onChange={(e) => setEditing({ ...editing, publication_date: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>Volume</Label><Input value={editing.volume} onChange={(e) => setEditing({ ...editing, volume: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>Issue</Label><Input value={editing.issue} onChange={(e) => setEditing({ ...editing, issue: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>Pages</Label><Input value={editing.pages} onChange={(e) => setEditing({ ...editing, pages: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>DOI</Label><Input value={editing.doi} onChange={(e) => setEditing({ ...editing, doi: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>ISBN</Label><Input value={editing.isbn} onChange={(e) => setEditing({ ...editing, isbn: e.target.value })} className="text-foreground" /></div>
              <div className="col-span-2 space-y-1"><Label>URL</Label><Input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} className="text-foreground" /></div>
              <div className="space-y-1"><Label>Accessed on</Label><Input type="date" value={editing.accessed_at} onChange={(e) => setEditing({ ...editing, accessed_at: e.target.value })} className="text-foreground" /></div>
              <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="text-foreground" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}

export default CitationManager;
