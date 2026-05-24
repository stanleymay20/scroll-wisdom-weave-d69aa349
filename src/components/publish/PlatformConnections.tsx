import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Store, ShoppingBag, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyPlatformConnections, startGumroadConnect, startShopifyConnect, disconnectPlatform,
  type PlatformConnection,
} from "@/lib/platformConnections";

type PlatformDef = {
  id: "gumroad" | "shopify";
  label: string;
  icon: any;
  available: boolean;
  needsShop?: boolean;
  helper?: string;
};

const PLATFORMS: PlatformDef[] = [
  { id: "gumroad", label: "Gumroad", icon: Store, available: true },
  {
    id: "shopify", label: "Shopify", icon: ShoppingBag, available: true, needsShop: true,
    helper: "e.g. mystore.myshopify.com",
  },
];

export function PlatformConnections() {
  const [conns, setConns] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [shopInput, setShopInput] = useState<Record<string, string>>({});

  async function reload() {
    try { setConns(await listMyPlatformConnections()); } catch (e: any) {
      toast.error(e?.message ?? "Failed to load connections");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    reload();
    const url = new URL(window.location.href);
    const g = url.searchParams.get("gumroad_connect");
    const s = url.searchParams.get("shopify_connect");
    if (g === "ok") toast.success("Gumroad connected");
    else if (g === "error") toast.error(`Gumroad connection failed: ${url.searchParams.get("reason") ?? "unknown"}`);
    if (s === "ok") toast.success(`Shopify connected${url.searchParams.get("shop") ? ` (${url.searchParams.get("shop")})` : ""}`);
    else if (s === "error") toast.error(`Shopify connection failed: ${url.searchParams.get("reason") ?? "unknown"}`);
    if (g || s) {
      ["gumroad_connect", "shopify_connect", "reason", "shop"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function onConnect(p: PlatformDef) {
    setBusy(p.id);
    try {
      if (p.id === "gumroad") {
        const oauthUrl = await startGumroadConnect(window.location.href);
        window.location.href = oauthUrl;
      } else if (p.id === "shopify") {
        const shop = (shopInput[p.id] ?? "").trim();
        if (!shop) { toast.error("Enter your Shopify store domain"); setBusy(""); return; }
        const oauthUrl = await startShopifyConnect(shop, window.location.href);
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
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            const c = conns.find((x) => x.platform === p.id);
            const connected = c?.connection_status === "connected";
            const broken = !!c && c.connection_status !== "connected";
            return (
              <li key={p.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">{p.label}</div>
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
                        <AlertCircle className="w-3 h-3" /> {c!.connection_status}
                      </Badge>
                    )}
                    {c ? (
                      <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => onDisconnect(p.id)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" disabled={!p.available || busy === p.id} onClick={() => onConnect(p)}>
                        {busy === p.id ? "Opening…" : "Connect"}
                      </Button>
                    )}
                  </div>
                </div>
                {!c && p.needsShop && (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      placeholder="mystore.myshopify.com"
                      value={shopInput[p.id] ?? ""}
                      onChange={(e) => setShopInput((x) => ({ ...x, [p.id]: e.target.value }))}
                      className="text-foreground caret-foreground"
                    />
                    {p.helper && <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{p.helper}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
