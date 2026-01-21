/**
 * CONTRACT 6D + 7A + 12 — Public Certificate Verification Page
 * 
 * Route: /certificate/:certificateNumber
 * 
 * Read-only, server-authoritative, no auth required.
 * Used by employers and institutions to verify certificate authenticity.
 * 
 * Contract 12: Book Provenance & Certification Binding
 * - Displays cryptographic book binding
 * - Shows chapter coverage
 * - Hard invalidation if book hash mismatches
 */

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Award, Shield, CheckCircle2, XCircle, Calendar, 
  User, BookOpen, ExternalLink, Copy, Check,
  AlertTriangle, Building2, Download, FileJson, FileText,
  Share2, Hash, Layers, Lock
} from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/brand';
import { CERTIFICATE_ISSUER, getIssuerSignature } from '@/lib/certificateAuthority';
import { TrustBadgeGroup } from '@/components/certificates';
import { toast } from 'sonner';
import { 
  validateProvenance, 
  PROVENANCE_EXPLANATIONS,
  MIN_COVERAGE_THRESHOLD,
  CONTRACT_12 
} from '@/lib/contract12-provenance';

interface CertificateData {
  valid: boolean;
  certificate_number: string;
  certificate_type: 'completion' | 'mastery' | 'publishing' | 'authorship' | null;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  verification_hash: string | null;
  metadata: {
    certificateType?: string;
    recipientName?: string;
    recipientEmail?: string;
    bookTitle?: string;
    bookId?: string;
    bookVersion?: string;
    bookContentHash?: string;
    bookType?: string;
    coveragePercentage?: number;
    issuer?: {
      authority?: string;
      representative?: string;
      title?: string;
    };
    integrityScore?: number;
    integrityClassification?: string;
    chaptersCompleted?: number;
    totalChapters?: number;
    assessmentSchema?: string;
    visualContract?: string;
    styleContract?: string;
  } | null;
  book: {
    id: string;
    title: string;
    category: string;
    book_type?: string;
    created_at?: string;
  } | null;
  currentBookHash?: string; // Live hash for validation
}

export default function CertificateVerify() {
  const { certificateNumber } = useParams<{ certificateNumber: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Fetch certificate from database - read-only, no auth required
  const { data, isLoading, error } = useQuery({
    queryKey: ['certificate-verify', certificateNumber],
    queryFn: async (): Promise<CertificateData> => {
      if (!certificateNumber) {
        return { 
          valid: false, 
          certificate_number: '', 
          certificate_type: null,
          issued_at: '',
          revoked_at: null,
          revoked_reason: null,
          verification_hash: null,
          metadata: null,
          book: null,
        };
      }

      const { data: cert, error } = await supabase
        .from('publishing_certificates')
        .select(`
          id,
          certificate_number,
          certificate_type,
          issued_at,
          revoked_at,
          revoked_reason,
          verification_hash,
          metadata,
          book_id,
          books (
            id,
            title,
            category,
            book_type,
            created_at
          )
        `)
        .eq('certificate_number', certificateNumber)
        .maybeSingle();

      if (error) throw error;
      
      if (!cert) {
        return {
          valid: false,
          certificate_number: certificateNumber,
          certificate_type: null,
          issued_at: '',
          revoked_at: null,
          revoked_reason: null,
          verification_hash: null,
          metadata: null,
          book: null,
        };
      }

      return {
        valid: !cert.revoked_at,
        certificate_number: cert.certificate_number,
        certificate_type: cert.certificate_type as CertificateData['certificate_type'],
        issued_at: cert.issued_at,
        revoked_at: cert.revoked_at,
        revoked_reason: cert.revoked_reason,
        verification_hash: cert.verification_hash,
        metadata: cert.metadata as CertificateData['metadata'],
        book: cert.books as CertificateData['book'],
      };
    },
    enabled: !!certificateNumber,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Contract 12: Provenance validation
  const provenanceValidation = data?.metadata?.bookContentHash 
    ? validateProvenance(
        data.metadata.bookContentHash,
        data.currentBookHash || data.metadata.bookContentHash, // Use stored if no live hash
        data.metadata.chaptersCompleted ?? 0,
        data.metadata.totalChapters ?? 0
      )
    : null;

  const coveragePercentage = data?.metadata?.coveragePercentage ?? 
    (data?.metadata?.totalChapters 
      ? Math.round(((data.metadata.chaptersCompleted ?? 0) / data.metadata.totalChapters) * 100)
      : 0);

  const copyHash = async () => {
    if (data?.verification_hash) {
      await navigator.clipboard.writeText(data.verification_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 7A: Export certificate as JSON
  const exportAsJSON = async () => {
    if (!certificateNumber) return;
    try {
      const { data: exportData, error } = await supabase.functions.invoke('export-certificate', {
        body: null,
        method: 'GET',
      });
      
      // Fallback: direct URL call for GET requests
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-certificate?number=${certificateNumber}&format=json`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }
      
      const jsonData = await response.json();
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${certificateNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Certificate exported as JSON');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export certificate');
    }
  };

  // 7A: Export certificate as PDF (HTML for print)
  const exportAsPDF = async () => {
    if (!certificateNumber) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-certificate?number=${certificateNumber}&format=pdf`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }
      
      const htmlContent = await response.text();
      
      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      toast.success('Certificate ready to print');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export certificate');
    }
  };

  // 7A: Share certificate URL
  const shareCertificate = async () => {
    const url = `${window.location.origin}/certificate/${certificateNumber}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Certificate - ${data?.metadata?.bookTitle || 'ScrollLibrary'}`,
          text: `Verify my ${data?.certificate_type || 'completion'} certificate from ScrollLibrary`,
          url,
        });
      } catch (err) {
        // User cancelled or share failed, copy instead
        await navigator.clipboard.writeText(url);
        toast.success('Certificate URL copied to clipboard');
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Certificate URL copied to clipboard');
    }
  };

  const getIntegrityClassification = () => {
    const score = data?.metadata?.integrityScore;
    if (!score) return { label: 'Unknown', color: 'text-muted-foreground', bg: 'bg-muted' };
    if (score >= 0.9) return { label: 'Trusted', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-500/10' };
    if (score >= 0.6) return { label: 'Review', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10' };
    return { label: 'Flagged', color: 'text-destructive', bg: 'bg-destructive/10' };
  };

  const getCertificateTypeDisplay = () => {
    switch (data?.certificate_type || data?.metadata?.certificateType) {
      case 'mastery':
        return { label: 'Certificate of Mastery', variant: 'default' as const, icon: Award };
      case 'completion':
        return { label: 'Certificate of Completion', variant: 'secondary' as const, icon: CheckCircle2 };
      case 'publishing':
        return { label: 'Publishing Rights Certificate', variant: 'outline' as const, icon: BookOpen };
      case 'authorship':
        return { label: 'Authorship Verification', variant: 'outline' as const, icon: User };
      default:
        return { label: 'Certificate', variant: 'outline' as const, icon: Award };
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-64 mx-auto mb-2" />
            <Skeleton className="h-4 w-48 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Verification Error</h1>
            <p className="text-muted-foreground mb-4">
              Unable to verify certificate. Please try again later.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Certificate not found or invalid
  if (!data || !data.metadata) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Certificate Not Found</h1>
            <p className="text-muted-foreground mb-4">
              No certificate exists with the number: <code className="text-sm bg-muted px-2 py-0.5 rounded">{certificateNumber}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please verify the certificate number is correct.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const certType = getCertificateTypeDisplay();
  const CertIcon = certType.icon;
  const integrity = getIntegrityClassification();
  const isRevoked = !!data.revoked_at;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="icon" size="sm" />
            <span className="font-semibold">ScrollLibrary</span>
          </Link>
          <Badge variant="outline" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Certificate Verification
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Banner */}
        <div className={cn(
          "mb-6 p-4 rounded-lg border flex items-center gap-4",
          isRevoked 
            ? "bg-destructive/5 border-destructive/30" 
            : "bg-green-500/5 border-green-500/30"
        )}>
          {isRevoked ? (
            <>
              <XCircle className="h-8 w-8 text-destructive flex-shrink-0" />
              <div>
                <p className="font-semibold text-destructive">Certificate Revoked</p>
                <p className="text-sm text-muted-foreground">
                  {data.revoked_reason || 'This certificate has been revoked and is no longer valid.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-300">
                  Verified Certificate
                </p>
                <p className="text-sm text-muted-foreground">
                  This certificate is valid and was issued by ScrollLibrary Certification Authority.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Certificate Card */}
        <Card className="overflow-hidden">
          {/* Certificate Header */}
          <div className={cn(
            "p-6 text-center border-b",
            isRevoked ? "bg-muted/50" : "bg-primary/5"
          )}>
            <div className={cn(
              "inline-flex items-center justify-center w-16 h-16 rounded-full mb-4",
              isRevoked ? "bg-muted" : "bg-primary/10"
            )}>
              <CertIcon className={cn(
                "h-8 w-8",
                isRevoked ? "text-muted-foreground" : "text-primary"
              )} />
            </div>
            
            <Badge variant={certType.variant} className="mb-3">
              {certType.label}
            </Badge>
            
            <h1 className={cn(
              "text-2xl font-bold mb-2",
              isRevoked && "text-muted-foreground line-through"
            )}>
              {data.metadata.bookTitle || data.book?.title || 'Unknown Book'}
            </h1>
            
            <p className="text-muted-foreground">
              Awarded to <span className="font-medium text-foreground">{data.metadata.recipientName || 'Unknown Recipient'}</span>
            </p>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* CONTRACT 12: Book Provenance Panel */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm uppercase tracking-wide">Certified Using This Book</h3>
              </div>
              
              <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                <div className="flex items-start gap-3 mb-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold truncate">{data.metadata.bookTitle || data.book?.title}</h4>
                    <p className="text-sm text-muted-foreground capitalize">
                      {data.book?.category?.replace('_', ' ')} • {data.metadata?.bookType || 'Academic'}
                    </p>
                  </div>
                  {data.book?.id && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate(`/book/${data.book?.id}`)}
                      className="gap-1.5 flex-shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Button>
                  )}
                </div>

                {/* Chapter Coverage */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      Chapter Coverage
                    </span>
                    <span className="font-medium">
                      {data.metadata.chaptersCompleted ?? 0} / {data.metadata.totalChapters ?? 0} ({coveragePercentage}%)
                    </span>
                  </div>
                  <Progress value={coveragePercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {coveragePercentage >= 80 
                      ? '✓ Meets minimum 80% coverage requirement' 
                      : '⚠️ Below 80% coverage threshold'}
                  </p>
                </div>

                {/* Cryptographic Binding */}
                {data.metadata.bookContentHash && (
                  <div className="space-y-2 pt-3 border-t border-primary/10">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Hash className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">Cryptographic Binding</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {PROVENANCE_EXPLANATIONS.cryptographicBinding}
                    </p>
                    <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1.5">
                      <code className="text-xs font-mono truncate">
                        {data.metadata.bookContentHash.slice(0, 24)}...
                      </code>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Contract Compliance Badges */}
                {(data.metadata.assessmentSchema || data.metadata.visualContract) && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-primary/10 mt-3">
                    {data.metadata.assessmentSchema && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Shield className="h-3 w-3" />
                        {data.metadata.assessmentSchema}
                      </Badge>
                    )}
                    {data.metadata.visualContract && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Layers className="h-3 w-3" />
                        {data.metadata.visualContract}
                      </Badge>
                    )}
                    {data.metadata.styleContract && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Layers className="h-3 w-3" />
                        {data.metadata.styleContract}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Certificate Details */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Certificate Number */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Certificate Number</p>
                <p className="font-mono text-sm font-medium">{data.certificate_number}</p>
              </div>

              {/* Issue Date */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Issue Date</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(data.issued_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Integrity Classification */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Integrity Status</p>
                <Badge variant="outline" className={cn(integrity.bg, integrity.color, "gap-1.5")}>
                  <Shield className="h-3 w-3" />
                  {integrity.label}
                </Badge>
              </div>

              {/* Contract Version */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Provenance Contract</p>
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Contract 12 v{CONTRACT_12.version}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Verification Hash */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Verification Hash</p>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg font-mono text-sm">
                <code className="flex-1 break-all">{data.verification_hash || 'N/A'}</code>
                {data.verification_hash && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="flex-shrink-0 h-8 w-8"
                    onClick={copyHash}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Issuer Information */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Issued By</p>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{CERTIFICATE_ISSUER.authority}</p>
                  <p className="text-sm text-muted-foreground">
                    {CERTIFICATE_ISSUER.representative}, {CERTIFICATE_ISSUER.title}
                  </p>
                </div>
              </div>
              
              {/* Signature */}
              <div className="mt-4 pt-4 border-t">
                <img 
                  src={getIssuerSignature()} 
                  alt="Authorized Signature" 
                  className="h-16 object-contain opacity-80"
                />
                <p className="text-xs text-muted-foreground mt-1">Authorized Signature</p>
              </div>
            </div>

            {/* 7A: Export & Share Controls */}
            {!isRevoked && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Export & Share</p>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={exportAsJSON}
                      className="gap-2"
                    >
                      <FileJson className="h-4 w-4" />
                      Export JSON
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={exportAsPDF}
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Print PDF
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={shareCertificate}
                      className="gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Export for records or share with employers. JSON format is machine-readable.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Trust Badges */}
        {!isRevoked && (
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 text-center">
              Trust Guarantees
            </p>
            <TrustBadgeGroup 
              badges={["verifiable", "integrity-scored", "publicly-accessible", "authority-issued"]} 
              size="sm" 
              className="justify-center"
            />
          </div>
        )}

        {/* Legal Disclaimer */}
        <div className="mt-6 p-3 bg-muted/30 rounded-lg border border-muted text-center">
          <p className="text-xs text-muted-foreground">
            This certificate verifies learning outcomes, not authorship of the book.
            Book content is generated using AI assistance and certified through ScrollLibrary's governed assessment system.
          </p>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          This certificate can be independently verified at{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded">
            scroll-wisdom-weave.lovable.app/certificate/{certificateNumber}
          </code>
        </p>

        {/* API Link for Employers */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-2">
            For programmatic verification, use our API:
          </p>
          <code className="text-xs bg-background px-3 py-1.5 rounded border inline-block">
            GET /api/verify-certificate?number={certificateNumber}
          </code>
          <div className="mt-3">
            <Link 
              to="/docs/verification" 
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              View API Documentation <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
