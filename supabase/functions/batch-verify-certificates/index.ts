/**
 * CONTRACT 7B — Batch Certificate Verification API
 * 
 * POST endpoint for employers and institutions to verify multiple certificates at once.
 * Rate-limited, no auth required (public verification).
 * 
 * Accepts array of certificate numbers, returns verification status for each.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'public, max-age=60', // Cache for 1 minute
};

// Rate limiting: max 100 certificates per request
const MAX_BATCH_SIZE = 100;

// Issuer identity (same as verify-certificate)
const CERTIFICATE_ISSUER = {
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
} as const;

interface CertificateVerificationResult {
  certificateNumber: string;
  valid: boolean;
  certificateType?: 'completion' | 'mastery' | 'publishing' | 'authorship';
  issuedAt?: string;
  recipientName?: string;
  bookTitle?: string;
  integrityClassification?: 'trusted' | 'review' | 'flagged';
  revoked?: boolean;
  revokedReason?: string;
  error?: string;
  reason?: string;
}

interface BatchVerificationResponse {
  success: boolean;
  totalRequested: number;
  totalVerified: number;
  totalValid: number;
  totalInvalid: number;
  results: CertificateVerificationResult[];
  issuer: {
    authority: string;
    verifiedAt: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Method not allowed',
        reason: 'Only POST requests are supported' 
      }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const body = await req.json();
    const certificateNumbers: string[] = body.certificateNumbers || body.certificates || [];

    // Validate input
    if (!Array.isArray(certificateNumbers) || certificateNumbers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request',
          reason: 'Provide an array of certificate numbers in the request body as "certificateNumbers"' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Rate limit: max batch size
    if (certificateNumbers.length > MAX_BATCH_SIZE) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Batch size exceeded',
          reason: `Maximum ${MAX_BATCH_SIZE} certificates per request. You requested ${certificateNumbers.length}.` 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate all certificate numbers are strings
    const validNumbers = certificateNumbers.filter(n => typeof n === 'string' && n.trim().length > 0);
    if (validNumbers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid certificate numbers',
          reason: 'All provided certificate numbers must be non-empty strings' 
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

    // Fetch all certificates in one query
    const { data: certificates, error: dbError } = await supabase
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
      .in('certificate_number', validNumbers);

    if (dbError) {
      console.error('[batch-verify] Database error:', dbError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Verification failed',
          reason: 'Database error during verification' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create a map for quick lookup
    const certMap = new Map(
      (certificates || []).map(c => [c.certificate_number, c])
    );

    // Process each requested certificate number
    const results: CertificateVerificationResult[] = validNumbers.map(certNumber => {
      const cert = certMap.get(certNumber);

      // Certificate not found
      if (!cert) {
        return {
          certificateNumber: certNumber,
          valid: false,
          reason: 'Certificate not found',
        };
      }

      const metadata = cert.metadata as Record<string, unknown> | null;
      const book = (Array.isArray(cert.books) ? cert.books[0] : cert.books) as { title: string } | null;

      // STRICT: Check for integrity score - required for verification
      const storedIntegrityScore = metadata?.integrityScore as number | undefined;
      
      if (storedIntegrityScore === undefined || storedIntegrityScore === null) {
        return {
          certificateNumber: cert.certificate_number,
          valid: false,
          reason: 'Legacy certificate — not verifiable',
        };
      }

      // Determine integrity classification
      let integrityClassification: 'trusted' | 'review' | 'flagged' = 'trusted';
      if (storedIntegrityScore < 0.6) {
        integrityClassification = 'flagged';
      } else if (storedIntegrityScore < 0.9) {
        integrityClassification = 'review';
      }

      const result: CertificateVerificationResult = {
        certificateNumber: cert.certificate_number,
        valid: !cert.revoked_at,
        certificateType: (cert.certificate_type || metadata?.certificateType) as CertificateVerificationResult['certificateType'],
        issuedAt: cert.issued_at,
        recipientName: metadata?.recipientName as string || undefined,
        bookTitle: metadata?.bookTitle as string || book?.title || undefined,
        integrityClassification,
      };

      // Add revocation info if revoked
      if (cert.revoked_at) {
        result.revoked = true;
        result.revokedReason = cert.revoked_reason || 'Certificate has been revoked';
      }

      return result;
    });

    // Calculate statistics
    const totalValid = results.filter(r => r.valid).length;
    const totalInvalid = results.filter(r => !r.valid).length;

    const response: BatchVerificationResponse = {
      success: true,
      totalRequested: validNumbers.length,
      totalVerified: results.length,
      totalValid,
      totalInvalid,
      results,
      issuer: {
        authority: CERTIFICATE_ISSUER.authority,
        verifiedAt: new Date().toISOString(),
      },
    };

    console.log(`[batch-verify] Verified ${results.length} certificates: ${totalValid} valid, ${totalInvalid} invalid`);

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[batch-verify] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
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
