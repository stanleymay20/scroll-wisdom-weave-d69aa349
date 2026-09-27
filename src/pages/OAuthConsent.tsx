import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Check, Loader2, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  authorization_id: string;
  client: {
    id?: string;
    name?: string;
    uri?: string;
  };
  redirect_uri?: string;
  scope?: string;
};

type OAuthRedirect = {
  redirect_url: string;
};

function scopeLabel(scope: string): string {
  switch (scope) {
    case "email":
      return "Identify your signed-in ScrollLibrary account";
    case "profile":
      return "Read basic profile information";
    case "openid":
      return "Verify your account identity";
    case "phone":
      return "Read phone identity claims";
    default:
      return scope;
  }
}

export default function OAuthConsent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const authorizationId = searchParams.get("authorization_id");

  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestedScopes = useMemo(
    () => details?.scope?.split(/\s+/).filter(Boolean) ?? [],
    [details?.scope],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!authorizationId) {
        setError("This authorization request is missing its authorization_id.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        const redirectTo = `${location.pathname}?${searchParams.toString()}`;
        navigate("/auth", { replace: true, state: { redirectTo } });
        return;
      }

      const oauth = supabase.auth.oauth;
      const { data, error: detailsError } =
        await oauth.getAuthorizationDetails(authorizationId);

      if (cancelled) return;

      if (detailsError || !data) {
        setError(detailsError?.message ?? "This authorization request is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (!("authorization_id" in data)) {
        window.location.assign((data as OAuthRedirect).redirect_url);
        return;
      }

      setDetails(data as AuthorizationDetails);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId, location.pathname, navigate, searchParams]);

  const decide = async (decision: "approve" | "deny") => {
    if (!authorizationId || deciding) return;

    setDeciding(decision);
    setError(null);

    try {
      const oauth = supabase.auth.oauth;
      const result = decision === "approve"
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);

      if (result.error || !result.data?.redirect_url) {
        throw result.error ?? new Error("Authorization response did not include a redirect.");
      }

      window.location.assign(result.data.redirect_url);
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Could not complete this authorization request.",
      );
      setDeciding(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              ScrollLibrary OAuth
            </Badge>
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">
            Connect {details?.client?.name || "this AI client"} to ScrollLibrary?
          </CardTitle>
          <CardDescription>
            You are authorizing an external MCP client to act as your signed-in ScrollLibrary account.
            ScrollLibrary will still enforce your normal ownership and row-level permissions.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border p-4 space-y-3 text-sm">
            <div className="font-medium">What this connection can do</div>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>List books available to your ScrollLibrary account.</li>
              <li>Read canonical book and chapter context when you ask the AI to work on it.</li>
              <li>Read your AI handoff proposals and their review status.</li>
              <li>
                Submit a chapter revision <strong className="text-foreground">proposal</strong> to your AI Handoff Inbox.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="font-medium">What this connection cannot do</div>
            <p className="mt-2 text-sm text-muted-foreground">
              The MCP client cannot accept a revision into the canonical manuscript, certify a publication,
              issue an ISBN, or publish a book through this connector. Final manuscript acceptance stays inside
              ScrollLibrary under your control.
            </p>
          </div>

          {requestedScopes.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Requested OAuth scopes</div>
              <div className="flex flex-wrap gap-2">
                {requestedScopes.map((scope) => (
                  <Badge key={scope} variant="secondary" title={scope}>
                    {scopeLabel(scope)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {details?.redirect_uri && (
            <div className="text-xs text-muted-foreground break-all">
              Return address: {details.redirect_uri}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => void decide("deny")}
              disabled={Boolean(deciding)}
            >
              {deciding === "deny"
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <X className="h-4 w-4 mr-2" />}
              Deny
            </Button>
            <Button
              onClick={() => void decide("approve")}
              disabled={Boolean(deciding) || !details}
            >
              {deciding === "approve"
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Check className="h-4 w-4 mr-2" />}
              Authorize connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
