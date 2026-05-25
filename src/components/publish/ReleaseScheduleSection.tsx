/**
 * ReleaseScheduleSection — serialized publishing controls for a single book.
 * Lets owners create/update/cancel a schedule and regenerate per-chapter items.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, Trash2 } from "lucide-react";
import {
  type Cadence,
  type Channel,
  type ReleaseSchedule,
  type ReleaseScheduleItem,
  fetchScheduleForBook,
  fetchScheduleItems,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  generateScheduleItems,
  clearScheduleItems,
} from "@/lib/releaseSchedules";

interface Props {
  bookId: string;
  ownerUserId: string;
}

export function ReleaseScheduleSection({ bookId, ownerUserId }: Props) {
  const [schedule, setSchedule] = useState<ReleaseSchedule | null>(null);
  const [items, setItems] = useState<ReleaseScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [channel, setChannel] = useState<Channel>("platform");
  const [startAt, setStartAt] = useState<string>(() => new Date().toISOString().slice(0, 16));

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchScheduleForBook(bookId);
        setSchedule(s);
        if (s) {
          setCadence(s.cadence);
          setChannel(s.channel);
          setStartAt(new Date(s.start_at).toISOString().slice(0, 16));
          setItems(await fetchScheduleItems(s.id));
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load schedule");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  const saveOrCreate = async () => {
    setBusy(true);
    try {
      const isoStart = new Date(startAt).toISOString();
      let s = schedule;
      if (s) {
        s = await updateSchedule(s.id, { cadence, channel, start_at: isoStart });
      } else {
        s = await createSchedule({
          book_id: bookId,
          owner_user_id: ownerUserId,
          cadence,
          channel,
          start_at: isoStart,
        });
      }
      setSchedule(s);
      toast.success("Schedule saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!schedule) return;
    setBusy(true);
    try {
      const { data: chapters, error } = await supabase
        .from("chapters")
        .select("id, chapter_number")
        .eq("book_id", bookId)
        .order("chapter_number", { ascending: true });
      if (error) throw error;
      await clearScheduleItems(schedule.id);
      const created = await generateScheduleItems(
        schedule.id,
        (chapters ?? []) as { id: string; chapter_number: number }[],
        cadence,
        new Date(startAt),
      );
      setItems(created);
      toast.success(`Generated ${created.length} release${created.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to regenerate");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!schedule) return;
    if (!confirm("Delete this release schedule?")) return;
    setBusy(true);
    try {
      await deleteSchedule(schedule.id);
      setSchedule(null);
      setItems([]);
      toast.success("Schedule removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> Serialized release schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Drip-release chapters to readers on a cadence. Works for Patreon, Substack, and platform readers.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Cadence</Label>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className="w-full mt-1 h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="w-full mt-1 h-9 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="platform">Platform</option>
              <option value="substack">Substack</option>
              <option value="patreon">Patreon</option>
              <option value="email">Email</option>
              <option value="rss">RSS</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">First release</Label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 text-foreground"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveOrCreate} disabled={busy || loading}>
            {schedule ? "Save schedule" : "Create schedule"}
          </Button>
          {schedule && (
            <>
              <Button variant="secondary" onClick={regenerate} disabled={busy || cadence === "manual"}>
                Regenerate releases
              </Button>
              <Button variant="ghost" onClick={remove} disabled={busy} className="text-destructive">
                <Trash2 className="w-3 h-3 mr-1" /> Remove
              </Button>
              <Badge variant="outline" className="ml-auto">{schedule.status}</Badge>
            </>
          )}
        </div>

        {!!items.length && (
          <div className="border rounded-md max-h-64 overflow-y-auto text-sm">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0">
                <span>Ch. {it.chapter_number ?? "?"}</span>
                <span className="text-muted-foreground tabular-nums">
                  {new Date(it.release_at).toLocaleString()}
                </span>
                <Badge variant={it.status === "released" ? "default" : "secondary"}>{it.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
