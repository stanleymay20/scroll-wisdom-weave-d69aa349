/**
 * export-user-data — self-service GDPR access/portability package.
 *
 * The package intentionally contains portable account, content, learning,
 * commerce and creator records. Ephemeral auth/OAuth state and secret material
 * are excluded from the downloadable payload. A user can still request a
 * broader Article 15 access review through privacy support.
 *
 * Every exported query paginates to completion and the endpoint fails closed:
 * schema/query drift must never produce a superficially successful but partial
 * file.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAGE_SIZE = 1000;
const QUERY_CONCURRENCY = 8;

const PORTABLE_USER_TABLES = [
  'profiles',
  'user_library',
  'bookmarks',
  'highlights',
  'reading_sessions',
  'reading_streaks',
  'reading_goals',
  'reading_progress',
  'spaced_repetition_cards',
  'quiz_attempts',
  'quiz_question_history',
  'assessment_sessions',
  'assessment_session_answers',
  'learning_progress',
  'learner_concept_states',
  'competency_profile',
  'competency_progress',
  'competency_certificates',
  'publishing_certificates',
  'mastery_attempts',
  'saved_decks',
  'saved_learning_decks',
  'pmf_events',
  'ai_usage_tracking',
  'assessment_integrity_logs',
  'audit_telemetry',
  'generation_jobs',
  'book_audits',
  'author_profiles',
  'authorship_audit_log',
  'book_collaborators',
  'book_reviews',
  'book_series',
  'chapter_edit_sessions',
  'citation_flags',
  'creator_entitlement_snapshots',
  'creator_entitlements',
  'creator_notifications',
  'creator_payout_profiles',
  'export_jobs',
  'external_publications',
  'financial_events',
  'humanization_passes',
  'interactive_voice_usage',
  'isbn_claim_requests',
  'organization_members',
  'publication_gate_attestations',
  'publishing_audit_log',
  'publishing_audits',
  'publishing_readiness_snapshots',
  'purchases',
  'recommendation_feedback',
  'rights_holders',
  'search_queries',
  'storefront_events',
  'study_notes',
  'subscriptions',
  'tts_usage',
  'usage_gate_events',
  'user_gamification',
  'user_roles',
  'work_authors',
  'attribution_sessions',
  'contact_submissions',
] as const;

type QueryResult = { data: unknown[] | null; error: { message: string } | null };
type PageQuery = (from: number, to: number) => PromiseLike<QueryResult>;

async function fetchAll(label: string, query: PageQuery): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function exportUserTable(admin: any, table: string, userId: string) {
  return fetchAll(table, (from, to) =>
    admin.from(table).select('*').eq('user_id', userId).range(from, to)
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
      console.error('[export-user-data] required runtime configuration is missing');
      return json({ error: 'Export service unavailable' }, 503);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Invalid token' }, 401);
    }
    const user = userData.user;
    const userId = user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // This endpoint can fan out across many account tables. Keep repeated
    // self-service exports bounded across edge instances.
    const { data: rateData, error: rateError } = await admin.rpc('consume_rate_limit', {
      _identifier: userId,
      _endpoint: 'export-user-data',
      _limit: 6,
      _window_seconds: 60 * 60,
    });
    if (rateError) {
      console.error('[export-user-data] rate-limit check failed', rateError);
    } else {
      const row = (Array.isArray(rateData) ? rateData[0] : rateData) as
        { allowed?: boolean; retry_after_seconds?: number } | null;
      if (row?.allowed === false) {
        return new Response(
          JSON.stringify({ error: 'Too many export requests. Please try again later.' }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(Math.max(1, Number(row.retry_after_seconds) || 60)),
            },
          },
        );
      }
    }

    const result: Record<string, unknown> = {
      _meta: {
        generated_at: new Date().toISOString(),
        user_id: userId,
        format: 'scrolllibrary.gdpr.v2',
        scope: 'self_service_portability',
        notice:
          'Portable account, content, learning, commerce and creator data. Keep this file secure.',
        excluded_from_self_service: [
          'password hashes and authentication secrets',
          'OAuth anti-forgery state',
          'encrypted connected-platform access and refresh tokens',
          'security-only anti-abuse signals',
        ],
        broader_access_request:
          'For a broader GDPR Article 15 access request, contact privacy@scrolllibrary.org.',
      },
      account: {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        user_metadata: user.user_metadata ?? {},
      },
    };

    // Export direct user_id-owned portable tables in bounded concurrent batches.
    for (let i = 0; i < PORTABLE_USER_TABLES.length; i += QUERY_CONCURRENCY) {
      const batch = PORTABLE_USER_TABLES.slice(i, i + QUERY_CONCURRENCY);
      const exported = await Promise.all(
        batch.map(async (table) => [table, await exportUserTable(admin, table, userId)] as const),
      );
      for (const [table, rows] of exported) result[table] = rows;
    }

    result.books = await fetchAll('books', (from, to) =>
      admin.from('books').select('*')
        .or(`user_id.eq.${userId},creator_id.eq.${userId}`)
        .range(from, to)
    );

    result.audit_log = await fetchAll('audit_log', (from, to) =>
      admin.from('audit_log').select('*').eq('actor_id', userId)
        .order('created_at', { ascending: false }).range(from, to)
    );

    result.author_followers = await fetchAll('author_followers', (from, to) =>
      admin.from('author_followers').select('*')
        .or(`follower_user_id.eq.${userId},author_user_id.eq.${userId}`)
        .range(from, to)
    );

    result.book_purchases = await fetchAll('book_purchases', (from, to) =>
      admin.from('book_purchases').select('*').eq('buyer_user_id', userId).range(from, to)
    );

    result.refund_requests = await fetchAll('refund_requests', (from, to) =>
      admin.from('refund_requests').select('*')
        .or(`buyer_user_id.eq.${userId},requested_by.eq.${userId}`)
        .range(from, to)
    );

    result.ownership_transfers = await fetchAll('ownership_transfers', (from, to) =>
      admin.from('ownership_transfers').select('*').eq('requested_by', userId).range(from, to)
    );

    // Include connection metadata but never put reusable provider credentials
    // into a downloadable browser file.
    result.creator_platform_connections = await fetchAll(
      'creator_platform_connections',
      (from, to) =>
        admin.from('creator_platform_connections')
          .select(
            'id,user_id,platform,token_expires_at,external_creator_id,external_creator_name,scopes,connection_status,last_error,created_at,updated_at,last_used_at,shop_domain,revoked_at,disconnected_at,last_success_at,consecutive_failures',
          )
          .eq('user_id', userId)
          .range(from, to),
    );

    return json(result, 200);
  } catch (e) {
    console.error('[export-user-data] export failed', e);
    return json({ error: 'Unable to prepare a complete export. Please try again or contact privacy support.' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
