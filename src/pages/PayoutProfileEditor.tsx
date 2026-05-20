/**
 * PayoutProfileEditor — creator's payout readiness profile.
 * Stripe Connect onboarding is reserved (disabled with "Coming soon").
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

export default function PayoutProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [method, setMethod] = useState<"unset" | "manual">("unset");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  if (loading) return <div className="container mx-auto py-8 px-4 max-w-2xl"><Skeleton className="h-64" /></div>;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set how we'll send your earnings when payouts go live.
          <Link to="/account/earnings" className="ml-2 underline">View earnings →</Link>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Stripe Connect <Badge variant="secondary">Coming soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Direct bank payouts via Stripe Connect are launching soon. Set your payout email below in the
            meantime — we'll use it to notify you when onboarding opens.
          </p>
          <Button disabled variant="outline">Start Stripe Connect onboarding</Button>
          <div className="text-xs text-muted-foreground">
            Current status: <span className="font-mono">{profile?.stripe_connect_status ?? "not_started"}</span>
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
              Manual payouts are processed offline until Stripe Connect goes live.
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
