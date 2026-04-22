/**
 * export-user-data — GDPR Article 15/20 endpoint
 *
 * Returns a single JSON document containing every record the requesting
 * authenticated user owns. Uses the service role to bypass RLS so the
 * payload is complete (RLS would still allow most of it, but joined queries
 * across tables are simpler and faster server-side).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TABLES_BY_USER_ID = [
  'profiles',
  'user_library',
  'bookmarks',
  'highlights',
  'reading_sessions',
  'reading_streaks',
  'reading_goals',
  'spaced_repetition_cards',
  'quiz_attempts',
  'quiz_question_history',
  'learning_progress',
  'learner_concept_states',
  'competency_profile',
  'competency_progress',
  'competency_certificates',
  'publishing_certificates',
  'saved_decks',
  'saved_learning_decks',
  'pmf_events',
  'ai_usage_tracking',
  'assessment_integrity_logs',
  'audit_telemetry',
  'generation_jobs',
  'book_audits',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate JWT against anon client (verify_jwt is off for this function so we do it here)
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Invalid token' }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const result: Record<string, unknown> = {
      _meta: {
        generated_at: new Date().toISOString(),
        user_id: userId,
        email: userData.user.email,
        format: 'scrolllibrary.gdpr.v1',
        notice:
          'This file contains every record we hold about you. Keep it secure. ' +
          'You may use it for portability or as evidence of access requests under GDPR Articles 15 and 20.',
      },
    };

    for (const table of TABLES_BY_USER_ID) {
      try {
        const { data, error } = await admin.from(table).select('*').eq('user_id', userId);
        result[table] = error ? { error: error.message } : data || [];
      } catch (e) {
        result[table] = { error: (e as Error).message };
      }
    }

    // Books authored by user (creator_id OR user_id)
    try {
      const { data } = await admin
        .from('books')
        .select('*')
        .or(`user_id.eq.${userId},creator_id.eq.${userId}`);
      result.books = data || [];
    } catch (e) {
      result.books = { error: (e as Error).message };
    }

    // Audit log: events the user actively triggered
    try {
      const { data } = await admin
        .from('audit_log')
        .select('*')
        .eq('actor_id', userId)
        .order('created_at', { ascending: false })
        .limit(5000);
      result.audit_log = data || [];
    } catch (e) {
      result.audit_log = { error: (e as Error).message };
    }

    return json(result, 200);
  } catch (e) {
    return json({ error: (e as Error).message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
