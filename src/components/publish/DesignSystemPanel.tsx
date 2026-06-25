/**
 * DesignSystemPanel — Phase 2.1 Publisher Design System UI.
 * Lets the author choose a typography pairing, trim size, accent, header style.
 * Persists to `books.design_settings`. Snapshot is frozen on publish.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, BookOpen } from "lucide-react";
import {
  resolveDesign, type DesignSettings, type DesignPreset,
  PRESETS, FONT_PAIR_LABELS, TRIM_LABELS, CITATION_STYLE_LABELS,
} from "@/lib/publisherDesign";

interface Props { bookId: string; locked?: boolean; onChange?: (d: DesignSettings) => void }

const PREVIEW_BG: Record<DesignPreset, string> = {
  editorial: "bg-blue-50",
  academic: "bg-amber-50",
  modern: "bg-teal-50",
};

export function DesignSystemPanel({ bookId, locked = false, onChange }: Props) {
  const { toast } = useToast();
  const [design, setDesign] = useState<DesignSettings>(resolveDesign(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("books").select("design_settings").eq("id", bookId).maybeSingle();
      if (cancelled) return;
      const resolved = resolveDesign(data?.design_settings as Partial<DesignSettings> | null);
      setDesign(resolved);
      onChange?.(resolved);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [bookId]);

  const update = (patch: Partial<DesignSettings>) => {
    const next = { ...design, ...patch };
    setDesign(next);
    onChange?.(next);
  };

  const applyPreset = (preset: DesignPreset) => update({ preset, ...PRESETS[preset] });

  const save = async () => {
    if (locked) return;
    setSaving(true);
    const { error } = await supabase.from("books").update({ design_settings: design as never }).eq("id", bookId);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Design saved", description: "Will be locked into the next publication snapshot." });
  };

  if (loading) {
    return <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>;
  }

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Publisher Design System
        </h2>
        <p className="text-sm text-muted-foreground">
          Typography, trim size, and page elements applied to every export.
          {locked && <span className="text-amber-600"> Locked — book is published.</span>}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        {(["editorial","academic","modern"] as DesignPreset[]).map((p) => (
          <button
            key={p}
            disabled={locked}
            onClick={() => applyPreset(p)}
            className={`text-left p-3 rounded-md border transition-all ${PREVIEW_BG[p]} ${design.preset === p ? "ring-2 ring-primary" : ""} disabled:opacity-50`}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{p}</div>
            <div className="font-serif text-lg text-foreground">Aa</div>
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Type pairing</Label>
          <Select value={design.font_pair} onValueChange={(v) => update({ font_pair: v as DesignSettings["font_pair"] })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FONT_PAIR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Trim size</Label>
          <Select value={design.trim_size} onValueChange={(v) => update({ trim_size: v as DesignSettings["trim_size"] })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TRIM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Accent color</Label>
          <Input type="color" value={design.accent_color} onChange={(e) => update({ accent_color: e.target.value })} disabled={locked} className="h-10 w-full" />
        </div>
        <div className="space-y-1">
          <Label>Citation style</Label>
          <Select value={design.citation_style} onValueChange={(v) => update({ citation_style: v as DesignSettings["citation_style"] })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CITATION_STYLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Running header</Label>
          <Select value={design.header_style} onValueChange={(v) => update({ header_style: v as DesignSettings["header_style"] })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="title_chapter">Title / Chapter</SelectItem>
              <SelectItem value="chapter_only">Chapter only</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Footer</Label>
          <Select value={design.footer_style} onValueChange={(v) => update({ footer_style: v as DesignSettings["footer_style"] })} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="page_center">Page number — center</SelectItem>
              <SelectItem value="page_outer">Page number — outer</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between col-span-full border rounded-md p-3">
          <div>
            <Label className="text-sm">Per-chapter endnotes</Label>
            <p className="text-xs text-muted-foreground">When off, all references appear at the end of the book.</p>
          </div>
          <Switch checked={design.endnotes_per_chapter} onCheckedChange={(v) => update({ endnotes_per_chapter: v })} disabled={locked} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || locked}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save design
        </Button>
      </div>
    </Card>
  );
}

export default DesignSystemPanel;
