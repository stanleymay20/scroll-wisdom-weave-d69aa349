import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/reader/QuizMode.tsx", "utf8");
const server = readFileSync("supabase/functions/assessment-session/index.ts", "utf8");

const failures = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(label + " is missing");
};
const requireBefore = (source, first, second, label) => {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) failures.push(label + " ordering is broken");
};

requireText(
  server,
  "const { correctIndex, correct_index, reasoningExplanation, explanation, ...safe }",
  "start-response answer-key sanitization",
);
requireText(
  server,
  "questions: questions.map(sanitizeQuestion)",
  "sanitized assessment start response",
);
requireText(
  server,
  ".from('assessment_session_answers')",
  "server answer-lock table",
);
requireText(
  server,
  "selected_index: selectedIndex",
  "server-persisted selected answer",
);
requireText(
  server,
  "const correctAnswers = answers.filter",
  "server score derivation from persisted answers",
);
requireText(
  server,
  ".from('quiz_attempts').insert",
  "authoritative quiz attempt persistence",
);
requireText(
  server,
  ".from('assessment_integrity_logs').insert",
  "authoritative integrity evidence persistence",
);
requireText(
  server,
  "server_scored: true",
  "server-scored integrity marker",
);
requireText(
  server,
  "assessment_contract_passed: session.assessment_contract_passed",
  "ARC contract persistence",
);
requireBefore(
  server,
  ".from('quiz_attempts').insert",
  ".update({ status: 'completed'",
  "quiz attempt must persist before session completion",
);
requireBefore(
  server,
  ".from('assessment_integrity_logs').insert",
  ".update({ status: 'completed'",
  "integrity evidence must persist before session completion",
);

requireText(
  ui,
  "The browser never receives the answer key",
  "UI trust-boundary documentation",
);
requireText(
  ui,
  "action: 'start'",
  "assessment start action",
);
requireText(
  ui,
  "selectedIndex: selectedAnswer",
  "answer request sends only selected index",
);
requireText(
  ui,
  "const result = await invokeSession({ action: 'complete', sessionId })",
  "server completion invocation",
);
requireText(
  ui,
  "The server did not persist final evidence. No completion record has been created.",
  "fail-closed completion UX",
);

if (failures.length) {
  console.error("Assessment authority contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Assessment answer-key/scoring/evidence authority contract: PASS");
