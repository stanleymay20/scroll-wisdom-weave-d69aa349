/**
 * CONTRACT 6A — LEARNING RECORD DISPLAY COMPONENT
 *
 * Client-side certificate objects are previews only. Public validity comes only
 * from the server-authoritative verify-certificate function. This component must
 * therefore never infer "Verified & Valid" from local issuer fields alone.
 */

import { format } from 'date-fns';
import { Award, AlertTriangle, CheckCircle, Download, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Certificate,
  CERTIFICATE_ISSUER,
  CERTIFICATE_TYPES,
  CertificateType,
  validateCertificateIntegrity,
} from '@/lib/certificateAuthority';
import { CertificationEmblem } from './CertificationEmblem';
import { CompetencyManifestDisplay } from './CompetencyManifestDisplay';
import { CertifiedBookSeal } from './CertifiedBookSeal';
import { BookProvenancePanel, BookProvenanceData } from './BookProvenancePanel';
import { generateCompetencyManifest } from '@/lib/competencyManifest';

export type ServerVerificationStatus = 'valid' | 'invalid' | 'revoked' | 'unverifiable';

interface CertificateDisplayProps {
  certificate: Certificate;
  certificateType?: CertificateType;
  verificationStatus?: ServerVerificationStatus;
  onDownload?: () => void;
  onViewBook?: () => void;
  compact?: boolean;
  showManifest?: boolean;
  showProvenance?: boolean;
  manifestData?: {
    learningObjectives: string[];
    skills: { name: string; category: string }[];
    assessmentBreakdown: { tier: number; count: number; correct: number }[];
    overallScore: number;
    integrityScore: number;
    difficultyLevel: string;
    domain?: string;
  };
  provenanceData?: BookProvenanceData;
}

export function CertificateDisplay({
  certificate,
  certificateType = 'completion',
  verificationStatus = 'unverifiable',
  onDownload,
  onViewBook,
  compact = false,
  showManifest = true,
  showProvenance = true,
  manifestData,
  provenanceData,
}: CertificateDisplayProps) {
  const localIssuerIntegrity = validateCertificateIntegrity(certificate);
  const typeConfig = CERTIFICATE_TYPES[certificateType];
  const serverValid = verificationStatus === 'valid';

  const manifest = manifestData ? generateCompetencyManifest({
    bookId: certificate.id,
    bookTitle: certificate.content.bookTitle,
    bookType: certificate.content.bookType || 'text',
    domain: manifestData.domain || certificate.content.bookType || 'General',
    totalChapters: certificate.content.totalChapters,
    completedChapters: certificate.content.chaptersCompleted,
    learningObjectives: manifestData.learningObjectives,
    skills: manifestData.skills,
    assessmentResults: manifestData.assessmentBreakdown.map(ab => ({
      tier: ab.tier as 1 | 2 | 3 | 4,
      questionCount: ab.count,
      correctCount: ab.correct,
    })),
    integrityScore: manifestData.integrityScore / 100,
    integritySignals: [],
    certificateType,
    certificateId: certificate.id,
  }) : null;

  const statusBadge = serverValid ? (
    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
      <CheckCircle className="h-3 w-3 mr-1" />Server Verified
    </Badge>
  ) : (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
      <AlertTriangle className="h-3 w-3 mr-1" />{verificationStatus === 'revoked' ? 'Revoked' : verificationStatus === 'invalid' ? 'Invalid' : 'Preview / Unverifiable'}
    </Badge>
  );

  if (compact) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{typeConfig.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{certificate.content.bookTitle}</p>
              </div>
            </div>
            {statusBadge}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-4 border-double border-primary/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary" />
      <CardContent className="p-8 md:p-12">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><CertificationEmblem size="lg" /></div>
          <h2 className="text-lg font-semibold text-primary tracking-wide uppercase">{CERTIFICATE_ISSUER.authority}</h2>
          <p className="text-sm text-muted-foreground mt-1">{serverValid ? 'Server-Verified Learning Record' : 'Learning Record Preview'}</p>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{typeConfig.displayName}</h1>
          <div className="w-24 h-0.5 bg-primary mx-auto mt-4" />
        </div>

        <div className="text-center mb-8">
          <p className="text-muted-foreground mb-2">Recorded for</p>
          <p className="text-2xl md:text-3xl font-serif font-bold text-primary">{certificate.recipient.name}</p>
          <p className="text-muted-foreground mt-4">in connection with</p>
          <p className="text-xl font-semibold mt-2">“{certificate.content.bookTitle}”</p>
          <p className="text-sm text-muted-foreground mt-2">
            {certificate.content.chaptersCompleted} of {certificate.content.totalChapters} chapters
            {certificate.content.wordCount ? ` • ${certificate.content.wordCount.toLocaleString()} words` : ''}
          </p>
        </div>

        <div className="mb-8">
          <CertifiedBookSeal
            bookTitle={certificate.content.bookTitle}
            bookType={certificate.content.bookType || 'text'}
            version={provenanceData?.bookVersion}
            onViewBook={onViewBook}
            variant="compact"
          />
        </div>

        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground mb-2">Record includes:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {typeConfig.grantedRights.map((item) => (
              <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mt-12 pt-8 border-t border-primary/20">
          <div className="text-center">
            <div className="h-20 flex items-center justify-center mb-2">
              <img src={CERTIFICATE_ISSUER.signatureImage} alt="Authorized issuer signature" className="h-16 md:h-20 object-contain dark:invert" />
            </div>
            <div className="border-t border-foreground/30 pt-2 inline-block px-8">
              <p className="font-semibold text-sm">{CERTIFICATE_ISSUER.representative}</p>
              <p className="text-xs text-muted-foreground">{CERTIFICATE_ISSUER.title}</p>
              <p className="text-xs text-muted-foreground">{CERTIFICATE_ISSUER.authority}</p>
            </div>
          </div>

          <div className="text-center">
            <div className="h-20 flex items-center justify-center mb-2">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Record Date</p>
                <p className="text-lg font-semibold">{format(certificate.issuedAt, 'MMMM d, yyyy')}</p>
              </div>
            </div>
            <div className="border-t border-foreground/30 pt-2 inline-block px-8">
              <p className="font-mono text-xs text-muted-foreground">SPC: {certificate.scrollPublishingCode}</p>
              <p className="font-mono text-xs text-muted-foreground">Local reference: {certificate.verificationHash}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">{statusBadge}</div>
        {!localIssuerIntegrity && (
          <p className="mt-3 text-center text-xs text-destructive">Local record structure failed issuer-integrity checks.</p>
        )}

        {showProvenance && provenanceData && (
          <div className="mt-8 pt-6 border-t border-primary/20">
            <BookProvenancePanel provenance={provenanceData} onViewBook={onViewBook} compact={false} />
          </div>
        )}

        {showManifest && manifest && (
          <div className="mt-8 pt-6 border-t border-primary/20">
            <CompetencyManifestDisplay manifest={manifest} compact={true} />
          </div>
        )}

        {onDownload && (
          <div className="flex justify-center mt-6">
            <Button onClick={onDownload} variant="outline" className="gap-2"><Download className="h-4 w-4" />Download Record</Button>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-primary/10 text-center">
          <div className="flex items-center justify-center gap-2 mb-2"><Shield className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-xs text-muted-foreground">
            Public validity must be confirmed through the server verification route. This record is not an accredited degree, professional licence, copyright grant, or employment-eligibility determination.
          </p>
        </div>
      </CardContent>
      <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary" />
    </Card>
  );
}