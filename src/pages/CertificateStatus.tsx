/**
 * CONTRACT 6C — Certificate Status Page
 * 
 * Displays certificate eligibility and generation for a specific book.
 * User must complete all chapters + quizzes + meet integrity requirements.
 */

import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, Shield, BookOpen, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CertificateGenerator } from "@/components/certificates/CertificateGenerator";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface BookWithProgress {
  id: string;
  title: string;
  total_chapters: number;
  creator_id: string | null;
  book_type: string;
}

interface ChapterProgress {
  id: string;
}

interface ReadingProgress {
  chapter_id: string;
  percent: number;
}

interface QuizAttempt {
  id: string;
  chapter_id: string;
  score: number;
  submitted_at: string | null;
  assessment_session_id: string | null;
}

interface IntegrityLog {
  quiz_attempt_id: string | null;
  integrity_score: number;
  severity: string | null;
  details: Record<string, unknown> | null;
}

const ASSESSMENT_CONTRACT_VERSION = 'ARC-1.0';

export default function CertificateStatus() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Fetch book details
  const { data: book, isLoading: bookLoading } = useQuery({
    queryKey: ['certificate-book', bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, total_chapters, creator_id, book_type')
        .eq('id', bookId)
        .single();
      
      if (error) throw error;
      return data as BookWithProgress;
    },
    enabled: !!bookId,
  });

  // Fetch user session
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    },
  });

  // Fetch chapter completion status
  const { data: chapters } = useQuery({
    queryKey: ['certificate-chapters', bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('id')
        .eq('book_id', bookId);
      
      if (error) throw error;
      return data as ChapterProgress[];
    },
    enabled: !!bookId,
  });

  // Contract 6C: reading evidence, not chapter generation state, determines coverage.
  const { data: readingProgress } = useQuery({
    queryKey: ['certificate-reading-progress', bookId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];

      const { data, error } = await supabase
        .from('reading_progress')
        .select('chapter_id, percent')
        .eq('book_id', bookId)
        .eq('user_id', session.user.id);

      if (error) throw error;
      return data as ReadingProgress[];
    },
    enabled: !!bookId && !!session?.user?.id,
  });

  // Fetch quiz attempts for this book
  const { data: quizAttempts } = useQuery({
    queryKey: ['certificate-quizzes', bookId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('id, chapter_id, score, submitted_at, assessment_session_id')
        .eq('book_id', bookId)
        .eq('user_id', session.user.id)
        .eq('assessment_contract_passed', true)
        .eq('assessment_contract_version', ASSESSMENT_CONTRACT_VERSION)
        .not('assessment_session_id', 'is', null)
        .order('submitted_at', { ascending: true });
      
      if (error) throw error;
      return data as QuizAttempt[];
    },
    enabled: !!bookId && !!session?.user?.id,
  });

  // Fetch integrity logs
  const { data: integrityLogs } = useQuery({
    queryKey: ['certificate-integrity', bookId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const { data, error } = await supabase
        .from('assessment_integrity_logs')
        .select('quiz_attempt_id, integrity_score, severity, details')
        .eq('book_id', bookId)
        .eq('user_id', session.user.id);
      
      if (error) throw error;
      return data as IntegrityLog[];
    },
    enabled: !!bookId && !!session?.user?.id,
  });

  // Check existing certificate
  const { data: existingCertificate } = useQuery({
    queryKey: ['existing-certificate', bookId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      
      const { data, error } = await supabase
        .from('publishing_certificates')
        .select('*')
        .eq('book_id', bookId)
        .eq('user_id', session.user.id)
        .is('revoked_at', null)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!bookId && !!session?.user?.id,
  });

  // Calculate metrics from the same evidence classes used by the server issuer.
  const totalChapters = book?.total_chapters || chapters?.length || 0;
  const chapterIds = new Set((chapters ?? []).map((chapter) => chapter.id));

  const maxReadByChapter = new Map<string, number>();
  for (const row of readingProgress ?? []) {
    if (!chapterIds.has(row.chapter_id)) continue;
    maxReadByChapter.set(
      row.chapter_id,
      Math.max(maxReadByChapter.get(row.chapter_id) ?? 0, Number(row.percent ?? 0)),
    );
  }
  const completedChapters = [...maxReadByChapter.values()].filter((percent) => percent >= 80).length;
  const progressPercent = totalChapters > 0
    ? Math.round((completedChapters / totalChapters) * 100)
    : 0;

  // Match server latest-per-chapter assessment semantics.
  const latestAttemptByChapter = new Map<string, QuizAttempt>();
  for (const attempt of quizAttempts ?? []) {
    if (!chapterIds.has(attempt.chapter_id)) continue;
    latestAttemptByChapter.set(attempt.chapter_id, attempt);
  }
  const authoritativeAttempts = [...latestAttemptByChapter.values()];
  const quizzesSubmitted = authoritativeAttempts.length;
  const quizzesRequired = totalChapters;
  const averageScore = authoritativeAttempts.length > 0
    ? authoritativeAttempts.reduce((sum, attempt) => sum + Number(attempt.score ?? 0), 0) / authoritativeAttempts.length
    : 0;

  const attemptIds = new Set(authoritativeAttempts.map((attempt) => attempt.id));
  const sessionIds = new Set(
    authoritativeAttempts
      .map((attempt) => attempt.assessment_session_id)
      .filter((id): id is string => Boolean(id)),
  );
  const trustedIntegrity = (integrityLogs ?? []).filter((row) => {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    return details.server_scored === true
      && Boolean(row.quiz_attempt_id && attemptIds.has(row.quiz_attempt_id))
      && typeof details.assessment_session_id === 'string'
      && sessionIds.has(details.assessment_session_id);
  });
  const integrityEvidenceComplete = authoritativeAttempts.length > 0
    && trustedIntegrity.length >= authoritativeAttempts.length;
  const integrityScore = trustedIntegrity.length > 0
    ? trustedIntegrity.reduce((sum, row) => sum + Number(row.integrity_score ?? 0), 0) / trustedIntegrity.length
    : 0;
  const hasRejectFlags = !integrityEvidenceComplete || trustedIntegrity.some((row) => {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    return row.severity === 'reject' || details.classification === 'reject';
  });
  const hasReviewFlags = trustedIntegrity.some((row) => {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    return row.severity === 'review' || details.classification === 'review';
  });

  const coverageThresholdMet = totalChapters > 0 && completedChapters / totalChapters >= 0.8;
  const allQuizzesComplete = quizzesSubmitted >= quizzesRequired && quizzesRequired > 0;
  const masteryScoreThresholdMet = averageScore >= 90;
  const integrityThresholdMet = integrityEvidenceComplete && integrityScore >= 0.6;

  const isEligible = coverageThresholdMet
    && allQuizzesComplete
    && integrityThresholdMet
    && !hasRejectFlags;

  if (bookLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Book Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The book you're looking for doesn't exist or has been removed.
              </p>
              <Button asChild>
                <Link to="/library">Go to Library</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // If certificate exists, redirect to verification page
  if (existingCertificate) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container py-8 max-w-3xl">
          <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Card className="border-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Award className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Certificate Already Issued</CardTitle>
              <CardDescription>
                You already have a certificate for "{book.title}"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Certificate Number</span>
                  <span className="font-mono">{existingCertificate.certificate_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="secondary">{existingCertificate.certificate_type}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Issued</span>
                  <span>{new Date(existingCertificate.issued_at).toLocaleDateString()}</span>
                </div>
              </div>

              <Button asChild className="w-full" variant="hero">
                <Link to={`/certificate/${existingCertificate.certificate_number}`}>
                  <Award className="h-4 w-4 mr-2" />
                  View Certificate
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container py-8 max-w-3xl">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Book
        </Button>

        <div className="space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Award className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Certificate Eligibility</h1>
            <p className="text-muted-foreground">{book.title}</p>
          </div>

          {/* Progress Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Requirements Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Chapter Completion */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {coverageThresholdMet ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    Read ≥80% of Required Chapters
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {completedChapters}/{totalChapters}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {/* Quiz Completion */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {allQuizzesComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  All Chapter Quizzes Completed
                </span>
                <span className="text-sm text-muted-foreground">
                  {quizzesSubmitted}/{quizzesRequired}
                </span>
              </div>

              {/* Score Threshold */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {masteryScoreThresholdMet ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  Average Assessment Score
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  masteryScoreThresholdMet ? "text-green-600" : "text-muted-foreground"
                )}>
                  {averageScore.toFixed(0)}% · mastery target 90%
                </span>
              </div>

              {/* Integrity Score */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {integrityThresholdMet ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <Shield className="h-4 w-4" />
                  Integrity Score ≥ 60%
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  integrityThresholdMet ? "text-green-600" : "text-muted-foreground"
                )}>
                  {(integrityScore * 100).toFixed(0)}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Status Card */}
          <Card className={isEligible ? "border-primary/50 bg-primary/5" : ""}>
            <CardContent className="py-6 text-center">
              {isEligible ? (
                <>
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-lg font-semibold mb-2">You're Eligible!</h3>
                  <p className="text-muted-foreground mb-4">
                    You've met all requirements for a certificate.
                  </p>
                  <CertificateGenerator
                    bookId={book.id}
                    bookTitle={book.title}
                    bookType={book.book_type || 'text'}
                    userId={session?.user?.id || ''}
                    userName={session?.user?.user_metadata?.full_name || 'Student'}
                    chaptersCompleted={completedChapters}
                    totalChapters={totalChapters}
                    progressPercent={progressPercent}
                    averageScore={averageScore}
                    integrityScore={integrityScore}
                    quizzesRequired={quizzesRequired}
                    quizzesSubmitted={quizzesSubmitted}
                    hasRejectFlags={hasRejectFlags}
                    hasReviewFlags={hasReviewFlags}
                  />
                </>
              ) : (
                <>
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Not Yet Eligible</h3>
                  <p className="text-muted-foreground">
                    Complete all requirements above to earn your certificate.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Authority Note */}
          <p className="text-xs text-muted-foreground text-center">
            Certificates are issued by ScrollLibrary Certification Authority and can be verified at{' '}
            <Link to="/verify" className="text-primary hover:underline">/verify</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
