import { CERTIFICATE_ISSUER } from '../_shared/contract-canonical.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const LABELS: Record<string, string> = {
  completion: 'Structured Study Completion Record',
  mastery: 'Mastery Learning Record',
  publishing: 'AI Content Generation Record',
  authorship: 'Content Generation Record',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusColor(status: string): string {
  if (status === 'valid') return '#15803d';
  if (status === 'unverifiable') return '#b45309';
  return '#b91c1c';
}

function renderPrintable(record: any): string {
  const status = String(record.status || 'unverifiable');
  const label = LABELS[String(record.certificateType || '')] || 'ScrollLibrary Learning Record';
  const reasons = Array.isArray(record.reasons) ? record.reasons : [];
  const provenance = record.provenance || {};
  const integrity = record.integrity || {};
  const assessment = record.assessment || {};
  const valid = status === 'valid';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(label)} - ${escapeHtml(record.certificateNumber)}</title>
<style>
@page{size:A4;margin:20mm}body{font-family:system-ui,-apple-system,sans-serif;color:#172033;max-width:760px;margin:auto;padding:24px}.header{text-align:center}.brand{font-size:24px;font-weight:700}.status{display:inline-block;margin:18px 0;padding:8px 18px;border-radius:999px;color:white;background:${statusColor(status)};font-weight:700;text-transform:uppercase}.card{border:1px solid #d8dee9;border-radius:12px;padding:18px;margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.label{font-size:11px;text-transform:uppercase;color:#667085;letter-spacing:.06em}.value{font-size:14px;font-weight:600;margin-top:4px}.mono{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all}.warning{background:#fff7ed;border-color:#fed7aa}.invalid{background:#fef2f2;border-color:#fecaca}.footer{font-size:11px;color:#667085;margin-top:28px;text-align:center}</style></head>
<body>
<div class="header"><div class="brand">ScrollLibrary</div><div>Certification Authority</div><div class="status">${escapeHtml(status)}</div><h1>${escapeHtml(label)}</h1><h2>${escapeHtml(record.book?.title || 'Book record')}</h2><p>Holder: <strong>${escapeHtml(record.holder || 'Not publicly disclosed')}</strong></p></div>
${!valid ? `<div class="card ${status === 'unverifiable' ? 'warning' : 'invalid'}"><strong>This export is not a validity certificate.</strong><p>Status: ${escapeHtml(status)}.</p>${reasons.length ? `<ul>${reasons.map((reason: string) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}</div>` : ''}
<div class="card grid">
<div><div class="label">Record number</div><div class="value">${escapeHtml(record.certificateNumber)}</div></div>
<div><div class="label">Issued</div><div class="value">${escapeHtml(record.issuedAt ? new Date(record.issuedAt).toISOString().slice(0,10) : 'Unknown')}</div></div>
<div><div class="label">Learner coverage</div><div class="value">${escapeHtml(record.coveragePercentage ?? 0)}%</div></div>
<div><div class="label">Integrity</div><div class="value">${escapeHtml(integrity.score === undefined ? 'Unknown' : `${Math.round(Number(integrity.score) * 100)}% (${integrity.classification || 'unknown'})`)}</div></div>
<div><div class="label">Assessment contract</div><div class="value">${escapeHtml(assessment.contractVersion || 'Unavailable')} · ${assessment.contractPassed ? 'passed' : 'not proven'}</div></div>
<div><div class="label">Provenance</div><div class="value">${provenance.hashMatch === true ? 'Live SHA-256 match' : provenance.hashMatch === false ? 'SHA-256 mismatch' : 'Not verifiable'}</div></div>
</div>
${provenance.storedHash ? `<div class="card"><div class="label">Issuance SHA-256</div><div class="mono">${escapeHtml(provenance.storedHash)}</div>${provenance.currentHash ? `<div class="label" style="margin-top:12px">Current SHA-256</div><div class="mono">${escapeHtml(provenance.currentHash)}</div>` : ''}</div>` : ''}
<div class="card"><div class="label">Issuer</div><div class="value">${escapeHtml(CERTIFICATE_ISSUER.authority)}</div><div>${escapeHtml(CERTIFICATE_ISSUER.representative)}, ${escapeHtml(CERTIFICATE_ISSUER.title)}</div></div>
<div class="footer">This record documents ScrollLibrary platform learning evidence. It is not an accredited degree, professional licence, copyright grant, or employment-eligibility determination.</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const url = new URL(req.url);
    const number = (url.searchParams.get('number') || '').trim();
    const format = url.searchParams.get('format') || 'json';
    if (!number) return new Response(JSON.stringify({ error: 'Certificate number is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!['json', 'pdf'].includes(format)) return new Response(JSON.stringify({ error: 'format must be json or pdf' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Server configuration unavailable');

    // Export is a projection of the authoritative verifier. It never independently
    // upgrades a database row to valid.
    const verifyResponse = await fetch(`${supabaseUrl}/functions/v1/verify-certificate?number=${encodeURIComponent(number)}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    const verification = await verifyResponse.json().catch(() => ({}));
    if (verifyResponse.status === 404 || verification?.status === 'not_found') {
      return new Response(JSON.stringify({ error: 'Learning record not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!verifyResponse.ok && verification?.status !== 'unverifiable') {
      throw new Error('Authoritative verification failed');
    }

    const exportData = {
      schemaVersion: '8.0',
      exportedAt: new Date().toISOString(),
      source: 'ScrollLibrary server-authoritative verification',
      ...verification,
      issuer: CERTIFICATE_ISSUER,
      disclaimer: 'This record documents ScrollLibrary platform learning evidence. It is not an accredited degree, professional licence, copyright grant, or employment-eligibility determination.',
    };

    if (format === 'pdf') {
      return new Response(renderPrintable(exportData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="learning-record-${number}.html"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="learning-record-${number}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[export-certificate]', error);
    return new Response(JSON.stringify({ error: 'Export failed closed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
