import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

interface LtiClaimResponse {
  ok: boolean;
  organization_id: string;
  roles: string[];
  context: Record<string, unknown>;
  resource_link: Record<string, unknown>;
  custom: Record<string, unknown>;
}

type ClaimState =
  | { status: 'claiming'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export default function UniversityLtiClaim() {
  const [params] = useSearchParams();
  const { setActiveOrgId, refresh } = useOrganization();
  const launchToken = params.get('lti_launch');
  const started = useRef(false);
  const [claim, setClaim] = useState<ClaimState>({
    status: 'claiming',
    message: 'Validating your university launch…',
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!launchToken) {
      setClaim({ status: 'error', message: 'The LMS launch token is missing.' });
      return;
    }

    void (async () => {
      const { data, error } = await supabase.functions.invoke<LtiClaimResponse>('university-lti-claim', {
        body: { launch_token: launchToken },
      });

      if (error || !data?.ok || !data.organization_id) {
        setClaim({
          status: 'error',
          message: error?.message || 'The LTI launch could not be linked to your ScrollUniversity account.',
        });
        return;
      }

      await refresh();
      setActiveOrgId(data.organization_id);
      window.history.replaceState({}, '', '/university');
      setClaim({
        status: 'success',
        message: 'Your LMS launch is verified and linked to your institutional identity.',
      });
    })();
  }, [launchToken, refresh, setActiveOrgId]);

  return (
    <>
      <Navbar />
      <main className="container mx-auto max-w-2xl px-4 pt-24 pb-16">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              <CardTitle>ScrollUniversity LMS launch</CardTitle>
            </div>
            <CardDescription>
              LTI 1.3 launches are cryptographically verified before they are attached to a university account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {claim.status === 'claiming' && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Verifying launch</AlertTitle>
                <AlertDescription>{claim.message}</AlertDescription>
              </Alert>
            )}
            {claim.status === 'success' && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>LMS launch verified</AlertTitle>
                <AlertDescription>{claim.message}</AlertDescription>
              </Alert>
            )}
            {claim.status === 'error' && (
              <Alert variant="destructive">
                <AlertTitle>Launch could not be completed</AlertTitle>
                <AlertDescription>{claim.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button asChild disabled={claim.status === 'claiming'}>
                <Link to="/university">Open ScrollUniversity</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/organizations">Institution access</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </>
  );
}
