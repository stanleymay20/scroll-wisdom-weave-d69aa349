import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Hash,
  Lock,
  Shield,
  User,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Logo } from '@/components/brand';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * CONTRACT 6D + 7A + 12 — Public Learning Record Verification
 *
 * This page has no independent validity logic. It renders the decision returned
 * by the server-authoritative verify-certificate function, which recomputes the
 * current book SHA-256 and applies revocation/provenance/coverage/integrity rules.
 */

type VerificationStatus = 'valid' | 'invalid' | 'revoked' | 'unverifiable' | 'not_found';

interface VerificationResponse {
  found: boolean;
  status: VerificationStatus;
  valid?: boolean;
  reasons?: string[];
  certificateNumber?: string;
  certificateType?: 'completion' | 'mastery' | 'publishing' | 'authorship' | null;
  issuedAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  holder?: string | null;
  coveragePercentage?: number;
  integrity?: { score?: number | null; classification?: string | null };
  assessment?: { contractVersion?: string | null; contractPassed?: boolean | null };
  provenance?: {
    contract?: string;
    storedHash?: string;
    currentHash?: string;
    hashMatch?: boolean;
  };
  verificationHash?: string | null;
  book?: {
    id?: string | null;
    title?: string | null;
    currentTitle?: string | null;
    category?: string | null;
    type?: string | null;
    version?: string | null;
  };
}

const TYPE_LABELS: Record<string, string> = {
  completion: 'Structured Study Completion Record',
  mastery: 'Mastery Learning Record',
  publishing: 'AI Content Generation Record',
  authorship: 'Content Generation Record',
};

const STATUS_COPY: Record<VerificationStatus, { title: string; description: string; icon: typeof CheckCircle2 }> = {
  valid: {
    title: 'Verified & Valid',
    description: 'The server revalidated the current book state and the stored learning evidence.',
    icon: CheckCircle2,
  },
  invalid: {
    title: 'Invalid',
    description: 'One or more required validity checks no longer pass.',
    icon: XCircle,
  },
  revoked: {
    title: 'Revoked',
    description: 'This learning record has been explicitly revoked.',
    icon: XCircle,
  },
  unverifiable: {
    title: 'Unverifiable',
    description: 'The available evidence is insufficient to prove validity. This is not shown as valid.',
    icon: AlertTriangle,
  },
  not_found: {
    title: 'Not Found',
    description: 'No ScrollLibrary learning record exists with this number.',
    icon: XCircle,
  },
};

function statusClasses(status: VerificationStatus): string {
  if (status === 'valid') return 'border-green-500/40 bg-green-500/5';
  if (status === 'unverifiable') return 'border-amber-500/40 bg-amber-500/5';
  return 'border-destructive/40 bg-destructive/5';
}

function statusIconClass(status: VerificationStatus): string {
  if (status === 'valid') return 'text-green-600 dark:text-green-400';
  if (status === 'unverifiable') return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}

export default function CertificateVerify() {
  const { certificateNumber } = useParams<{ certificateNumber: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['server-certificate-verification', certificateNumber],
    enabled: Boolean(certificateNumber),
    staleTime: 0,
    retry: 1,
    queryFn: async (): Promise<VerificationResponse> => {
      if (!certificateNumber) return { found: false, status: 'not_found' };
      const { data: response, error: invokeError } = await supabase.functions.invoke('verify-certificate', {
        body: { certificateNumber },
      });
      if (invokeError) {
        const context = (invokeError as any)?.context;
        if (context?.status === 404) return { found: false, status: 'not_found', certificateNumber };
        throw invokeError;
      }
      return response as VerificationResponse;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader className="space-y-3 text-center">
            <Skeleton className="h-16 w-16 rounded-full mx-auto" />
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-4 w-80 max-w-full mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-28 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10">
            <AlertTriangle className="h-14 w-14 text-amber-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Verification Unavailable</h1>
            <p className="text-muted-foreground mb-5">
              ScrollLibrary could not complete the server verification. No validity claim has been made.
            </p>
            <Button asChild variant="outline"><Link to="/">Return Home</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status: VerificationStatus = data?.status || 'unverifiable';
  const copy = STATUS_COPY[status];
  const StatusIcon = copy.icon;
  const typeLabel = data?.certificateType ? TYPE_LABELS[data.certificateType] || 'Learning Record' : 'Learning Record';
  const coverage = Number(data?.coveragePercentage ?? 0);
  const integrityScore = data?.integrity?.score;
  const integrityPercent = typeof integrityScore === 'number' ? Math.round(integrityScore * 100) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="icon" size="sm" />
            <span className="font-semibold">ScrollLibrary</span>
          </Link>
          <Badge variant="outline" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Server Verification</Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-8">
        <section className={cn('mb-6 rounded-xl border-2 p-6 shadow-sm', statusClasses(status))}>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-background/70 flex items-center justify-center shrink-0">
              <StatusIcon className={cn('h-8 w-8', statusIconClass(status))} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className={cn('text-2xl font-bold', statusIconClass(status))}>{copy.title}</h1>
              <p className="mt-1 text-muted-foreground">{copy.description}</p>
              {data?.reasons?.length ? (
                <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {data.reasons.map(reason => <li key={reason}>{reason}</li>)}
                </ul>
              ) : null}
              {status === 'revoked' && data?.revokedReason ? (
                <p className="mt-3 text-sm font-medium">{data.revokedReason}</p>
              ) : null}
            </div>
          </div>
        </section>

        {status === 'not_found' || !data?.found ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">Certificate number</p>
              <code className="mt-2 inline-block rounded bg-muted px-3 py-1 text-sm">{certificateNumber}</code>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-primary/5 text-center">
              <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Award className="h-7 w-7 text-primary" />
              </div>
              <Badge variant="outline" className="mx-auto mb-2">{typeLabel}</Badge>
              <CardTitle className="text-2xl">{data.book?.title || 'ScrollLibrary Learning Record'}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Holder: <span className="font-medium text-foreground">{data.holder || 'Not publicly disclosed'}</span>
              </p>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><BookOpen className="h-3.5 w-3.5" />Coverage</div>
                  <p className="mt-2 text-lg font-semibold">{coverage}%</p>
                  <Progress value={coverage} className="mt-2 h-2" />
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Shield className="h-3.5 w-3.5" />Integrity</div>
                  <p className="mt-2 text-lg font-semibold">{integrityPercent === null ? 'Unknown' : `${integrityPercent}%`}</p>
                  <p className="text-xs text-muted-foreground capitalize">{data.integrity?.classification || 'unknown'}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Calendar className="h-3.5 w-3.5" />Issued</div>
                  <p className="mt-2 text-sm font-semibold">{data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : 'Unknown'}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /><h2 className="font-semibold">Verification Evidence</h2></div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <span className="text-muted-foreground">Assessment contract</span>
                    <p className="font-medium">{data.assessment?.contractVersion || 'Unavailable'}</p>
                    <p className="text-xs text-muted-foreground">{data.assessment?.contractPassed ? 'Server-authoritative evidence present' : 'Not proven'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <span className="text-muted-foreground">Book provenance</span>
                    <p className="font-medium">{data.provenance?.contract || 'Unavailable'}</p>
                    <p className="text-xs text-muted-foreground">{data.provenance?.hashMatch === true ? 'Live SHA-256 matches issuance state' : data.provenance?.hashMatch === false ? 'SHA-256 mismatch' : 'Live comparison unavailable'}</p>
                  </div>
                </div>
              </div>

              {data.provenance?.storedHash ? (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium flex items-center gap-2"><Hash className="h-4 w-4" />Technical provenance</summary>
                  <div className="mt-3 space-y-2 text-xs font-mono break-all text-muted-foreground">
                    <p>Issued: {data.provenance.storedHash}</p>
                    {data.provenance.currentHash ? <p>Current: {data.provenance.currentHash}</p> : null}
                    {data.verificationHash ? <p>Verification token: {data.verificationHash}</p> : null}
                  </div>
                </details>
              ) : null}

              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <div className="flex gap-2"><User className="h-4 w-4 mt-0.5 shrink-0" /><p>This record documents ScrollLibrary learning evidence. It is not an accredited degree, professional licence, copyright grant, or employment-eligibility determination.</p></div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
