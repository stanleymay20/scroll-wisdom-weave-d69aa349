/**
 * PayoutProfileEditor — creator's payout settings.
 *
 * Stripe Connect onboarding is live here. The page never sees or sends a
 * Connect account id: it asks the stripe-connect-onboarding function to start
 * or refresh onboarding, and renders the status word and sentence that come
 * back. Only Stripe, through the webhook, can mark a creator payable.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";

interface Profile {
  user_id: string;
  payout_method: "unset" | "stripe_connect" | "manual";
  stripe_connect_status: string;
  payout_email: string | null;
  country_code: string | null;
  tax_form_status: string;
}

type ConnectStatus = "not_started" | "pending" | "verified" | "restricted" | "disabled";

interface ConnectResponse {
  status?: ConnectStatus;
  message?: string;
  can_receive_payouts?: boolean;
  onboarding_url?: string;
}

const CONNECT_STATUSES: ConnectStatus[] = [
  "not_started",
  "pending",
  "verified",
  "restricted",
  "disabled",
];

/** The column is a free-text CHECK; anything unrecognised reads as unstarted. */
function toConnectStatus(value: string | null | undefined): ConnectStatus {
  return CONNECT_STATUSES.includes(value as ConnectStatus)
    ? (value as ConnectStatus)
    : "not_started";
}

/**
 * Wording shown before the server has spoken.
 *
 * Kept in step with _shared/stripe-connect.ts by hand rather than imported:
 * this file is bundled for the browser and that one is a Deno edge module. The
 * server's message wins the moment a response arrives.
 */
function connectMessageFor(status: ConnectStatus): string {
  switch (status) {
    case "verified":
      return "Your payout account is active. Earnings will be sent to it.";
    case "pending":
      return "Stripe is reviewing your details. This usually takes a few minutes, occasionally a day or two.";
    case "restricted":
      return "Stripe needs more information before it can pay you. Continue onboarding to provide it.";
    case "disabled":
      return "Stripe cannot pay out to this account. Contact support so we can help you sort it out.";
    default:
      return "Connect a payout account to receive your earnings.";
  }
}

function connectBadgeFor(status: ConnectStatus): { label: string; variant: "default" | "secondary" | "destructive" } {
  switch (status) {
    case "verified":
      return { label: "Active", variant: "default" };
    case "pending":
      return { label: "In review", variant: "secondary" };
    case "restricted":
      return { label: "Action needed", variant: "destructive" };
    case "disabled":
      return { label: "Unavailable", variant: "destructive" };
    default:
      return { label: "Not connected", variant: "secondary" };
  }
}

export default function PayoutProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [method, setMethod] = useState<"unset" | "manual">("unset");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("not_started");
  const [connectMessage, setConnectMessage] = useState(
    "Connect a payout account to receive your earnings.",
  );

  /**
   * Ask the server to start or refresh Connect onboarding.
   *
   * The browser holds no Stripe identifiers. It receives a status, a sentence
   * written for the creator, and — when there is onboarding left to do — a
   * one-time Stripe-hosted URL.
   */
  const callConnect = async (action: "start" | "refresh") => {
    setConnectBusy(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-onboarding", {
      body: { action, return_path: "/account/payouts" },
    });
    setConnectBusy(false);

    if (error) {
      toast.error("Could not reach Stripe. Please try again.");
      return null;
    }
    const result = data as ConnectResponse;
    if (result?.status) setConnectStatus(result.status);
    if (result?.message) setConnectMessage(result.message);
    return result;
  };

  const startConnect = async () => {
    const result = await callConnect("start");
    if (result?.onboarding_url) {
      // Stripe-hosted onboarding. Same tab: the creator comes back to this
      // page through the return_url, and a popup would be blocked as often as
      // not.
      window.location.href = result.onboarding_url;
      return;
    }
    if (result?.status === "verified") toast.success("Your payout account is active.");
  };

  const refreshConnect = async () => {
    const result = await callConnect("refresh");
    if (result) {
      void load();
      toast.success("Status updated");
    }
  };

  const load = async () => {
    const { data, error } = await supabase.functions.invoke("creator-payout-profile", { method: "GET" });
    if (error) toast.error("Failed to load payout profile");
    else {
      const p = (data as { profile: Profile | null }).profile;
      if (p) {
        setProfile(p);
        setEmail(p.payout_email ?? "");
        setCountry(p.country_code ?? "");
        setMethod(p.payout_method === "stripe_connect" ? "unset" : p.payout_method);
        setConnectStatus(toConnectStatus(p.stripe_connect_status));
        setConnectMessage(connectMessageFor(toConnectStatus(p.stripe_connect_status)));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Payout settings — ScrollLibrary";
    void trackStorefrontEvent(null, "payout_profile_view");
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("creator-payout-profile", {
      body: {
        payout_method: method,
        payout_email: email || null,
        country_code: country || null,
      },
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      const p = (data as { profile: Profile }).profile;
      setProfile(p);
      toast.success("Payout profile saved");
      void trackStorefrontEvent(null, "payout_profile_update");
    }
  };

  const connectBadge = connectBadgeFor(connectStatus);

  if (loading) return <div className="container mx-auto py-8 px-4 max-w-2xl"><Skeleton className="h-64" /></div>;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set how we'll send your earnings.
          <Link to="/account/earnings" className="ml-2 underline">View earnings →</Link>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Stripe Connect
            <Badge variant={connectBadge.variant}>{connectBadge.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{connectMessage}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void startConnect()}
              disabled={connectBusy || connectStatus === "verified"}
              variant={connectStatus === "not_started" ? "default" : "outline"}
            >
              {connectBusy
                ? "Opening Stripe…"
                : connectStatus === "not_started"
                  ? "Start Stripe Connect onboarding"
                  : "Continue onboarding"}
            </Button>
            {connectStatus !== "not_started" && (
              <Button variant="ghost" onClick={() => void refreshConnect()} disabled={connectBusy}>
                Refresh status
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Current status: <span className="font-mono">{connectStatus}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Payout details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">Payout email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="payouts@example.com"
              className="text-foreground caret-foreground" />
          </div>
          <div>
            <Label htmlFor="country">Country (ISO-2)</Label>
            <Input id="country" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              className="w-24 text-foreground caret-foreground" />
          </div>
          <div>
            <Label>Preferred method</Label>
            <div className="flex gap-2 mt-1">
              <Button type="button" variant={method === "manual" ? "default" : "outline"} size="sm" onClick={() => setMethod("manual")}>Manual</Button>
              <Button type="button" variant={method === "unset" ? "default" : "outline"} size="sm" onClick={() => setMethod("unset")}>Not yet</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {connectStatus === "verified"
                ? "Stripe Connect is active, so earnings are sent to your connected account. This preference applies only if you disconnect it."
                : "Manual payouts are processed offline. Connect Stripe above for direct bank payouts."}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Tax form status: <span className="font-mono">{profile?.tax_form_status ?? "not_required"}</span>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
