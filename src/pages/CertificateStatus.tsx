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
  is_generated: boolean;
}

interface QuizAttempt {
  chapter_id: string;
  score: number;
}

interface IntegrityLog {
  integrity_score: number;
}

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
        .select('id, is_generated')
        .eq('book_id', bookId);
      
      if (error) throw error;
      return data as ChapterProgress[];
    },
    enabled: !!bookId,
  });

  // Fetch quiz attempts for this book
  const { data: quizAttempts } = useQuery({
    queryKey: ['certificate-quizzes', bookId, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('chapter_id, score')
        .eq('book_id', bookId)
        .eq('user_id', session.user.id);
      
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
        .select('integrity_score')
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

  // Calculate metrics
  const totalChapters = book?.total_chapters || chapters?.length || 0;
  const completedChapters = chapters?.filter(c => c.is_generated).length || 0;
  const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  
  const quizzesSubmitted = quizAttempts?.length || 0;
  const quizzesRequired = totalChapters;
  const averageScore = quizAttempts && quizAttempts.length > 0
    ? quizAttempts.reduce((sum, q) => sum + q.score, 0) / quizAttempts.length
    : 0;
  
  const integrityScore = integrityLogs && integrityLogs.length > 0
    ? integrityLogs.reduce((sum, l) => sum + l.integrity_score, 0) / integrityLogs.length
    : 1.0; // Default to 1.0 if no integrity data (assume clean)

  const allChaptersComplete = completedChapters === totalChapters && totalChapters > 0;
  const allQuizzesComplete = quizzesSubmitted >= quizzesRequired && quizzesRequired > 0;
  const scoreThresholdMet = averageScore >= 70;
  const integrityThresholdMet = integrityScore >= 0.6;

  const isEligible = allChaptersComplete && allQuizzesComplete && scoreThresholdMet && integrityThresholdMet;

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
                    {allChaptersComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    All Chapters Completed
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
                  {scoreThresholdMet ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  Average Score ≥ 70%
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  scoreThresholdMet ? "text-green-600" : "text-muted-foreground"
                )}>
                  {averageScore.toFixed(0)}%
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
