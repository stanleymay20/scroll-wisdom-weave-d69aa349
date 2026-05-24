/**
 * NotificationBell — header bell with unread badge and dropdown list.
 * Reads creator_notifications via RLS.
 */
import { useEffect, useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
  deleteNotification,
  type AppNotification,
} from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const isAuthed = !!data.user;
      setAuthed(isAuthed);
      if (isAuthed) setUnread(await countUnread());
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (open && authed) {
      listNotifications(20).then(setItems).catch(() => {});
    }
  }, [open, authed]);

  if (!authed) return null;

  const onMarkAll = async () => {
    await markAllRead();
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  };

  const onMarkOne = async (id: string) => {
    await markRead(id);
    setItems((xs) => xs.map((x) => x.id === id ? { ...x, read_at: new Date().toISOString() } : x));
    setUnread((n) => Math.max(0, n - 1));
  };

  const onDelete = async (id: string) => {
    await deleteNotification(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Notifications</span>
          {items.some((i) => !i.read_at) && (
            <Button variant="ghost" size="sm" onClick={onMarkAll} className="h-7 text-xs">
              <Check className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!items.length && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`px-3 py-2 border-b last:border-0 flex items-start gap-2 ${
                n.read_at ? "opacity-70" : "bg-accent/30"
              }`}
            >
              <div className="flex-1 min-w-0">
                <a
                  href={n.link_url ?? "#"}
                  onClick={() => !n.read_at && void onMarkOne(n.id)}
                  className="block"
                >
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => void onDelete(n.id)}
                aria-label="Dismiss"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
