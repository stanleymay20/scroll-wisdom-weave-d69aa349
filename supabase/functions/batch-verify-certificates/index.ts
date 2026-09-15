import {
  clientIp,
  enforceDurableRateLimit,
  serviceClient,
} from '../_shared/http.ts';
import { CERTIFICATE_ISSUER } from '../_shared/contract-canonical.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const MAX_BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const raw = body?.certificateNumbers ?? body?.certificates;
    if (!Array.isArray(raw) || raw.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'certificateNumbers must be a non-empty array' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (raw.length > MAX_BATCH_SIZE) {
      return new Response(JSON.stringify({ success: false, error: `Maximum ${MAX_BATCH_SIZE} learning records per request` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const numbers = [...new Set(raw.filter((value: unknown): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
    if (numbers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid learning-record numbers supplied' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = serviceClient();
    const limited = await enforceDurableRateLimit(admin, {
      name: 'batch-verify-certificates',
      key: clientIp(req),
      limit: 20,
      windowSec: 60,
    });
    if (limited) return limited;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Server configuration unavailable');

    // Contract 7B is a batch projection of the single authoritative verifier.
    // It contains no independent validity rule that could drift.
    const results = await Promise.all(numbers.map(async certificateNumber => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/verify-certificate?number=${encodeURIComponent(certificateNumber)}`, {
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404) return { certificateNumber, status: 'not_found', valid: false, found: false };
        if (!response.ok && payload?.status !== 'unverifiable') {
          return { certificateNumber, status: 'unverifiable', valid: false, found: true, reasons: ['Verification service failed closed'] };
        }
        return payload;
      } catch {
        return { certificateNumber, status: 'unverifiable', valid: false, found: true, reasons: ['Verification service unavailable'] };
      }
    }));

    const count = (status: string) => results.filter(result => result?.status === status).length;
    return new Response(JSON.stringify({
      success: true,
      totalRequested: numbers.length,
      totalVerified: results.length,
      totalValid: count('valid'),
      totalInvalid: count('invalid'),
      totalRevoked: count('revoked'),
      totalUnverifiable: count('unverifiable'),
      totalNotFound: count('not_found'),
      results,
      issuer: {
        authority: CERTIFICATE_ISSUER.authority,
        verifiedAt: new Date().toISOString(),
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[batch-verify-certificates]', error);
    return new Response(JSON.stringify({ success: false, error: 'Batch verification failed closed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
