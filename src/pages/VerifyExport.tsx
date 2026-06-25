import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { PublicationCertificateButton } from "@/components/work/PublicationCertificateButton";

interface VerifyResult {
  verified: boolean;
  title?: string | null;
  authors?: Array<{ display_name: string; author_role?: string }>;
  version?: string | null;
  certificate_id?: string | null;
  integrity_level?: string | null;
  publisher?: string | null;
  copyright_holder?: string | null;
  content_hash?: string | null;
  published_at?: string | null;
  exported_at?: string | null;
  format?: string | null;
  reason?: string;
}

/**
 * Public, unauthenticated verification page.
 * Shows ONLY safe public metadata — never snapshot/prompts/internal IDs.
 */
export default function VerifyExport() {
  const { exportId } = useParams<{ exportId: string }>();
  const [state, setState] = useState<{ loading: boolean; data: VerifyResult | null; error?: string }>({
    loading: true,
    data: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-export", {
          body: {},
          // pass as query string for GET-style semantics
        });
        // Fallback: use fetch with query param since invoke is POST.
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const url = `https://${projectId}.supabase.co/functions/v1/verify-export?export_id=${encodeURIComponent(exportId ?? "")}`;
        const r = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
        });
        const body = await r.json();
        if (!cancelled) setState({ loading: false, data: body });
        void data; void error;
      } catch (e) {
        if (!cancelled) setState({ loading: false, data: null, error: String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [exportId]);

  return (
    <main className="container max-w-2xl mx-auto py-12 px-4">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-foreground">Export Verification</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Confirm the authenticity of a ScrollLibrary publication export.
        </p>
      </header>

      {state.loading && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Verifying…</CardContent></Card>
      )}

      {!state.loading && (!state.data?.verified) && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" /> Not verified
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {state.data?.reason === "not_found"
              ? "No export found with this identifier. The link may be invalid or the export may have been revoked."
              : "We could not verify this export. Please check the link."}
          </CardContent>
        </Card>
      )}

      {!state.loading && state.data?.verified && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Verified publication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Field label="Title" value={state.data.title} strong />
            <Field
              label="Authors"
              value={(state.data.authors ?? []).map((a) => a.display_name).join(", ") || "—"}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Version" value={state.data.version} />
              <Field label="Format" value={state.data.format} />
              <Field label="Integrity" value={state.data.integrity_level}>
                {state.data.integrity_level && (
                  <Badge variant="secondary" className="capitalize">{state.data.integrity_level}</Badge>
                )}
              </Field>
              <Field label="Published" value={fmt(state.data.published_at)} />
              <Field label="Exported" value={fmt(state.data.exported_at)} />
              <Field label="Certificate ID" value={state.data.certificate_id} mono />
            </div>
            {state.data.publisher && <Field label="Publisher" value={state.data.publisher} />}
            {state.data.copyright_holder && <Field label="Copyright" value={`© ${state.data.copyright_holder}`} />}
            <Field label="Content hash (SHA-256)" value={state.data.content_hash} mono />
            {state.data.certificate_id && (
              <div className="pt-4">
                <PublicationCertificateButton
                  certificateId={state.data.certificate_id}
                  filenameHint={`publication-certificate-${(state.data.title ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-v${state.data.version ?? ""}`}
                />
              </div>
            )}
            <div className="pt-4 border-t border-border text-xs text-muted-foreground flex items-center gap-1">
              <Link to="/docs/verification" className="inline-flex items-center gap-1 hover:underline">
                How verification works <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Field({ label, value, mono, strong, children }: {
  label: string; value?: string | null; mono?: boolean; strong?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {children ?? (
        <div className={`${mono ? "font-mono text-xs break-all" : ""} ${strong ? "text-lg font-medium" : ""} text-foreground`}>
          {value ?? "—"}
        </div>
      )}
    </div>
  );
}

function fmt(d?: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleString(); } catch { return d; }
}
