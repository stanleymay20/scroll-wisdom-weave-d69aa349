/**
 * CONTRACT 6C — CERTIFICATE GENERATOR WITH ELIGIBILITY GATE
 * 
 * Consumes 6A (Authority) and 6C (Eligibility) to determine
 * if and which certificate a learner may receive.
 */

import { useState, useMemo } from 'react';
import { Award, FileCheck, Loader2, AlertCircle, Clock, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  createCertificate, 
  Certificate, 
  CertificateRecipient,
  CERTIFICATE_TYPES,
  CertificateType 
} from '@/lib/certificateAuthority';
import {
  evaluateCertificateEligibility,
  getEligibilityStatusText,
  getEligibilityStatusColor,
  shouldEnableCertificateButton,
  createDefaultProgress,
  BookProgress,
  CertificateEligibilityResult,
  ELIGIBILITY_THRESHOLDS,
} from '@/lib/certificateEligibility';
import { CertificateDisplay } from './CertificateDisplay';

interface CertificateGeneratorProps {
  bookId: string;
  bookTitle: string;
  bookType: string;
  chaptersCompleted: number;
  totalChapters: number;
  wordCount?: number;
  learningLevel?: string;
  userId: string;
  userName: string;
  userEmail?: string;
  progressPercent: number;
  /** Assessment data for eligibility check */
  averageScore?: number;
  integrityScore?: number;
  quizzesRequired?: number;
  quizzesSubmitted?: number;
  hasRejectFlags?: boolean;
  hasReviewFlags?: boolean;
  lastMasteryAttempt?: Date | null;
  onCertificateGenerated?: (certificate: Certificate) => void;
}

export function CertificateGenerator({
  bookId,
  bookTitle,
  bookType,
  chaptersCompleted,
  totalChapters,
  wordCount,
  learningLevel,
  userId,
  userName,
  userEmail,
  progressPercent,
  averageScore = 0,
  integrityScore = 1.0,
  quizzesRequired = 0,
  quizzesSubmitted = 0,
  hasRejectFlags = false,
  hasReviewFlags = false,
  lastMasteryAttempt = null,
  onCertificateGenerated,
}: CertificateGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const { toast } = useToast();

  // 6C.1 — Evaluate eligibility using pure function
  const eligibility: CertificateEligibilityResult = useMemo(() => {
    const progress: BookProgress = {
      totalChapters,
      completedChapters: chaptersCompleted,
      quizzesRequired,
      quizzesSubmitted,
      averageScore: averageScore / 100, // Convert to 0-1 scale
      integrityScore: {
        overall: integrityScore,
        typing: integrityScore,
        focus: integrityScore,
        timing: integrityScore,
        paste: integrityScore,
      },
      integrityClassification: integrityScore >= 0.9 ? 'trusted' : integrityScore >= 0.6 ? 'review' : 'reject',
      hasRejectFlags,
      hasReviewFlags,
      masteryRequirementsMet: learningLevel === 'mastery' && averageScore >= 90,
      lastMasteryAttempt,
    };
    return evaluateCertificateEligibility(progress);
  }, [
    totalChapters, chaptersCompleted, quizzesRequired, quizzesSubmitted,
    averageScore, integrityScore, hasRejectFlags, hasReviewFlags,
    learningLevel, lastMasteryAttempt
  ]);

  // 6C.5 — UI Enforcement: Button state
  const canGenerate = shouldEnableCertificateButton(eligibility);
  const selectedType = eligibility.certificateType || 'completion';

  const handleGenerate = async () => {
    // 6C.5 — Never allow manual override
    if (!canGenerate) {
      toast({
        title: 'Not eligible',
        description: eligibility.reasons[0] || 'Complete requirements to unlock certificate.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Simulate server-side revalidation
      await new Promise(resolve => setTimeout(resolve, 1500));

      const recipient: CertificateRecipient = {
        name: userName,
        email: userEmail,
        userId,
      };

      const newCertificate = await createCertificate(recipient, {
        bookTitle,
        bookType,
        completionDate: new Date(),
        wordCount,
        chaptersCompleted,
        totalChapters,
        learningLevel,
      });

      setCertificate(newCertificate);
      onCertificateGenerated?.(newCertificate);

      toast({
        title: 'Certificate Generated! 🎉',
        description: `Your ${CERTIFICATE_TYPES[selectedType].displayName} has been created and verified.`,
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: 'Unable to generate certificate. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!certificate) return;
    toast({
      title: 'Download Started',
      description: 'Your certificate PDF is being prepared...',
    });
  };

  if (certificate) {
    return (
      <div className="space-y-6">
        <CertificateDisplay 
          certificate={certificate} 
          certificateType={selectedType}
          onDownload={handleDownload}
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setCertificate(null)}>
            View Eligibility Status
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Certificate of Achievement
        </CardTitle>
        <CardDescription>
          {getEligibilityStatusText(eligibility)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Eligibility Status Alert */}
        {!eligibility.eligible && (
          <Alert variant={eligibility.blockedByCooldown ? 'default' : 'destructive'}>
            {eligibility.blockedByCooldown ? (
              <Clock className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              <div className="space-y-1">
                {eligibility.reasons.map((reason, i) => (
                  <p key={i} className="text-sm">{reason}</p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Status */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Book Progress</span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {chaptersCompleted} of {totalChapters} chapters completed
          </p>
        </div>

        {/* Integrity Score */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Integrity Score</span>
            <span className={`text-sm font-medium ${
              integrityScore >= 0.9 ? 'text-green-600' : 
              integrityScore >= 0.6 ? 'text-amber-600' : 'text-destructive'
            }`}>
              {Math.round(integrityScore * 100)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                integrityScore >= 0.9 ? 'bg-green-500' : 
                integrityScore >= 0.6 ? 'bg-amber-500' : 'bg-destructive'
              }`}
              style={{ width: `${integrityScore * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Mastery requires ≥{ELIGIBILITY_THRESHOLDS.mastery.MIN_INTEGRITY * 100}% integrity
          </p>
        </div>

        {/* Certificate Type Display */}
        {eligibility.eligible && (
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-3">
              <FileCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">
                  {eligibility.certificateType === 'mastery' 
                    ? 'Mastery Certificate Available' 
                    : 'Completion Certificate Available'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {eligibility.certificateType === 'mastery'
                    ? 'You have demonstrated mastery-level understanding'
                    : 'Complete all chapters to receive your certificate'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 6C.5 — Generate Button (disabled unless eligible) */}
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Certificate...
            </>
          ) : canGenerate ? (
            <>
              <Award className="h-4 w-4 mr-2" />
              Generate {eligibility.certificateType === 'mastery' ? 'Mastery' : 'Completion'} Certificate
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Complete Requirements to Unlock
            </>
          )}
        </Button>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground text-center">
          Certificates are issued by ScrollLibrary Certification Authority and include 
          verifiable credentials with unique publishing codes.
        </p>
      </CardContent>
    </Card>
  );
}
