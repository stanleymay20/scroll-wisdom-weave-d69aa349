import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { COMPLETION_THRESHOLDS, CONTRACT_VERSIONS } from '../_shared/contract-canonical.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

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

/**
 * Public verification for competency certificates.
 *
 * Returns null when the number is not a competency certificate, so the caller
 * can fall through to its own not_found response.
 *
 * A live competency certificate deliberately reports `unverifiable` rather than
 * `valid`. These records were minted by the browser — src/lib/competencyCertification.ts
 * wrote them directly — which is precisely the authority gap Contract 6C exists
 * to close, and which 20260915115000 closed at the table level by revoking
 * INSERT/UPDATE/DELETE from anon and authenticated. A credential whose evidence
 * a browser could fabricate must not be presented to an employer as verified.
 * That is the same fail-closed rule the publishing path applies to its own
 * incompletely-migrated records, applied to a different table.
 *
 * Revocation is reported exactly as it is for publishing certificates, because
 * revocation is a server-side fact that does not depend on provenance evidence:
 * it short-circuits before any recomputation there too.
 */
async function verifyCompetencyCertificate(
  // Annotated with the exported SupabaseClient type, not
  // ReturnType<typeof createClient>. The latter works as a variable annotation
  // (voice-stt uses it that way) but not as a parameter: in argument position
  // it resolves the schema generic to `never`, so every selected row types as
  // `never` and each field access fails.
  service: SupabaseClient,
  number: string,
): Promise<Response | null> {
  const { data: cert, error } = await service.from('competency_certificates')
    .select('id,certificate_number,issued_at,revoked_at,revoked_reason,verification_hash,book_id,competency_level,mastery_classification,overall_competency_score,chapters_completed,total_chapters,metadata')
    .eq('certificate_number', number)
    .maybeSingle();

  if (error) throw error;
  if (!cert) return null;

  // Metadata is author-supplied JSON, so every field is validated rather than
  // trusted. `str` also collapses empty strings to null, so a blank bookTitle
  // does not present as a real one.
  const metadata = (cert.metadata && typeof cert.metadata === 'object' ? cert.metadata : {}) as Record<string, unknown>;
  const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

  const totalChapters = Number(cert.total_chapters ?? 0);
  const chaptersCompleted = Number(cert.chapters_completed ?? 0);
  const coveragePercentage = totalChapters > 0
    ? Math.round((chaptersCompleted / totalChapters) * 100)
    : 0;

  const base = {
    found: true,
    certificateNumber: cert.certificate_number,
    certificateType: 'competency',
    issuedAt: cert.issued_at,
    holder: str(metadata.recipientName),
    book: {
      id: cert.book_id,
      title: str(metadata.bookTitle),
      type: str(metadata.bookType),
      version: null,
    },
    coveragePercentage,
    competency: {
      level: cert.competency_level ?? null,
      masteryClassification: cert.mastery_classification ?? null,
      overallScore: cert.overall_competency_score ?? null,
      chaptersCompleted,
      totalChapters,
    },
    verificationHash: cert.verification_hash,
  };

  if (cert.revoked_at) {
    return respond({
      ...base,
      status: 'revoked',
      valid: false,
      revokedAt: cert.revoked_at,
      revokedReason: cert.revoked_reason || 'This learning record has been revoked.',
    });
  }

  return respond({
    ...base,
    status: 'unverifiable',
    valid: false,
    reasons: [
      'Competency certificates do not carry server-authoritative provenance under the current contract',
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return respond({ error: 'Verification service unavailable' }, 503);
    const service = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    let number = url.searchParams.get('number') || url.searchParams.get('certificateNumber') || '';
    if (!number && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      number = String(body?.number || body?.certificateNumber || '');
    }
    number = number.trim();
    if (!number) return respond({ error: 'Certificate number is required' }, 400);

    const { data: cert, error: certError } = await service.from('publishing_certificates')
      .select('id,certificate_number,certificate_type,issued_at,revoked_at,revoked_reason,verification_hash,book_id,book_content_hash,book_version,coverage_percentage,assessment_contract_version,assessment_contract_passed,evidence_snapshot,metadata')
      .eq('certificate_number', number)
      .maybeSingle();

    if (certError) throw certError;

    // Competency certificates live in their own table and are NOT interchangeable
    // with publishing certificates: they carry no book_content_hash, no coverage
    // percentage and no assessment contract, so the provenance recomputation
    // below cannot run against them.
    //
    // They are still looked up here, because the alternative — the 404 this
    // function returned between 921d6ba and now — tells a holder or an employer
    // that a credential which demonstrably exists was never issued. Account
    // deletion deliberately RETAINS these rows (delete-account nulls user_id and
    // sets revoked_reason rather than deleting), and 20260915113500 states the
    // contract they are retained under: "certificates are revoked, not erased, so
    // employers and institutions can continue to verify that a previously issued
    // credential is no longer valid". Retaining a row while removing the only way
    // to read it honours the letter of that and none of its purpose.
    if (!cert) {
      const competency = await verifyCompetencyCertificate(service, number);
      if (competency) return competency;
      return respond({ found: false, status: 'not_found', certificateNumber: number }, 404);
    }

    const metadata = cert.metadata && typeof cert.metadata === 'object' ? cert.metadata as Record<string, any> : {};
    const evidence = cert.evidence_snapshot && typeof cert.evidence_snapshot === 'object' ? cert.evidence_snapshot as Record<string, any> : {};
    const coveragePercentage = Number(cert.coverage_percentage ?? metadata.coveragePercentage ?? 0);
    const integrityScore = Number(evidence.integrity?.score ?? metadata.integrityScore ?? 0);
    const integrityClassification = String(evidence.integrity?.classification ?? metadata.integrityClassification ?? 'unknown');

    const base = {
      found: true,
      certificateNumber: cert.certificate_number,
      certificateType: cert.certificate_type,
      issuedAt: cert.issued_at,
      holder: metadata.recipientName || null,
      book: {
        id: cert.book_id,
        title: metadata.bookTitle || null,
        type: metadata.bookType || null,
        version: cert.book_version || metadata.bookVersion || null,
      },
      coveragePercentage,
      integrity: { score: integrityScore, classification: integrityClassification },
      assessment: {
        contractVersion: cert.assessment_contract_version,
        contractPassed: cert.assessment_contract_passed,
      },
      verificationHash: cert.verification_hash,
    };

    if (cert.revoked_at) {
      return respond({
        ...base,
        status: 'revoked',
        valid: false,
        revokedAt: cert.revoked_at,
        revokedReason: cert.revoked_reason || 'This learning record has been revoked.',
      });
    }

    // Legacy or incompletely migrated records are never presentation-upgraded to valid.
    if (!cert.book_id || !cert.book_content_hash || !cert.assessment_contract_passed) {
      return respond({
        ...base,
        status: 'unverifiable',
        valid: false,
        reasons: [
          !cert.book_id ? 'Certified book is unavailable' : null,
          !cert.book_content_hash ? 'Certification-time SHA-256 book hash is missing' : null,
          !cert.assessment_contract_passed ? 'Server-authoritative assessment evidence is missing' : null,
        ].filter(Boolean),
      });
    }

    const [{ data: book, error: bookError }, { data: chapters, error: chapterError }] = await Promise.all([
      service.from('books').select('id,title,book_type,category,created_at,updated_at').eq('id', cert.book_id).maybeSingle(),
      service.from('chapters').select('id,chapter_number,content').eq('book_id', cert.book_id).order('chapter_number', { ascending: true }),
    ]);
    if (bookError || chapterError) throw bookError || chapterError;

    if (!book || !chapters?.length) {
      return respond({
        ...base,
        status: 'unverifiable',
        valid: false,
        reasons: ['Current book state is unavailable; provenance cannot be recomputed'],
      });
    }

    const currentHash = await sha256Hex(canonicalizeBook(book, chapters));
    const hashMatch = currentHash === cert.book_content_hash;
    const coverageMet = coveragePercentage >= COMPLETION_THRESHOLDS.MIN_CHAPTER_COVERAGE * 100;
    const integrityMet = integrityScore >= COMPLETION_THRESHOLDS.MIN_INTEGRITY && integrityClassification !== 'reject';
    const assessmentMet = cert.assessment_contract_passed === true && cert.assessment_contract_version === CONTRACT_VERSIONS.assessmentRigor;

    const reasons: string[] = [];
    if (!hashMatch) reasons.push('Book content hash mismatch: the book changed after issuance');
    if (!coverageMet) reasons.push(`Certified learner coverage ${coveragePercentage}% is below the 80% minimum`);
    if (!integrityMet) reasons.push('Integrity evidence does not satisfy the completion threshold');
    if (!assessmentMet) reasons.push('Assessment evidence is missing or uses an unsupported contract version');

    const valid = reasons.length === 0;
    return respond({
      ...base,
      status: valid ? 'valid' : 'invalid',
      valid,
      reasons,
      book: {
        ...base.book,
        title: metadata.bookTitle || book.title,
        currentTitle: book.title,
        category: book.category,
        type: metadata.bookType || book.book_type,
      },
      provenance: {
        contract: CONTRACT_VERSIONS.provenance,
        storedHash: cert.book_content_hash,
        currentHash,
        hashMatch,
      },
    });
  } catch (error) {
    console.error('[verify-certificate]', error);
    return respond({ error: 'Verification failed closed', status: 'unverifiable', valid: false }, 500);
  }
});
