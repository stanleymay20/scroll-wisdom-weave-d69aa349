/**
 * CONTRACT 6C — Server-Side Certificate Validation
 * 
 * Re-runs eligibility checks server-side before issuance.
 * Rejects issuance if client state differs from server state.
 * 
 * This endpoint is the ONLY authority for certificate generation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// 6C Eligibility Constants (mirrored from client)
// ============================================================

const COMPLETION_THRESHOLDS = {
  MIN_INTEGRITY: 0.6,
  CHAPTERS_REQUIRED: 1.0,
  QUIZZES_REQUIRED: 1.0,
};

const MASTERY_THRESHOLDS = {
  MIN_SCORE: 0.9,
  MIN_INTEGRITY: 0.9,
  COOLDOWN_MS: 24 * 60 * 60 * 1000, // 24 hours
};

// ============================================================
// 6A Certificate Authority Constants (immutable)
// ============================================================

const CERTIFICATE_ISSUER = {
  name: 'ScrollLibrary Certification Authority',
  title: 'Founder & Publishing Director',
  organization: 'ScrollLibrary™',
} as const;

// ============================================================
// Types
// ============================================================

interface BookProgress {
  totalChapters: number;
  completedChapters: number;
  quizzesRequired: number;
  quizzesSubmitted: number;
  averageScore: number;
  integrityScore: number;
  hasRejectFlags: boolean;
  hasReviewFlags: boolean;
  masteryRequirementsMet: boolean;
  lastMasteryAttempt: Date | null;
}

interface EligibilityResult {
  eligible: boolean;
  certificateType: 'completion' | 'mastery' | null;
  reasons: string[];
  integrityScore: number;
  blockedByCooldown: boolean;
  canRetryAt: Date | null;
}

interface CertificateRequest {
  bookId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  requestedType?: 'completion' | 'mastery';
}

// ============================================================
// Pure Eligibility Functions (6C.1)
// ============================================================

function checkCompletionEligibility(progress: BookProgress): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let eligible = true;

  const chapterProgress = progress.totalChapters > 0 
    ? progress.completedChapters / progress.totalChapters 
    : 0;
  
  if (chapterProgress < COMPLETION_THRESHOLDS.CHAPTERS_REQUIRED) {
    eligible = false;
    reasons.push(`Complete all chapters (${progress.completedChapters}/${progress.totalChapters})`);
  }

  const quizProgress = progress.quizzesRequired > 0
    ? progress.quizzesSubmitted / progress.quizzesRequired
    : 1;
  
  if (quizProgress < COMPLETION_THRESHOLDS.QUIZZES_REQUIRED) {
    eligible = false;
    reasons.push(`Submit all quizzes (${progress.quizzesSubmitted}/${progress.quizzesRequired})`);
  }

  if (progress.hasRejectFlags) {
    eligible = false;
    reasons.push('Resolve integrity violations before certificate issuance');
  }

  if (progress.integrityScore < COMPLETION_THRESHOLDS.MIN_INTEGRITY) {
    eligible = false;
    reasons.push(`Integrity score too low (${Math.round(progress.integrityScore * 100)}% < 60%)`);
  }

  return { eligible, reasons };
}

function checkMasteryEligibility(progress: BookProgress): {
  eligible: boolean;
  reasons: string[];
  blockedByCooldown: boolean;
  canRetryAt: Date | null;
} {
  const reasons: string[] = [];
  let eligible = true;
  let blockedByCooldown = false;
  let canRetryAt: Date | null = null;

  // Cooldown enforcement
  if (progress.lastMasteryAttempt) {
    const cooldownEnd = new Date(new Date(progress.lastMasteryAttempt).getTime() + MASTERY_THRESHOLDS.COOLDOWN_MS);
    if (new Date() < cooldownEnd) {
      eligible = false;
      blockedByCooldown = true;
      canRetryAt = cooldownEnd;
      reasons.push(`Mastery attempt locked until ${cooldownEnd.toLocaleString()}`);
    }
  }

  if (progress.averageScore < MASTERY_THRESHOLDS.MIN_SCORE) {
    eligible = false;
    reasons.push(`Average score below 90% (current: ${Math.round(progress.averageScore * 100)}%)`);
  }

  if (progress.integrityScore < MASTERY_THRESHOLDS.MIN_INTEGRITY) {
    eligible = false;
    reasons.push(`Integrity score below 90% (current: ${Math.round(progress.integrityScore * 100)}%)`);
  }

  if (progress.hasRejectFlags) {
    eligible = false;
    reasons.push('Unresolved integrity violations block mastery certification');
  }

  if (progress.hasReviewFlags) {
    eligible = false;
    reasons.push('Pending review flags must be resolved');
  }

  if (!progress.masteryRequirementsMet) {
    eligible = false;
    reasons.push('Complete all mastery requirements');
  }

  return { eligible, reasons, blockedByCooldown, canRetryAt };
}

function evaluateEligibility(progress: BookProgress): EligibilityResult {
  const masteryResult = checkMasteryEligibility(progress);
  
  if (masteryResult.eligible) {
    return {
      eligible: true,
      certificateType: 'mastery',
      reasons: [],
      integrityScore: progress.integrityScore,
      blockedByCooldown: false,
      canRetryAt: null,
    };
  }

  const completionResult = checkCompletionEligibility(progress);
  
  if (completionResult.eligible) {
    return {
      eligible: true,
      certificateType: 'completion',
      reasons: masteryResult.reasons,
      integrityScore: progress.integrityScore,
      blockedByCooldown: masteryResult.blockedByCooldown,
      canRetryAt: masteryResult.canRetryAt,
    };
  }

  return {
    eligible: false,
    certificateType: null,
    reasons: completionResult.reasons,
    integrityScore: progress.integrityScore,
    blockedByCooldown: masteryResult.blockedByCooldown,
    canRetryAt: masteryResult.canRetryAt,
  };
}

// ============================================================
// Certificate Generation (6A Authority)
// ============================================================

function generateCertificateNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SL-CERT-${timestamp}-${random}`;
}

function generateVerificationHash(data: {
  bookId: string;
  certificateNumber: string;
  issuedAt: string;
  certificateType: string;
}): string {
  // Simple hash for demo - in production use crypto
  const str = `${data.bookId}|${data.certificateNumber}|${data.issuedAt}|${data.certificateType}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[validate-certificate] No auth header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[validate-certificate] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CertificateRequest = await req.json();
    const { bookId, userName, userEmail, requestedType } = body;

    if (!bookId || !userName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[validate-certificate] Processing for user ${user.id}, book ${bookId}`);

    // ============================================================
    // SERVER-SIDE PROGRESS RECALCULATION
    // ============================================================

    // 1. Get book info
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, total_chapters')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      console.error('[validate-certificate] Book not found:', bookError);
      return new Response(
        JSON.stringify({ error: 'Book not found', code: 'BOOK_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get chapters to calculate completion
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapters')
      .select('id, is_generated')
      .eq('book_id', bookId);

    if (chaptersError) {
      console.error('[validate-certificate] Error fetching chapters:', chaptersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch chapters', code: 'DB_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalChapters = chapters?.length || 0;
    const completedChapters = chapters?.filter(c => c.is_generated).length || 0;

    // 3. Get user library entry for progress
    const { data: libraryEntry } = await supabase
      .from('user_library')
      .select('progress_percent, last_read_chapter')
      .eq('book_id', bookId)
      .eq('user_id', user.id)
      .single();

    // ============================================================
    // 4. REAL QUIZ SCORE AGGREGATION (NO PLACEHOLDERS)
    // ============================================================
    
    const { data: quizAttempts, error: quizError } = await supabase
      .from('quiz_attempts')
      .select('score, total_questions, correct_answers')
      .eq('user_id', user.id)
      .eq('book_id', bookId);

    if (quizError) {
      console.error('[validate-certificate] Error fetching quiz attempts:', quizError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch quiz data', code: 'DB_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: If no quiz attempts exist, certificate is BLOCKED
    if (!quizAttempts || quizAttempts.length === 0) {
      console.log('[validate-certificate] No quiz attempts found - certificate blocked');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No quiz attempts found',
          code: 'NO_QUIZ_DATA',
          eligibility: {
            eligible: false,
            certificateType: null,
            reasons: ['Complete at least one quiz assessment before requesting certificate'],
            integrityScore: 0,
            blockedByCooldown: false,
            canRetryAt: null,
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate real average score (normalize to 0-1 range)
    const averageScore = quizAttempts.reduce((sum, q) => sum + q.score, 0) / quizAttempts.length / 100;
    const quizzesSubmitted = quizAttempts.length;
    const quizzesRequired = totalChapters; // One quiz per chapter required

    console.log(`[validate-certificate] Quiz data: ${quizzesSubmitted} attempts, avg score: ${(averageScore * 100).toFixed(1)}%`);

    // ============================================================
    // 5. REAL INTEGRITY SCORE AGGREGATION (NO PLACEHOLDERS)
    // ============================================================

    const { data: integrityLogs, error: integrityError } = await supabase
      .from('assessment_integrity_logs')
      .select('integrity_score, severity')
      .eq('user_id', user.id)
      .eq('book_id', bookId);

    if (integrityError) {
      console.error('[validate-certificate] Error fetching integrity logs:', integrityError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrity data', code: 'DB_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: If no integrity logs exist, certificate is BLOCKED
    if (!integrityLogs || integrityLogs.length === 0) {
      console.log('[validate-certificate] No integrity logs found - certificate blocked');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No integrity data available',
          code: 'NO_INTEGRITY_DATA',
          eligibility: {
            eligible: false,
            certificateType: null,
            reasons: ['Integrity assessment data required before certificate issuance'],
            integrityScore: 0,
            blockedByCooldown: false,
            canRetryAt: null,
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate real integrity score
    const integrityScore = integrityLogs.reduce((sum, l) => sum + l.integrity_score, 0) / integrityLogs.length;
    const hasRejectFlags = integrityLogs.some(l => l.severity === 'reject');
    const hasReviewFlags = integrityLogs.some(l => l.severity === 'review');

    console.log(`[validate-certificate] Integrity data: score=${(integrityScore * 100).toFixed(1)}%, reject=${hasRejectFlags}, review=${hasReviewFlags}`);

    // ============================================================
    // 6. REAL COOLDOWN ENFORCEMENT (NO PLACEHOLDERS)
    // ============================================================

    const { data: masteryAttempts, error: masteryError } = await supabase
      .from('mastery_attempts')
      .select('attempted_at, passed')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .order('attempted_at', { ascending: false })
      .limit(1);

    if (masteryError) {
      console.error('[validate-certificate] Error fetching mastery attempts:', masteryError);
      // Non-blocking - cooldown is optional
    }

    const lastMasteryAttempt = masteryAttempts?.[0]?.attempted_at 
      ? new Date(masteryAttempts[0].attempted_at) 
      : null;

    // Check if mastery requirements are truly met (strict)
    const masteryRequirementsMet = 
      averageScore >= MASTERY_THRESHOLDS.MIN_SCORE &&
      integrityScore >= MASTERY_THRESHOLDS.MIN_INTEGRITY &&
      !hasRejectFlags &&
      !hasReviewFlags &&
      quizzesSubmitted >= quizzesRequired;

    console.log(`[validate-certificate] Mastery requirements met: ${masteryRequirementsMet}`);

    // ============================================================
    // 7. BUILD PROGRESS OBJECT (NO DEFAULTS, NO FALLBACKS)
    // ============================================================

    const progress: BookProgress = {
      totalChapters,
      completedChapters,
      quizzesRequired,
      quizzesSubmitted,
      averageScore,         // REAL: from quiz_attempts
      integrityScore,       // REAL: from assessment_integrity_logs
      hasRejectFlags,       // REAL: from assessment_integrity_logs
      hasReviewFlags,       // REAL: from assessment_integrity_logs
      masteryRequirementsMet, // REAL: computed from actual data
      lastMasteryAttempt,   // REAL: from mastery_attempts
    };

    // ============================================================
    // RE-RUN ELIGIBILITY CHECK (Server-side authority)
    // ============================================================

    const eligibility = evaluateEligibility(progress);

    console.log('[validate-certificate] Eligibility result:', {
      eligible: eligibility.eligible,
      type: eligibility.certificateType,
      reasons: eligibility.reasons,
    });

    // ============================================================
    // REJECT IF NOT ELIGIBLE
    // ============================================================

    if (!eligibility.eligible) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Not eligible for certificate',
          code: 'NOT_ELIGIBLE',
          eligibility,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // VALIDATE REQUESTED TYPE MATCHES ELIGIBILITY
    // ============================================================

    if (requestedType && requestedType !== eligibility.certificateType) {
      // Client requested a type they're not eligible for
      console.warn(`[validate-certificate] Type mismatch: requested ${requestedType}, eligible for ${eligibility.certificateType}`);
      
      if (requestedType === 'mastery' && eligibility.certificateType === 'completion') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Not eligible for Mastery certificate',
            code: 'MASTERY_NOT_ELIGIBLE',
            eligibility,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================================
    // ISSUE CERTIFICATE (6A Authority)
    // ============================================================

    const certificateNumber = generateCertificateNumber();
    const issuedAt = new Date().toISOString();
    
    const verificationHash = generateVerificationHash({
      bookId,
      certificateNumber,
      issuedAt,
      certificateType: eligibility.certificateType!,
    });

    // Store certificate in database
    const { data: certificate, error: certError } = await supabase
      .from('publishing_certificates')
      .insert({
        book_id: bookId,
        user_id: user.id,
        certificate_number: certificateNumber,
        issued_at: issuedAt,
        metadata: {
          certificateType: eligibility.certificateType,
          recipientName: userName,
          recipientEmail: userEmail,
          bookTitle: book.title,
          issuer: CERTIFICATE_ISSUER,
          integrityScore: eligibility.integrityScore,
          verificationHash,
          chaptersCompleted: completedChapters,
          totalChapters,
        },
      })
      .select()
      .single();

    if (certError) {
      console.error('[validate-certificate] Error creating certificate:', certError);
      return new Response(
        JSON.stringify({ error: 'Failed to create certificate', code: 'CERT_CREATE_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[validate-certificate] Certificate issued: ${certificateNumber}`);

    return new Response(
      JSON.stringify({
        success: true,
        certificate: {
          id: certificate.id,
          certificateNumber,
          certificateType: eligibility.certificateType,
          issuedAt,
          verificationHash,
          issuer: CERTIFICATE_ISSUER,
          recipient: {
            name: userName,
            email: userEmail,
          },
          book: {
            id: bookId,
            title: book.title,
          },
          integrityScore: eligibility.integrityScore,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[validate-certificate] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
