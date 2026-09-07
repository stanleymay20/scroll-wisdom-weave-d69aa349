import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, CheckCircle2, ExternalLink, GraduationCap, PlugZap, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUniversity } from '@/hooks/useUniversity';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;

interface LmsConnection {
  id: string;
  organization_id: string;
  name: string;
  standard: 'lti_1_3';
  issuer: string;
  client_id: string;
  auth_login_url: string;
  jwks_url: string;
  deployment_id: string | null;
  tool_url: string;
  status: 'draft' | 'configured' | 'verified' | 'disabled' | 'error';
  last_verified_at: string | null;
  last_error: string | null;
}

interface InstitutionVerification {
  organization_id: string;
  legal_name: string;
  website_url: string | null;
  primary_domain: string | null;
  evidence: Record<string, unknown>;
  status: 'pending' | 'verified' | 'rejected' | 'suspended';
  requested_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'verified') return 'default';
  if (status === 'error' || status === 'rejected' || status === 'suspended') return 'destructive';
  if (status === 'configured' || status === 'pending') return 'secondary';
  return 'outline';
}

export default function UniversityInteroperability() {
  const { toast } = useToast();
  const { user } = useSubscription();
  const university = useUniversity();
  const { activeOrg, activeOrgId, activeRole, isAcademicAdmin } = university;
  const canConfigure = activeRole === 'owner' || activeRole === 'admin';
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [verification, setVerification] = useState<InstitutionVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState({
    name: '', issuer: '', client_id: '', auth_login_url: '', jwks_url: '', deployment_id: '',
    tool_url: typeof window !== 'undefined' ? `${window.location.origin}/university` : '',
  });
  const [verificationForm, setVerificationForm] = useState({ legal_name: '', website_url: '', primary_domain: '', evidence_note: '' });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
  const oidcLoginUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/university-lti-login` : '';
  const launchUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/university-lti-launch` : '';

  const refresh = useCallback(async () => {
    if (!activeOrgId) {
      setConnections([]);
      setVerification(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [connectionRes, verificationRes] = await Promise.all([
        db.from('university_lms_connections').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_institution_verification').select('*').eq('organization_id', activeOrgId).maybeSingle(),
      ]);
      const firstError = connectionRes.error || verificationRes.error;
      if (firstError) throw firstError;
      setConnections((connectionRes.data || []) as LmsConnection[]);
      setVerification((verificationRes.data || null) as InstitutionVerification | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load university interoperability settings.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!verification) return;
    setVerificationForm({
      legal_name: verification.legal_name,
      website_url: verification.website_url || '',
      primary_domain: verification.primary_domain || '',
      evidence_note: typeof verification.evidence.note === 'string' ? verification.evidence.note : '',
    });
  }, [verification]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      toast({ title: success });
    } catch (err) {
      toast({ title: 'Interoperability operation failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveConnection = async () => {
    if (!activeOrgId || !user) throw new Error('Institution and authentication are required.');
    const requiredValues = [connection.name, connection.issuer, connection.client_id, connection.auth_login_url, connection.jwks_url, connection.tool_url];
    if (requiredValues.some((value) => !value.trim())) throw new Error('Complete all required LTI registration fields.');
    for (const value of [connection.issuer, connection.auth_login_url, connection.jwks_url, connection.tool_url]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('LTI URLs must use HTTPS.');
      }
    }
    const { error: insertError } = await db.from('university_lms_connections').insert({
      organization_id: activeOrgId,
      name: connection.name.trim(),
      standard: 'lti_1_3',
      issuer: connection.issuer.trim(),
      client_id: connection.client_id.trim(),
      auth_login_url: connection.auth_login_url.trim(),
      jwks_url: connection.jwks_url.trim(),
      deployment_id: connection.deployment_id.trim() || null,
      tool_url: connection.tool_url.trim(),
      status: 'configured',
      created_by: user.id,
    });
    if (insertError) throw insertError;
    setConnection({ ...connection, name: '', issuer: '', client_id: '', auth_login_url: '', jwks_url: '', deployment_id: '' });
  };

  const requestVerification = async () => {
    if (!activeOrgId || !user) throw new Error('Institution and authentication are required.');
    if (!verificationForm.legal_name.trim()) throw new Error('Legal institution name is required.');
    const payload = {
      organization_id: activeOrgId,
      legal_name: verificationForm.legal_name.trim(),
      website_url: verificationForm.website_url.trim() || null,
      primary_domain: verificationForm.primary_domain.trim().toLowerCase() || null,
      evidence: { note: verificationForm.evidence_note.trim() },
      status: 'pending',
      requested_by: user.id,
      requested_at: new Date().toISOString(),
    };
    const result = verification
      ? await db.from('university_institution_verification').update({
          legal_name: payload.legal_name,
          website_url: payload.website_url,
          primary_domain: payload.primary_domain,
          evidence: payload.evidence,
          requested_at: payload.requested_at,
        }).eq('organization_id', activeOrgId)
      : await db.from('university_institution_verification').insert(payload);
    if (result.error) throw result.error;
  };

  const verifiedConnections = useMemo(() => connections.filter((item) => item.status === 'verified').length, [connections]);

  if (!activeOrgId || !activeOrg) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Card><CardHeader><CardTitle>Select an institution</CardTitle></CardHeader><CardContent><Button asChild><Link to="/organizations">Choose organization</Link></Button></CardContent></Card></main><Footer /></>;
  }

  if (!isAcademicAdmin) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert variant="destructive"><AlertTitle>Academic administrator access required</AlertTitle><AlertDescription>LMS registrations and institutional verification are restricted to authorized university administrators.</AlertDescription></Alert><Button asChild variant="outline" className="mt-4"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1" />University hub</Link></Button></main><Footer /></>;
  }

  return (
    <>
      <Navbar />
      <main className="container mx-auto max-w-7xl px-4 pt-24 pb-16">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
          <div>
            <div className="flex items-center gap-2"><GraduationCap className="h-8 w-8 text-primary"/><h1 className="text-3xl font-bold">University interoperability</h1></div>
            <p className="text-muted-foreground">{activeOrg.name} · institutional trust and standards-based LMS launch.</p>
          </div>
          <div className="flex gap-2"><Button asChild variant="outline"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1"/>University hub</Link></Button><Button variant="outline" onClick={() => void refresh()}><RefreshCcw className="h-4 w-4 mr-1"/>Refresh</Button></div>
        </div>

        {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Interoperability data unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {loading ? <p>Loading interoperability configuration…</p> : <div className="grid xl:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5"/>Institution verification</CardTitle><CardDescription>Verification decisions cannot be self-approved by university administrators.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {verification && <div className="flex items-center gap-2"><Badge variant={statusVariant(verification.status)}>{verification.status}</Badge>{verification.reviewed_at && <span className="text-xs text-muted-foreground">Reviewed {new Date(verification.reviewed_at).toLocaleDateString()}</span>}</div>}
                <Field label="Legal name"><Input value={verificationForm.legal_name} onChange={(e) => setVerificationForm({ ...verificationForm, legal_name: e.target.value })}/></Field>
                <div className="grid md:grid-cols-2 gap-3"><Field label="Website"><Input type="url" value={verificationForm.website_url} onChange={(e) => setVerificationForm({ ...verificationForm, website_url: e.target.value })}/></Field><Field label="Primary domain"><Input value={verificationForm.primary_domain} onChange={(e) => setVerificationForm({ ...verificationForm, primary_domain: e.target.value })}/></Field></div>
                <Field label="Verification evidence note"><Textarea value={verificationForm.evidence_note} onChange={(e) => setVerificationForm({ ...verificationForm, evidence_note: e.target.value })} placeholder="Accreditor, registry reference, official domain ownership evidence, or reviewer context."/></Field>
                {verification?.review_notes && <Alert><AlertTitle>Reviewer note</AlertTitle><AlertDescription>{verification.review_notes}</AlertDescription></Alert>}
                <Button disabled={busy || !canConfigure || verification?.status === 'verified'} onClick={() => void run(requestVerification, verification ? 'Verification evidence updated' : 'Verification requested')}>{verification ? 'Update pending evidence' : 'Request verification'}</Button>
                {!canConfigure && <p className="text-xs text-muted-foreground">Organization owner/admin permission is required to submit verification evidence.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5"/>Register LTI 1.3 platform</CardTitle><CardDescription>Inbound resource launches use OIDC state/nonce and the platform JWKS. No LMS secret is stored in the browser.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Connection name"><Input value={connection.name} onChange={(e) => setConnection({ ...connection, name: e.target.value })} placeholder="Canvas production"/></Field>
                <Field label="Issuer"><Input value={connection.issuer} onChange={(e) => setConnection({ ...connection, issuer: e.target.value })} placeholder="https://lms.example.edu"/></Field>
                <Field label="Client ID"><Input value={connection.client_id} onChange={(e) => setConnection({ ...connection, client_id: e.target.value })}/></Field>
                <Field label="OIDC authorization URL"><Input type="url" value={connection.auth_login_url} onChange={(e) => setConnection({ ...connection, auth_login_url: e.target.value })}/></Field>
                <Field label="JWKS URL"><Input type="url" value={connection.jwks_url} onChange={(e) => setConnection({ ...connection, jwks_url: e.target.value })}/></Field>
                <div className="grid md:grid-cols-2 gap-3"><Field label="Deployment ID"><Input value={connection.deployment_id} onChange={(e) => setConnection({ ...connection, deployment_id: e.target.value })} placeholder="Optional until deployment"/></Field><Field label="Tool URL"><Input type="url" value={connection.tool_url} onChange={(e) => setConnection({ ...connection, tool_url: e.target.value })}/></Field></div>
                <Button disabled={busy || !canConfigure} onClick={() => void run(saveConnection, 'LTI registration saved')}>Save LTI registration</Button>
                {!canConfigure && <p className="text-xs text-muted-foreground">Organization owner/admin permission is required to create an LMS registration.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Tool registration endpoints</CardTitle><CardDescription>Enter these URLs in the LMS when registering ScrollUniversity as an LTI 1.3 tool.</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><p className="font-medium">OIDC login initiation URL</p><code className="block break-all rounded bg-muted p-2 mt-1">{oidcLoginUrl || 'Configure VITE_SUPABASE_URL'}</code></div>
                <div><p className="font-medium">Redirect / launch URL</p><code className="block break-all rounded bg-muted p-2 mt-1">{launchUrl || 'Configure VITE_SUPABASE_URL'}</code></div>
                <div><p className="font-medium">Tool target URL</p><code className="block break-all rounded bg-muted p-2 mt-1">{connection.tool_url}</code></div>
                <Alert><CheckCircle2 className="h-4 w-4"/><AlertTitle>Supported launch</AlertTitle><AlertDescription>LTI 1.3 OIDC login + signed LtiResourceLinkRequest + one-time account claim for pre-provisioned institution members.</AlertDescription></Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Registered LMS connections</CardTitle><CardDescription>{connections.length} configured · {verifiedConnections} cryptographically verified by a successful launch.</CardDescription></CardHeader>
              <CardContent>{connections.length ? <div className="space-y-3">{connections.map((item) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground break-all">{item.issuer}</p></div><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div><div className="mt-3 grid gap-1 text-xs text-muted-foreground"><span>Client: {item.client_id}</span><span>Deployment: {item.deployment_id || 'not pinned'}</span>{item.last_verified_at && <span>Last verified: {new Date(item.last_verified_at).toLocaleString()}</span>}{item.last_error && <span className="text-destructive">{item.last_error}</span>}</div><Button asChild variant="ghost" size="sm" className="mt-2"><a href={item.jwks_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1"/>Platform JWKS</a></Button></div>)}</div> : <p className="text-sm text-muted-foreground">No LMS connections registered.</p>}</CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>SCORM status</CardTitle></CardHeader>
              <CardContent><Alert><AlertTitle>Not yet declared compatible</AlertTitle><AlertDescription>SCORM import/runtime is intentionally not marked supported until package isolation, manifest validation, runtime API persistence and conformance tests are implemented. LTI 1.3 is the active interoperability path on this branch.</AlertDescription></Alert></CardContent>
            </Card>
          </div>
        </div>}
      </main>
      <Footer />
    </>
  );
}
