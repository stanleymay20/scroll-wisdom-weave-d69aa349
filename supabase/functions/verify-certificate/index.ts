/**
 * CONTRACT 6D — Public Verification API
 * 
 * GET endpoint for employers and institutions to verify certificates.
 * Read-only, no auth required, cacheable.
 * 
 * Returns standardized JSON response with certificate validity.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
};

// 6A — Immutable Issuer Identity
const CERTIFICATE_ISSUER = {
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
  title: 'Chief Executive Officer',
} as const;

interface VerificationResponse {
  valid: boolean;
  certificateNumber?: string;
  certificateType?: 'completion' | 'mastery' | 'publishing' | 'authorship';
  issuedAt?: string;
  issuer?: {
    authority: string;
    representative: string;
  };
  recipient?: {
    name: string;
  };
  book?: {
    title: string;
    category?: string;
  };
  integrityClassification?: 'trusted' | 'review' | 'flagged';
  verificationHash?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
  error?: string;
  reason?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: 'Method not allowed',
        reason: 'Only GET requests are supported' 
      }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const url = new URL(req.url);
    const certificateNumber = url.searchParams.get('number');

    if (!certificateNumber) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Missing certificate number',
          reason: 'Provide certificate number via ?number=SL-CERT-XXXX' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch certificate with book details
    const { data: cert, error: dbError } = await supabase
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
          category
        )
      `)
      .eq('certificate_number', certificateNumber)
      .maybeSingle();

    if (dbError) {
      console.error('[verify-certificate] Database error:', dbError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Verification failed',
          reason: 'Database error during verification' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Certificate not found
    if (!cert) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          certificateNumber,
          reason: 'Certificate not found or does not exist' 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse metadata
    const metadata = cert.metadata as Record<string, unknown> | null;
    const book = (Array.isArray(cert.books) ? cert.books[0] : cert.books) as { id: string; title: string; category: string } | null;

    // CRITICAL: Integrity score MUST exist in stored metadata - NO FALLBACK
    // If missing, the certificate was issued incorrectly
    const storedIntegrityScore = metadata?.integrityScore as number | undefined;
    
    if (storedIntegrityScore === undefined || storedIntegrityScore === null) {
      console.warn(`[verify-certificate] Certificate ${certificateNumber} missing integrity score - STRICT MODE: invalidating`);
      // STRICT POLICY: Certificates without integrity data are NOT verifiable
      // This positions ScrollLibrary as post-AI-cheating era authority
      return new Response(
        JSON.stringify({ 
          valid: false, // STRICT: Cannot verify without integrity data
          certificateNumber: cert.certificate_number,
          reason: 'Legacy certificate — not verifiable. Certificate was issued before integrity tracking was implemented.',
        }),
        { 
          status: 200, // Still 200 - this is a valid response, just not a valid certificate
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Determine integrity classification from STORED score only
    let integrityClassification: 'trusted' | 'review' | 'flagged' = 'trusted';
    if (storedIntegrityScore < 0.6) {
      integrityClassification = 'flagged';
    } else if (storedIntegrityScore < 0.9) {
      integrityClassification = 'review';
    }

    // Build response using STORED data only - no defaults
    const response: VerificationResponse = {
      valid: !cert.revoked_at,
      certificateNumber: cert.certificate_number,
      certificateType: (cert.certificate_type || metadata?.certificateType) as VerificationResponse['certificateType'],
      issuedAt: cert.issued_at,
      issuer: {
        authority: CERTIFICATE_ISSUER.authority,
        representative: CERTIFICATE_ISSUER.representative,
      },
      recipient: {
        name: (metadata?.recipientName as string) || 'Record unavailable',
      },
      book: {
        title: (metadata?.bookTitle as string) || book?.title || 'Record unavailable',
        category: book?.category,
      },
      integrityClassification,
      verificationHash: cert.verification_hash || undefined,
    };

    // Add revocation info if revoked
    if (cert.revoked_at) {
      response.revoked = true;
      response.revokedAt = cert.revoked_at;
      response.revokedReason = cert.revoked_reason || 'Certificate has been revoked';
    }

    console.log(`[verify-certificate] Verified: ${certificateNumber}, valid: ${response.valid}`);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[verify-certificate] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: 'Internal server error',
        reason: 'An unexpected error occurred during verification' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
