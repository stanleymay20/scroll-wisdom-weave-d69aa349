/**
 * CONTRACT 6D — Public Verification API (v2.0 — Competency-Verified)
 * 
 * GET endpoint for employers and institutions to verify certificates.
 * Supports both legacy publishing_certificates AND new competency_certificates.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300',
};

const CERTIFICATE_ISSUER = {
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ valid: false, error: 'Method not allowed' }, 405);
  }

  try {
    const url = new URL(req.url);
    const certificateNumber = url.searchParams.get('number');

    if (!certificateNumber) {
      return jsonResponse({ valid: false, error: 'Missing certificate number', reason: 'Provide certificate number via ?number=SL-CERT-XXXX' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try competency certificates first (new system)
    const competencyResult = await verifyCompetencyCertificate(supabase, certificateNumber);
    if (competencyResult) return jsonResponse(competencyResult, 200);

    // Fall back to legacy publishing certificates
    const legacyResult = await verifyLegacyCertificate(supabase, certificateNumber);
    if (legacyResult) return jsonResponse(legacyResult, legacyResult.valid ? 200 : 200);

    return jsonResponse({ valid: false, certificateNumber, reason: 'Certificate not found or does not exist' }, 404);

  } catch (error) {
    console.error('[verify-certificate] Unexpected error:', error);
    return jsonResponse({ valid: false, error: 'Internal server error' }, 500);
  }
});

// --- Competency Certificate Verification ---
async function verifyCompetencyCertificate(supabase: any, certNumber: string) {
  const { data: cert, error } = await supabase
    .from('competency_certificates')
    .select(`*, books (id, title, category)`)
    .eq('certificate_number', certNumber)
    .maybeSingle();

  if (error || !cert) return null;

  const book = Array.isArray(cert.books) ? cert.books[0] : cert.books;

  return {
    valid: !cert.revoked_at,
    certificateNumber: cert.certificate_number,
    certificateType: 'competency',
    competency_level: cert.competency_level,
    holder: cert.metadata?.recipientName || 'Record unavailable',
    skills_validated: cert.skills_validated || [],
    competency_summary: cert.competency_summary,
    ai_evaluation_summary: cert.ai_evaluation_summary,
    scores: {
      reflection: cert.average_reflection_score,
      application: cert.average_application_score,
      competency: cert.average_competency_score,
      overall: cert.overall_competency_score,
    },
    issuedAt: cert.issued_at,
    issuer: CERTIFICATE_ISSUER,
    book: book ? { title: book.title, category: book.category } : undefined,
    verification_status: cert.revoked_at ? 'revoked' : 'verified',
    revoked: !!cert.revoked_at,
    revokedAt: cert.revoked_at,
    revokedReason: cert.revoked_reason,
  };
}

// --- Legacy Certificate Verification ---
async function verifyLegacyCertificate(supabase: any, certNumber: string) {
  const { data: cert, error } = await supabase
    .from('publishing_certificates')
    .select(`*, books (id, title, category)`)
    .eq('certificate_number', certNumber)
    .maybeSingle();

  if (error || !cert) return null;

  const metadata = cert.metadata as Record<string, unknown> | null;
  const book = Array.isArray(cert.books) ? cert.books[0] : cert.books;
  const storedIntegrityScore = metadata?.integrityScore as number | undefined;

  if (storedIntegrityScore === undefined || storedIntegrityScore === null) {
    return {
      valid: false,
      certificateNumber: cert.certificate_number,
      reason: 'Legacy certificate — not verifiable. Issued before integrity tracking.',
    };
  }

  let integrityClassification: 'trusted' | 'review' | 'flagged' = 'trusted';
  if (storedIntegrityScore < 0.6) integrityClassification = 'flagged';
  else if (storedIntegrityScore < 0.9) integrityClassification = 'review';

  return {
    valid: !cert.revoked_at,
    certificateNumber: cert.certificate_number,
    certificateType: cert.certificate_type || metadata?.certificateType,
    issuedAt: cert.issued_at,
    issuer: CERTIFICATE_ISSUER,
    recipient: { name: (metadata?.recipientName as string) || 'Record unavailable' },
    book: { title: (metadata?.bookTitle as string) || book?.title || 'Record unavailable', category: book?.category },
    integrityClassification,
    verificationHash: cert.verification_hash || undefined,
    revoked: !!cert.revoked_at,
    revokedAt: cert.revoked_at,
    revokedReason: cert.revoked_reason || 'Certificate has been revoked',
    verification_status: cert.revoked_at ? 'revoked' : 'verified',
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
