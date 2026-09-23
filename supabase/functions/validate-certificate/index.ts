import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CERTIFICATE_ISSUER,
  COMPLETION_THRESHOLDS,
  CONTRACT_VERSIONS,
  MASTERY_THRESHOLDS,
} from '../_shared/contract-canonical.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CERTIFICATE_SCHEMA_VERSION = '8.0';

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function certificateNumber(): string {
  return `SL-CERT-${Date.now().toString(36).toUpperCase()}-${randomHex(8)}`;
}

function wordCount(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

function canonicalizeBook(book: any, chapters: any[]): string {
  const canonicalChapters = [...chapters]
    .map((chapter, index) => ({
      id: String(chapter.id),
      position: Number(chapter.chapter_number ?? index + 1),
      content: String(chapter.content ?? ''),
      wordCount: wordCount(String(chapter.content ?? '')),
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  return JSON.stringify({
    schema: 'scrolllibrary-book-provenance-v1',
    bookId: String(book.id),
    title: String(book.title ?? ''),
    version: String(book.updated_at ?? book.created_at ?? 'v1'),
    chapters: canonicalChapters,
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function latestPerChapter<T extends { chapter_id: string; submitted_at?: string | null; created_at?: string | null }>(rows: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (!row.chapter_id) continue;
    const existing = latest.get(row.chapter_id);
    const rowTime = new Date(row.submitted_at ?? row.created_at ?? 0).getTime();
    const existingTime = existing ? new Date(existing.submitted_at ?? existing.created_at ?? 0).getTime() : -1;
    if (!existing || rowTime >= existingTime) latest.set(row.chapter_id, row);
  }
  return latest;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return respond({ error: 'Certificate authority unavailable', code: 'SERVER_CONFIG' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401);

    const service = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return respond({ error: 'Invalid token', code: 'INVALID_TOKEN' }, 401);

    const body = await req.json();
    const bookId = String(body?.bookId || '');
    const requestedType = body?.requestedType === 'mastery' ? 'mastery' : body?.requestedType === 'completion' ? 'completion' : undefined;
    if (!bookId) return respond({ error: 'bookId is required', code: 'INVALID_REQUEST' }, 400);

    const [{ data: book, error: bookError }, { data: chapters, error: chapterError }] = await Promise.all([
      service.from('books')
        .select('id,title,book_type,category,language,total_chapters,created_at,updated_at')
        .eq('id', bookId)
        .single(),
      service.from('chapters')
        .select('id,chapter_number,content')
        .eq('book_id', bookId)
        .order('chapter_number', { ascending: true }),
    ]);

    if (bookError || !book || chapterError || !chapters?.length) {
      return respond({ error: 'Book or chapters not found', code: 'BOOK_NOT_FOUND' }, 404);
    }

    const totalChapters = chapters.length;
    const chapterIds = new Set(chapters.map((chapter: any) => String(chapter.id)));

    // Contract 6C: learner coverage comes from reading evidence, never from chapter generation state.
    const { data: readingRows, error: readingError } = await service.from('reading_progress')
      .select('chapter_id,percent,updated_at')
      .eq('user_id', user.id)
      .eq('book_id', bookId);
    if (readingError) throw readingError;

    const maxReadByChapter = new Map<string, number>();
    for (const row of readingRows ?? []) {
      const chapterId = String(row.chapter_id || '');
      if (!chapterIds.has(chapterId)) continue;
      maxReadByChapter.set(chapterId, Math.max(maxReadByChapter.get(chapterId) ?? 0, Number(row.percent ?? 0)));
    }
    const completedChapterIds = [...maxReadByChapter.entries()]
      .filter(([, percent]) => percent >= 80)
      .map(([chapterId]) => chapterId);
    const chapterCoverage = completedChapterIds.length / totalChapters;
    const coveragePercentage = Math.round(chapterCoverage * 10000) / 100;

    // Contract 8/6C: only server-scored, ARC-passing session attempts count.
    const { data: rawAttempts, error: attemptsError } = await service.from('quiz_attempts')
      .select('id,chapter_id,score,total_questions,correct_answers,submitted_at,assessment_session_id,assessment_contract_version,assessment_contract_passed,assessment_manifest_hash,tier_breakdown,coding_question_count')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .eq('assessment_contract_passed', true)
      .eq('assessment_contract_version', CONTRACT_VERSIONS.assessmentRigor)
      .not('assessment_session_id', 'is', null)
      .order('submitted_at', { ascending: true });
    if (attemptsError) throw attemptsError;

    const attempts = latestPerChapter((rawAttempts ?? []).filter((row: any) => chapterIds.has(String(row.chapter_id || ''))));
    const assessedChapterIds = [...attempts.keys()];
    const allQuizzesSubmitted = attempts.size >= totalChapters && chapters.every((chapter: any) => attempts.has(String(chapter.id)));

    if (attempts.size === 0) {
      return respond({
        success: false,
        error: 'No server-authoritative assessment evidence exists for this book',
        code: 'NO_AUTHORITATIVE_ASSESSMENT',
      }, 403);
    }

    const authoritativeAttempts = [...attempts.values()];
    const averageScore = authoritativeAttempts.reduce((sum, attempt: any) => sum + Number(attempt.score ?? 0), 0) / authoritativeAttempts.length / 100;
    const sessionIds = new Set(authoritativeAttempts.map((attempt: any) => String(attempt.assessment_session_id)));
    const attemptIds = new Set(authoritativeAttempts.map((attempt: any) => String(attempt.id)));

    // Contract 6B: accept only integrity logs emitted by the server-scored assessment path.
    const { data: rawIntegrity, error: integrityError } = await service.from('assessment_integrity_logs')
      .select('quiz_attempt_id,chapter_id,integrity_score,severity,details,created_at')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .order('created_at', { ascending: true });
    if (integrityError) throw integrityError;

    const trustedIntegrity = (rawIntegrity ?? []).filter((row: any) => {
      const details = row.details && typeof row.details === 'object' ? row.details : {};
      return details.server_scored === true
        && attemptIds.has(String(row.quiz_attempt_id || ''))
        && sessionIds.has(String(details.assessment_session_id || ''));
    });

    if (trustedIntegrity.length < attempts.size) {
      return respond({
        success: false,
        error: 'Authoritative integrity evidence is incomplete',
        code: 'NO_AUTHORITATIVE_INTEGRITY',
      }, 403);
    }

    const integrityScore = trustedIntegrity.reduce((sum: number, row: any) => sum + Number(row.integrity_score ?? 0), 0) / trustedIntegrity.length;
    const hasRejectFlags = trustedIntegrity.some((row: any) => row.severity === 'reject' || row.details?.classification === 'reject');
    const hasReviewFlags = trustedIntegrity.some((row: any) => row.severity === 'review' || row.details?.classification === 'review');
    const integrityClassification = hasRejectFlags ? 'reject' : hasReviewFlags ? 'review' : integrityScore >= 0.9 ? 'trusted' : integrityScore >= 0.6 ? 'review' : 'reject';

    const completionReasons: string[] = [];
    if (chapterCoverage < COMPLETION_THRESHOLDS.MIN_CHAPTER_COVERAGE) {
      completionReasons.push(`Read at least 80% of chapters (${completedChapterIds.length}/${totalChapters})`);
    }
    if (!allQuizzesSubmitted) completionReasons.push(`Complete all chapter assessments (${attempts.size}/${totalChapters})`);
    if (integrityScore < COMPLETION_THRESHOLDS.MIN_INTEGRITY) completionReasons.push('Integrity score is below 60%');
    if (hasRejectFlags) completionReasons.push('Resolve rejected integrity evidence');
    const completionEligible = completionReasons.length === 0;

    const { data: failedMasteryRows, error: masteryError } = await service.from('mastery_attempts')
      .select('attempted_at,passed')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .eq('passed', false)
      .order('attempted_at', { ascending: false })
      .limit(1);
    if (masteryError) throw masteryError;

    let blockedByCooldown = false;
    let canRetryAt: string | null = null;
    const lastFailedAt = failedMasteryRows?.[0]?.attempted_at ? new Date(failedMasteryRows[0].attempted_at) : null;
    if (lastFailedAt) {
      const retryAt = new Date(lastFailedAt.getTime() + MASTERY_THRESHOLDS.COOLDOWN_MS);
      if (Date.now() < retryAt.getTime()) {
        blockedByCooldown = true;
        canRetryAt = retryAt.toISOString();
      }
    }

    const masteryReasons: string[] = [];
    if (!completionEligible) masteryReasons.push(...completionReasons);
    if (averageScore < MASTERY_THRESHOLDS.MIN_SCORE) masteryReasons.push('Average assessment score is below 90%');
    if (integrityScore < MASTERY_THRESHOLDS.MIN_INTEGRITY) masteryReasons.push('Integrity score is below 90%');
    if (hasRejectFlags || hasReviewFlags) masteryReasons.push('Mastery requires no unresolved review or reject flags');
    if (blockedByCooldown) masteryReasons.push(`Mastery retry is locked until ${canRetryAt}`);
    const masteryEligible = masteryReasons.length === 0;

    const eligibleType: 'mastery' | 'completion' | null = masteryEligible ? 'mastery' : completionEligible ? 'completion' : null;
    if (!eligibleType) {
      return respond({
        success: false,
        error: 'Not eligible for a learning record',
        code: 'NOT_ELIGIBLE',
        eligibility: {
          eligible: false,
          certificateType: null,
          completionReasons,
          masteryReasons,
          coveragePercentage,
          integrityScore,
          blockedByCooldown,
          canRetryAt,
        },
      }, 403);
    }

    if (requestedType === 'mastery' && eligibleType !== 'mastery') {
      return respond({
        success: false,
        error: 'Mastery thresholds are not satisfied',
        code: 'MASTERY_NOT_ELIGIBLE',
        eligibility: { eligible: true, certificateType: eligibleType, masteryReasons, blockedByCooldown, canRetryAt },
      }, 403);
    }

    const certificateType = requestedType === 'completion' ? 'completion' : eligibleType;

    const canonical = canonicalizeBook(book, chapters);
    const bookContentHash = await sha256Hex(canonical);
    const bookVersion = String(book.updated_at ?? book.created_at ?? 'v1');

    const { data: profile } = await service.from('profiles')
      .select('full_name')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();
    const recipientName = profile?.full_name?.trim() || user.email?.split('@')[0] || 'ScrollLibrary learner';

    const { data: existing, error: existingError } = await service.from('publishing_certificates')
      .select('id,certificate_number,certificate_type,issued_at,book_content_hash,verification_hash,metadata')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .eq('certificate_type', certificateType)
      .is('revoked_at', null)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      // Idempotency is valid only while the certified book state is unchanged.
      if (existing.book_content_hash === bookContentHash) {
        return respond({
          success: true,
          alreadyIssued: true,
          certificate: {
            id: existing.id,
            certificateNumber: existing.certificate_number,
            certificateType: existing.certificate_type,
            issuedAt: existing.issued_at,
            verificationHash: existing.verification_hash,
            issuer: CERTIFICATE_ISSUER,
            recipient: { name: recipientName },
            book: { id: bookId, title: book.title },
            coveragePercentage,
            integrityScore,
          },
        });
      }

      // A changed book state invalidates the old active record. Revoke it before
      // issuing a new state-bound record rather than silently reusing the old one.
      const { error: revokeError } = await service.from('publishing_certificates').update({
        revoked_at: new Date().toISOString(),
        revoked_reason: 'Book content changed after issuance; superseded by a new state-bound learning record.',
      }).eq('id', existing.id).is('revoked_at', null);
      if (revokeError) throw revokeError;
    }

    const issuedAt = new Date().toISOString();
    const number = certificateNumber();
    const verificationHash = randomHex(32);
    const metadata = {
      schemaVersion: CERTIFICATE_SCHEMA_VERSION,
      recipientName,
      bookId,
      bookTitle: book.title,
      bookType: book.book_type,
      bookVersion,
      bookContentHash,
      coveragePercentage,
      chaptersCompleted: completedChapterIds.length,
      totalChapters,
      assessedChapters: assessedChapterIds,
      integrityScore,
      integrityClassification,
      assessmentSchema: CONTRACT_VERSIONS.assessmentRigor,
      provenanceContract: CONTRACT_VERSIONS.provenance,
      issuer: CERTIFICATE_ISSUER,
      issuedWithVersion: CERTIFICATE_SCHEMA_VERSION,
    };

    const evidenceSnapshot = {
      reading: {
        completedChapterIds,
        thresholdPerChapterPercent: 80,
        coveragePercentage,
      },
      assessment: {
        attemptIds: authoritativeAttempts.map((attempt: any) => attempt.id),
        sessionIds: authoritativeAttempts.map((attempt: any) => attempt.assessment_session_id),
        manifestHashes: authoritativeAttempts.map((attempt: any) => attempt.assessment_manifest_hash),
        averageScore,
        contractVersion: CONTRACT_VERSIONS.assessmentRigor,
        contractPassed: true,
      },
      integrity: {
        score: integrityScore,
        classification: integrityClassification,
        serverScored: true,
      },
    };

    const { data: certificate, error: insertError } = await service.from('publishing_certificates').insert({
      book_id: bookId,
      user_id: user.id,
      certificate_number: number,
      certificate_type: certificateType,
      issued_at: issuedAt,
      verification_hash: verificationHash,
      book_content_hash: bookContentHash,
      book_version: bookVersion,
      coverage_percentage: coveragePercentage,
      assessment_contract_version: CONTRACT_VERSIONS.assessmentRigor,
      assessment_contract_passed: true,
      evidence_snapshot: evidenceSnapshot,
      metadata,
    }).select('id,certificate_number,certificate_type,issued_at,verification_hash').single();

    if (insertError || !certificate) {
      if (insertError?.code === '23505') {
        const { data: raced } = await service.from('publishing_certificates')
          .select('id,certificate_number,certificate_type,issued_at,verification_hash')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .eq('certificate_type', certificateType)
          .is('revoked_at', null)
          .maybeSingle();
        if (raced) return respond({ success: true, alreadyIssued: true, certificate: raced });
      }
      throw insertError || new Error('Certificate issuance failed');
    }

    return respond({
      success: true,
      alreadyIssued: false,
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificate_number,
        certificateType: certificate.certificate_type,
        issuedAt: certificate.issued_at,
        verificationHash: certificate.verification_hash,
        issuer: CERTIFICATE_ISSUER,
        recipient: { name: recipientName },
        book: { id: bookId, title: book.title },
        bookVersion,
        bookContentHash,
        coveragePercentage,
        integrityScore,
        integrityClassification,
        assessmentContract: CONTRACT_VERSIONS.assessmentRigor,
      },
    }, 201);
  } catch (error) {
    console.error('[validate-certificate]', error);
    return respond({
      error: 'Certificate authority failed closed',
      code: 'CERTIFICATE_AUTHORITY_ERROR',
    }, 500);
  }
});
