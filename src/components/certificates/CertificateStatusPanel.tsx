/**
 * CONTRACT 6C — Certificate Status Panel for BookDetail
 * 
 * Shows eligibility status, integrity score, and certificate CTA.
 * Does NOT issue certificates — only links to CertificateGenerator.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Award, Shield, Lock, ChevronRight, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  evaluateCertificateEligibility,
  getEligibilityStatusText,
  getEligibilityStatusColor,
  createDefaultProgress,
  BookProgress,
  CertificateEligibilityResult,
} from '@/lib/certificateEligibility';

interface CertificateStatusPanelProps {
  bookId: string;
  bookTitle: string;
  totalChapters: number;
  completedChapters: number;
  progressPercent: number;
  /** Optional: Assessment data for full eligibility calculation */
  averageScore?: number;
  integrityScore?: number;
  quizzesRequired?: number;
  quizzesSubmitted?: number;
  hasRejectFlags?: boolean;
  hasReviewFlags?: boolean;
  lastMasteryAttempt?: Date | null;
  className?: string;
}

export function CertificateStatusPanel({
  bookId,
  bookTitle,
  totalChapters,
  completedChapters,
  progressPercent,
  averageScore = 0,
  integrityScore = 1.0,
  quizzesRequired = 0,
  quizzesSubmitted = 0,
  hasRejectFlags = false,
  hasReviewFlags = false,
  lastMasteryAttempt = null,
  className,
}: CertificateStatusPanelProps) {
  // Calculate eligibility using the pure function from Contract 6C
  const eligibility: CertificateEligibilityResult = useMemo(() => {
    const progress: BookProgress = {
      totalChapters,
      completedChapters,
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
      masteryRequirementsMet: averageScore >= 90 && integrityScore >= 0.9,
      lastMasteryAttempt,
    };
    return evaluateCertificateEligibility(progress);
  }, [
    totalChapters, completedChapters, quizzesRequired, quizzesSubmitted,
    averageScore, integrityScore, hasRejectFlags, hasReviewFlags, lastMasteryAttempt
  ]);

  // Determine badge variant and icon
  const getBadgeInfo = () => {
    if (eligibility.eligible && eligibility.certificateType === 'mastery') {
      return { 
        variant: 'default' as const, 
        icon: Award, 
        text: 'Mastery Ready',
        className: 'bg-primary text-primary-foreground'
      };
    }
    if (eligibility.eligible && eligibility.certificateType === 'completion') {
      return { 
        variant: 'secondary' as const, 
        icon: CheckCircle2, 
        text: 'Completion Ready',
        className: 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30'
      };
    }
    if (eligibility.blockedByCooldown) {
      return { 
        variant: 'outline' as const, 
        icon: Clock, 
        text: 'Cooldown Active',
        className: 'border-amber-500/50 text-amber-600 dark:text-amber-400'
      };
    }
    return { 
      variant: 'outline' as const, 
      icon: Lock, 
      text: 'In Progress',
      className: 'border-muted-foreground/30 text-muted-foreground'
    };
  };

  const badgeInfo = getBadgeInfo();
  const BadgeIcon = badgeInfo.icon;

  // Integrity score color
  const getIntegrityColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
  };

  const getIntegrityBarColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-500';
    if (score >= 0.6) return 'bg-amber-500';
    return 'bg-destructive';
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-primary" />
            Certificate Status
          </CardTitle>
          <Badge variant={badgeInfo.variant} className={badgeInfo.className}>
            <BadgeIcon className="h-3.5 w-3.5 mr-1" />
            {badgeInfo.text}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Book Progress</span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {completedChapters} of {totalChapters} chapters completed
          </p>
        </div>

        {/* Integrity Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Integrity Score
            </span>
            <span className={cn("font-medium", getIntegrityColor(integrityScore))}>
              {Math.round(integrityScore * 100)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-500", getIntegrityBarColor(integrityScore))}
              style={{ width: `${integrityScore * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {integrityScore >= 0.9 
              ? 'Eligible for Mastery Certificate' 
              : integrityScore >= 0.6 
                ? 'Eligible for Completion Certificate' 
                : 'Improve integrity to unlock certificates'}
          </p>
        </div>

        {/* Status Message */}
        <div className={cn(
          "p-3 rounded-lg text-sm",
          eligibility.eligible 
            ? "bg-primary/5 border border-primary/20" 
            : "bg-muted/50"
        )}>
          <p className={getEligibilityStatusColor(eligibility)}>
            {getEligibilityStatusText(eligibility)}
          </p>
          
          {/* Show first reason if not eligible */}
          {!eligibility.eligible && eligibility.reasons.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {eligibility.reasons[0]}
            </p>
          )}
          
          {/* Show retry time if in cooldown */}
          {eligibility.blockedByCooldown && eligibility.canRetryAt && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Retry available: {eligibility.canRetryAt.toLocaleString()}
            </p>
          )}
        </div>

        {/* CTA Button - Links to full Certificate Generator */}
        <Button 
          asChild
          variant={eligibility.eligible ? "hero" : "outline"}
          className="w-full"
          disabled={!eligibility.eligible && progressPercent < 100}
        >
          <Link 
            to={`/book/${bookId}/certificate`}
            className="flex items-center justify-center"
          >
            {eligibility.eligible ? (
              <>
                <Award className="h-4 w-4 mr-2" />
                View Certificate Status
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Certificate Locked
              </>
            )}
          </Link>
        </Button>

        {/* Authority Note */}
        <p className="text-xs text-muted-foreground text-center">
          Certificates issued by ScrollLibrary Certification Authority
        </p>
      </CardContent>
    </Card>
  );
}
