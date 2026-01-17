/**
 * CONTRACT 7A — Certificate Export API
 * 
 * Exports certificates in portable formats:
 * - JSON (machine-readable)
 * - PDF (visual, human-readable)
 * 
 * Read-only, no auth required for public certificates.
 * Schema versioning for forward compatibility.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// 7A — Schema Version (for forward compatibility)
const CERTIFICATE_SCHEMA_VERSION = '7.0';

// 6A — Immutable Issuer Identity
const CERTIFICATE_ISSUER = {
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
  title: 'Chief Executive Officer',
  verificationUrl: 'https://scroll-wisdom-weave.lovable.app/certificate',
} as const;

interface CertificateExport {
  schemaVersion: string;
  exportedAt: string;
  format: 'json' | 'pdf';
  certificate: {
    number: string;
    type: 'completion' | 'mastery' | 'publishing' | 'authorship';
    status: 'valid' | 'revoked';
    issuedAt: string;
    revokedAt?: string;
    revokedReason?: string;
  };
  recipient: {
    name: string;
  };
  achievement: {
    bookTitle: string;
    bookCategory?: string;
    chaptersCompleted: number;
    totalChapters: number;
    integrityScore: number;
    integrityClassification: 'trusted' | 'review' | 'flagged';
  };
  issuer: {
    authority: string;
    representative: string;
    title: string;
  };
  verification: {
    hash: string;
    url: string;
    apiEndpoint: string;
  };
}

function getIntegrityClassification(score: number): 'trusted' | 'review' | 'flagged' {
  if (score >= 0.9) return 'trusted';
  if (score >= 0.6) return 'review';
  return 'flagged';
}

function generatePDFContent(data: CertificateExport): string {
  // Generate a simple HTML-based PDF content
  // In production, this would use a proper PDF library
  const isRevoked = data.certificate.status === 'revoked';
  const statusColor = isRevoked ? '#dc2626' : '#16a34a';
  const statusText = isRevoked ? 'REVOKED' : 'VERIFIED';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Certificate - ${data.certificate.number}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { 
      font-family: 'Georgia', serif; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 40px;
      background: linear-gradient(135deg, #fefefe 0%, #f8f8f8 100%);
    }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #8b5a2b; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
    .status-badge {
      display: inline-block;
      padding: 8px 24px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
      color: white;
      background: ${statusColor};
      margin: 20px 0;
    }
    .certificate-type {
      font-size: 28px;
      font-weight: bold;
      text-align: center;
      margin: 30px 0 10px;
      color: #333;
    }
    .book-title {
      font-size: 22px;
      text-align: center;
      font-style: italic;
      color: #555;
      margin-bottom: 30px;
    }
    .recipient {
      text-align: center;
      margin: 30px 0;
    }
    .recipient-label { font-size: 12px; color: #888; text-transform: uppercase; }
    .recipient-name { font-size: 24px; font-weight: bold; color: #333; margin-top: 8px; }
    .details { 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 20px; 
      margin: 40px 0;
      padding: 20px;
      background: #f9f9f9;
      border-radius: 8px;
    }
    .detail-item { }
    .detail-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
    .detail-value { font-size: 14px; color: #333; font-weight: 500; }
    .verification {
      margin-top: 40px;
      padding: 20px;
      background: #f0f0f0;
      border-radius: 8px;
      text-align: center;
    }
    .verification-hash {
      font-family: monospace;
      font-size: 12px;
      background: white;
      padding: 8px 16px;
      border-radius: 4px;
      margin: 10px 0;
      word-break: break-all;
    }
    .verification-url {
      font-size: 11px;
      color: #666;
    }
    .issuer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
    }
    .issuer-name { font-weight: bold; color: #333; }
    .issuer-title { font-size: 12px; color: #666; }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      color: #999;
    }
    .schema-version { font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">📜 ScrollLibrary</div>
    <div class="subtitle">Certification Authority</div>
    <div class="status-badge">${statusText}</div>
  </div>

  <div class="certificate-type">
    ${data.certificate.type === 'mastery' ? 'Certificate of Mastery' : 
      data.certificate.type === 'completion' ? 'Certificate of Completion' :
      data.certificate.type === 'publishing' ? 'Publishing Rights Certificate' :
      'Authorship Verification'}
  </div>

  <div class="book-title">"${data.achievement.bookTitle}"</div>

  <div class="recipient">
    <div class="recipient-label">Awarded To</div>
    <div class="recipient-name">${data.recipient.name}</div>
  </div>

  <div class="details">
    <div class="detail-item">
      <div class="detail-label">Certificate Number</div>
      <div class="detail-value">${data.certificate.number}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Issue Date</div>
      <div class="detail-value">${new Date(data.certificate.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Chapters Completed</div>
      <div class="detail-value">${data.achievement.chaptersCompleted} / ${data.achievement.totalChapters}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Integrity Status</div>
      <div class="detail-value">${data.achievement.integrityClassification.charAt(0).toUpperCase() + data.achievement.integrityClassification.slice(1)}</div>
    </div>
  </div>

  ${isRevoked ? `
  <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <strong style="color: #dc2626;">⚠️ Certificate Revoked</strong>
    <p style="margin: 8px 0 0; color: #991b1b;">${data.certificate.revokedReason || 'This certificate has been revoked.'}</p>
  </div>
  ` : ''}

  <div class="verification">
    <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Verification Hash</div>
    <div class="verification-hash">${data.verification.hash}</div>
    <div class="verification-url">
      Verify at: <strong>${data.verification.url}/${data.certificate.number}</strong>
    </div>
  </div>

  <div class="issuer">
    <div class="issuer-name">${data.issuer.authority}</div>
    <div class="issuer-title">${data.issuer.representative}, ${data.issuer.title}</div>
  </div>

  <div class="footer">
    <p>This certificate is independently verifiable.</p>
    <p class="schema-version">Schema Version: ${data.schemaVersion} | Exported: ${new Date(data.exportedAt).toISOString()}</p>
  </div>
</body>
</html>
  `.trim();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const certificateNumber = url.searchParams.get('number');
    const format = url.searchParams.get('format') || 'json';

    if (!certificateNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing certificate number. Use ?number=SL-CERT-XXXX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['json', 'pdf'].includes(format)) {
      return new Response(
        JSON.stringify({ error: 'Invalid format. Use ?format=json or ?format=pdf' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      console.error('[export-certificate] Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Export failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!cert) {
      return new Response(
        JSON.stringify({ error: 'Certificate not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse metadata
    const metadata = cert.metadata as Record<string, unknown> | null;
    const book = (Array.isArray(cert.books) ? cert.books[0] : cert.books) as { id: string; title: string; category: string } | null;

    // STRICT: Integrity score MUST exist
    const integrityScore = metadata?.integrityScore as number | undefined;
    if (integrityScore === undefined || integrityScore === null) {
      return new Response(
        JSON.stringify({ 
          error: 'Certificate not exportable',
          reason: 'Legacy certificate without integrity data cannot be exported'
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build export data
    const exportData: CertificateExport = {
      schemaVersion: CERTIFICATE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      format: format as 'json' | 'pdf',
      certificate: {
        number: cert.certificate_number,
        type: (cert.certificate_type || metadata?.certificateType || 'completion') as CertificateExport['certificate']['type'],
        status: cert.revoked_at ? 'revoked' : 'valid',
        issuedAt: cert.issued_at,
        ...(cert.revoked_at && { revokedAt: cert.revoked_at }),
        ...(cert.revoked_reason && { revokedReason: cert.revoked_reason }),
      },
      recipient: {
        name: (metadata?.recipientName as string) || 'Record unavailable',
      },
      achievement: {
        bookTitle: (metadata?.bookTitle as string) || book?.title || 'Record unavailable',
        bookCategory: book?.category,
        chaptersCompleted: (metadata?.chaptersCompleted as number) || (metadata?.totalChapters as number) || 0,
        totalChapters: (metadata?.totalChapters as number) || 0,
        integrityScore,
        integrityClassification: getIntegrityClassification(integrityScore),
      },
      issuer: {
        authority: CERTIFICATE_ISSUER.authority,
        representative: CERTIFICATE_ISSUER.representative,
        title: CERTIFICATE_ISSUER.title,
      },
      verification: {
        hash: cert.verification_hash || '',
        url: CERTIFICATE_ISSUER.verificationUrl,
        apiEndpoint: `${supabaseUrl}/functions/v1/verify-certificate?number=${cert.certificate_number}`,
      },
    };

    console.log(`[export-certificate] Exported: ${certificateNumber}, format: ${format}`);

    // Return based on format
    if (format === 'pdf') {
      const pdfHtml = generatePDFContent(exportData);
      return new Response(pdfHtml, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="certificate-${certificateNumber}.html"`,
        },
      });
    }

    // JSON format (default)
    return new Response(
      JSON.stringify(exportData, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="certificate-${certificateNumber}.json"`,
        } 
      }
    );

  } catch (error) {
    console.error('[export-certificate] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
