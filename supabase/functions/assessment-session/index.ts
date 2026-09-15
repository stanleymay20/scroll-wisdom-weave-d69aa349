import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ASSESSMENT_RIGOR_REQUIREMENTS,
  CONTRACT_VERSIONS,
} from '../_shared/contract-canonical.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)));
}

function tierForQuestion(question: any): 1 | 2 | 3 | 4 {
  if ([1, 2, 3, 4].includes(Number(question?.tier))) return Number(question.tier) as 1 | 2 | 3 | 4;
  const bloom = String(question?.bloomLevel || question?.bloom_level || '').toLowerCase();
  if (bloom === 'create') return 4;
  if (bloom === 'evaluate') return 3;
  if (bloom === 'apply' || bloom === 'analyze') return 2;
  return 1;
}

function isCodingQuestion(question: any): boolean {
  const type = String(question?.questionType || question?.type || '').toLowerCase();
  return type.includes('coding') || type.includes('code') || Boolean(question?.codeSnippet);
}

function validateAssessmentContract(questions: any[], mode: 'completion' | 'mastery', bookType: string) {
  const requirements = ASSESSMENT_RIGOR_REQUIREMENTS[mode];
  const tierBreakdown: Record<'1' | '2' | '3' | '4', number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  let codingQuestionCount = 0;

  for (const question of questions) {
    tierBreakdown[String(tierForQuestion(question)) as keyof typeof tierBreakdown] += 1;
    if (isCodingQuestion(question)) codingQuestionCount += 1;
  }

  const tier1Ratio = questions.length ? tierBreakdown['1'] / questions.length : 1;
  const reasons: string[] = [];
  if (questions.length < requirements.minTotalQuestions) reasons.push(`Need ${requirements.minTotalQuestions} questions`);
  if (tierBreakdown['2'] < requirements.minTier2Questions) reasons.push(`Need ${requirements.minTier2Questions} Tier 2 questions`);
  if (tierBreakdown['3'] < requirements.minTier3Questions) reasons.push(`Need ${requirements.minTier3Questions} Tier 3 questions`);
  if (tierBreakdown['4'] < requirements.minTier4Questions) reasons.push(`Need ${requirements.minTier4Questions} Tier 4 questions`);
  if (tier1Ratio > requirements.maxTier1Ratio) reasons.push(`Tier 1 ratio exceeds ${requirements.maxTier1Ratio}`);
  if (bookType === 'technical') {
    const requiredCoding = mode === 'mastery' ? 2 : 1;
    if (codingQuestionCount < requiredCoding) reasons.push(`Technical assessment needs ${requiredCoding} coding question(s)`);
  }

  return { passed: reasons.length === 0, reasons, tierBreakdown, codingQuestionCount };
}

function sanitizeQuestion(question: any, index: number) {
  const { correctIndex, correct_index, reasoningExplanation, explanation, ...safe } = question || {};
  return { ...safe, id: safe.id || `q-${index + 1}`, tier: tierForQuestion(question) };
}

async function generateBatch(
  supabaseUrl: string,
  authHeader: string,
  body: Record<string, unknown>,
  bloomLevel: string,
  questionCount: number,
  previousQuestionTexts: string[],
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/mastery-assessment`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, bloomLevel, questionCount, previousQuestionTexts }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `mastery-assessment failed (${response.status})`);
  if (!Array.isArray(payload?.questions)) throw new Error('mastery-assessment returned no questions');
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration unavailable' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const service = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const requestBody = await req.json();
    const action = String(requestBody?.action || '');

    if (action === 'start') {
      const bookId = String(requestBody?.bookId || '');
      const chapterId = String(requestBody?.chapterId || '');
      const mode: 'completion' | 'mastery' = requestBody?.mode === 'mastery' ? 'mastery' : 'completion';
      if (!bookId || !chapterId) return json({ error: 'bookId and chapterId are required' }, 400);

      const [{ data: book, error: bookError }, { data: chapter, error: chapterError }] = await Promise.all([
        service.from('books').select('id,title,book_type,is_published,user_id').eq('id', bookId).single(),
        service.from('chapters').select('id,book_id,title,content,chapter_number').eq('id', chapterId).eq('book_id', bookId).single(),
      ]);
      if (bookError || !book || chapterError || !chapter) return json({ error: 'Book or chapter not found' }, 404);

      if (!book.is_published && book.user_id !== user.id) {
        const { data: library } = await service.from('user_library').select('id').eq('user_id', user.id).eq('book_id', bookId).maybeSingle();
        if (!library) return json({ error: 'Forbidden' }, 403);
      }

      const shared = {
        chapterContent: String(chapter.content || '').slice(0, 10000),
        chapterTitle: String(chapter.title || `Chapter ${chapter.chapter_number}`),
        bookTitle: String(book.title || ''),
        bookType: String(book.book_type || 'text'),
        difficulty: Number(requestBody?.difficulty || 3),
      };

      const plan = mode === 'mastery'
        ? [{ bloom: 'analyze', count: 2 }, { bloom: 'evaluate', count: 2 }, { bloom: 'create', count: 1 }, { bloom: 'apply', count: 2 }]
        : [{ bloom: 'analyze', count: 2 }, { bloom: 'evaluate', count: 1 }, { bloom: 'apply', count: 2 }];

      const questions: any[] = [];
      let concepts: unknown = null;
      let masteryDepthScore = 0;
      let stressTestSummary: unknown = null;
      for (const part of plan) {
        const payload = await generateBatch(
          supabaseUrl,
          authHeader,
          shared,
          part.bloom,
          part.count,
          questions.map(q => String(q.question || '')).filter(Boolean),
        );
        questions.push(...payload.questions);
        concepts ??= payload.concepts ?? null;
        masteryDepthScore = Math.max(masteryDepthScore, Number(payload.masteryDepthScore || 0));
        stressTestSummary = payload.stressTestSummary ?? stressTestSummary;
      }

      const contract = validateAssessmentContract(questions, mode, String(book.book_type || 'text'));
      if (!contract.passed) {
        return json({
          error: 'Generated assessment failed ARC-1.0 and was rejected',
          code: 'ASSESSMENT_CONTRACT_FAILED',
          reasons: contract.reasons,
        }, 422);
      }

      const manifestHash = await sha256({
        schema: 'scrolllibrary-assessment-manifest-v1',
        userId: user.id,
        bookId,
        chapterId,
        mode,
        questions,
        contractVersion: CONTRACT_VERSIONS.assessmentRigor,
      });

      const { data: session, error: sessionError } = await service.from('assessment_sessions').insert({
        user_id: user.id,
        book_id: bookId,
        chapter_id: chapterId,
        mode,
        questions,
        question_count: questions.length,
        tier_breakdown: contract.tierBreakdown,
        coding_question_count: contract.codingQuestionCount,
        assessment_contract_version: CONTRACT_VERSIONS.assessmentRigor,
        assessment_contract_passed: true,
        manifest_hash: manifestHash,
      }).select('id,started_at').single();
      if (sessionError || !session) throw sessionError || new Error('Failed to create assessment session');

      return json({
        sessionId: session.id,
        startedAt: session.started_at,
        questions: questions.map(sanitizeQuestion),
        concepts,
        masteryDepthScore,
        stressTestSummary,
        assessmentContract: CONTRACT_VERSIONS.assessmentRigor,
      });
    }

    const sessionId = String(requestBody?.sessionId || '');
    if (!sessionId) return json({ error: 'sessionId is required' }, 400);
    const { data: session, error: sessionError } = await service
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();
    if (sessionError || !session) return json({ error: 'Assessment session not found' }, 404);

    if (action === 'telemetry') {
      if (session.status !== 'active') return json({ error: 'Assessment session is not active' }, 409);
      const event = String(requestBody?.event || '');
      const patch: Record<string, unknown> = {};
      if (event === 'heartbeat') patch.telemetry_heartbeats = Number(session.telemetry_heartbeats || 0) + 1;
      else if (event === 'paste') patch.paste_count = Number(session.paste_count || 0) + 1;
      else if (event === 'focus_loss') patch.focus_loss_count = Number(session.focus_loss_count || 0) + 1;
      else if (event === 'suspicious_timing') patch.suspicious_timing = true;
      else return json({ error: 'Unsupported telemetry event' }, 400);
      const { error } = await service.from('assessment_sessions').update(patch).eq('id', sessionId).eq('status', 'active');
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'answer') {
      if (session.status !== 'active') return json({ error: 'Assessment session is not active' }, 409);
      const questionIndex = Number(requestBody?.questionIndex);
      const selectedIndex = Number(requestBody?.selectedIndex);
      if (!Number.isInteger(questionIndex) || !Number.isInteger(selectedIndex)) return json({ error: 'Invalid answer payload' }, 400);
      const questions = Array.isArray(session.questions) ? session.questions : [];
      const question = questions[questionIndex];
      if (!question) return json({ error: 'Question not found' }, 404);

      const { data: prior } = await service.from('assessment_session_answers')
        .select('selected_index,is_correct').eq('session_id', sessionId).eq('question_index', questionIndex).maybeSingle();
      if (prior) {
        return json({
          locked: true,
          correct: prior.is_correct,
          selectedIndex: prior.selected_index,
          correctIndex: Number(question.correctIndex ?? question.correct_index),
          reasoningExplanation: question.reasoningExplanation ?? question.explanation ?? '',
        });
      }

      const correctIndex = Number(question.correctIndex ?? question.correct_index);
      if (!Number.isInteger(correctIndex)) return json({ error: 'Question answer key missing' }, 500);
      const isCorrect = selectedIndex === correctIndex;
      const { error: answerError } = await service.from('assessment_session_answers').insert({
        session_id: sessionId,
        user_id: user.id,
        question_index: questionIndex,
        selected_index: selectedIndex,
        is_correct: isCorrect,
      });
      if (answerError) throw answerError;

      await service.from('assessment_sessions').update({ telemetry_heartbeats: Number(session.telemetry_heartbeats || 0) + 1 }).eq('id', sessionId);
      return json({
        locked: true,
        correct: isCorrect,
        correctIndex,
        reasoningExplanation: question.reasoningExplanation ?? question.explanation ?? '',
      });
    }

    if (action === 'complete') {
      if (session.status !== 'active') return json({ error: 'Assessment session is not active' }, 409);
      const { data: answers, error: answersError } = await service.from('assessment_session_answers')
        .select('question_index,is_correct').eq('session_id', sessionId);
      if (answersError) throw answersError;
      if (!answers || answers.length !== Number(session.question_count)) {
        return json({ error: 'Answer every question before completing the assessment', code: 'INCOMPLETE_ASSESSMENT' }, 409);
      }

      const correctAnswers = answers.filter((answer: any) => answer.is_correct).length;
      const score = (correctAnswers / Number(session.question_count)) * 100;
      const durationMs = Math.max(0, Date.now() - new Date(session.started_at).getTime());
      const tooFast = durationMs < Number(session.question_count) * 3000;

      let integrityScore = 1;
      integrityScore -= Math.min(0.45, Number(session.paste_count || 0) * 0.15);
      integrityScore -= Math.min(0.25, Number(session.focus_loss_count || 0) * 0.05);
      if (session.suspicious_timing || tooFast) integrityScore -= 0.20;
      integrityScore = Math.max(0, Math.min(1, integrityScore));
      if (Number(session.telemetry_heartbeats || 0) < Number(session.question_count)) integrityScore = Math.min(integrityScore, 0.59);

      const classification = integrityScore >= 0.9 ? 'trusted' : integrityScore >= 0.6 ? 'review' : 'reject';

      const { data: previous } = await service.from('quiz_attempts')
        .select('attempt_number').eq('user_id', user.id).eq('book_id', session.book_id).eq('chapter_id', session.chapter_id)
        .order('attempt_number', { ascending: false }).limit(1);
      const attemptNumber = Number(previous?.[0]?.attempt_number || 0) + 1;

      const { data: attempt, error: attemptError } = await service.from('quiz_attempts').insert({
        user_id: user.id,
        book_id: session.book_id,
        chapter_id: session.chapter_id,
        score,
        total_questions: session.question_count,
        correct_answers: correctAnswers,
        time_spent_seconds: Math.round(durationMs / 1000),
        attempt_number: attemptNumber,
        assessment_session_id: session.id,
        assessment_contract_version: session.assessment_contract_version,
        assessment_contract_passed: session.assessment_contract_passed,
        assessment_manifest_hash: session.manifest_hash,
        tier_breakdown: session.tier_breakdown,
        coding_question_count: session.coding_question_count,
      }).select('id').single();
      if (attemptError || !attempt) throw attemptError || new Error('Failed to persist quiz attempt');

      const { error: integrityError } = await service.from('assessment_integrity_logs').insert({
        user_id: user.id,
        book_id: session.book_id,
        chapter_id: session.chapter_id,
        quiz_attempt_id: attempt.id,
        integrity_score: integrityScore,
        severity: classification,
        violation_type: classification === 'trusted' ? null : 'assessment_behavior',
        paste_count: session.paste_count,
        focus_loss_count: session.focus_loss_count,
        suspicious_timing: Boolean(session.suspicious_timing || tooFast),
        session_duration_ms: durationMs,
        details: {
          server_scored: true,
          assessment_session_id: session.id,
          classification,
          telemetry_complete: Number(session.telemetry_heartbeats || 0) >= Number(session.question_count),
          contract_version: session.assessment_contract_version,
        },
      });
      if (integrityError) throw integrityError;

      if (session.mode === 'mastery') {
        const passed = score >= 90 && integrityScore >= 0.9 && Boolean(session.assessment_contract_passed);
        await service.from('mastery_attempts').insert({
          user_id: user.id,
          book_id: session.book_id,
          attempted_at: new Date().toISOString(),
          passed,
          score_at_attempt: score,
          integrity_at_attempt: integrityScore,
          reasons_failed: passed ? [] : [
            ...(score < 90 ? ['score_below_90'] : []),
            ...(integrityScore < 0.9 ? ['integrity_below_90'] : []),
            ...(!session.assessment_contract_passed ? ['assessment_contract_failed'] : []),
          ],
        });
      }

      const { error: completeError } = await service.from('assessment_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString(), suspicious_timing: Boolean(session.suspicious_timing || tooFast) })
        .eq('id', sessionId).eq('status', 'active');
      if (completeError) throw completeError;

      return json({
        success: true,
        score,
        correctAnswers,
        totalQuestions: session.question_count,
        integrityScore,
        integrityClassification: classification,
        assessmentContractPassed: session.assessment_contract_passed,
        assessmentContractVersion: session.assessment_contract_version,
      });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.error('[assessment-session]', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
