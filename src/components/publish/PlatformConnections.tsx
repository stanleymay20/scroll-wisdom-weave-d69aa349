import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyPlatformConnections, startGumroadConnect, disconnectPlatform,
  type PlatformConnection,
} from "@/lib/platformConnections";

const PLATFORMS = [
  { id: "gumroad", label: "Gumroad", icon: Store, available: true },
];

export function PlatformConnections() {
  const [conns, setConns] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");

  async function reload() {
    try { setConns(await listMyPlatformConnections()); } catch (e: any) {
      toast.error(e?.message ?? "Failed to load connections");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    reload();
    // Pick up OAuth round-trip query params on landing
    const url = new URL(window.location.href);
    const result = url.searchParams.get("gumroad_connect");
    if (result === "ok") toast.success("Gumroad connected");
    else if (result === "error") toast.error(`Gumroad connection failed: ${url.searchParams.get("reason") ?? "unknown"}`);
    if (result) {
      url.searchParams.delete("gumroad_connect");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function onConnect(platform: string) {
    setBusy(platform);
    try {
      if (platform === "gumroad") {
        const oauthUrl = await startGumroadConnect(window.location.href);
        window.location.href = oauthUrl;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start OAuth");
      setBusy("");
    }
  }
  async function onDisconnect(platform: string) {
    if (!confirm(`Disconnect ${platform}? Your stored credentials will be deleted.`)) return;
    setBusy(platform);
    try {
      await disconnectPlatform(platform);
      toast.success(`${platform} disconnected`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Disconnect failed");
    } finally { setBusy(""); }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Link2 className="w-5 h-5" /> Platform connections
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Connect external publishing platforms to publish directly from ScrollLibrary.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {PLATFORMS.map(({ id, label, icon: Icon, available }) => {
            const c = conns.find((x) => x.platform === id);
            const connected = c?.connection_status === "connected";
            const broken = c && c.connection_status !== "connected";
            return (
              <li key={id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">{label}</div>
                    {c?.external_creator_name && (
                      <div className="text-xs text-muted-foreground truncate">as {c.external_creator_name}</div>
                    )}
                    {broken && c?.last_error && (
                      <div className="text-xs text-destructive truncate">{c.last_error}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {connected && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </Badge>
                  )}
                  {broken && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" /> {c.connection_status}
                    </Badge>
                  )}
                  {c ? (
                    <Button size="sm" variant="outline" disabled={busy === id} onClick={() => onDisconnect(id)}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" disabled={!available || busy === id} onClick={() => onConnect(id)}>
                      {busy === id ? "Opening…" : "Connect"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
