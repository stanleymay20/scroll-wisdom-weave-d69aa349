import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[GRAPH-QUESTIONS] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

// ─── Question Types ─────────────────────────────────────────
type GraphQuestionType =
  | "prerequisite_check"
  | "comparison"
  | "cross_chapter_synthesis"
  | "dependency_reasoning"
  | "misconception_repair";

interface GraphQuestionMeta {
  sourceConceptIds: string[];
  sourceChapters: number[];
  questionType: GraphQuestionType;
  graphReason: string;
}

// ─── Concept Selection Logic ────────────────────────────────
interface ConceptNode {
  id: string;
  label: string;
  normalized_label: string;
  definition: string | null;
  chapter_first_seen: number;
  chapters_referenced: number[];
  examples: string[];
  applications: string[];
  difficulty: number;
  importance: number;
}

interface ConceptEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  weight: number;
}

interface LearnerState {
  concept_node_id: string;
  familiarity_score: number;
  mastery_score: number;
  misconception_flags: string[];
  application_confidence: number;
  times_reviewed: number;
}

function prioritizeConcepts(
  nodes: ConceptNode[],
  edges: ConceptEdge[],
  learnerStates: LearnerState[],
  currentChapter?: number
): { selected: ConceptNode[]; pairs: Array<{ a: ConceptNode; b: ConceptNode; edge: ConceptEdge; type: GraphQuestionType; reason: string }> } {
  const stateMap = new Map(learnerStates.map((s) => [s.concept_node_id, s]));

  // Score each node: lower = more urgently needs testing
  const scored = nodes.map((n) => {
    const s = stateMap.get(n.id);
    let priority = 0;
    // Weak mastery → high priority
    if (s) {
      priority += (100 - s.mastery_score) * 2;
      priority += s.misconception_flags.length * 30;
      priority += (100 - s.application_confidence);
    } else {
      priority += 150; // never assessed = high priority
    }
    // High importance = slightly more priority
    priority += n.importance * 5;
    // Cross-chapter concepts are more valuable
    priority += (n.chapters_referenced?.length || 1) * 10;
    return { node: n, priority, state: s };
  });

  scored.sort((a, b) => b.priority - a.priority);
  const selected = scored.slice(0, 12).map((s) => s.node);
  const selectedIds = new Set(selected.map((n) => n.id));

  // Find interesting pairs for cross-chapter questions
  const pairs: Array<{ a: ConceptNode; b: ConceptNode; edge: ConceptEdge; type: GraphQuestionType; reason: string }> = [];

  for (const edge of edges) {
    const a = selected.find((n) => n.id === edge.source_node_id);
    const b = selected.find((n) => n.id === edge.target_node_id);
    if (!a || !b) continue;

    const crossChapter =
      a.chapter_first_seen !== b.chapter_first_seen ||
      !arraysOverlap(a.chapters_referenced, b.chapters_referenced);

    let type: GraphQuestionType;
    let reason: string;

    switch (edge.relationship_type) {
      case "depends_on":
        type = "prerequisite_check";
        reason = `"${b.label}" depends on "${a.label}" — test if prerequisite is understood`;
        break;
      case "contrasts_with":
        type = "comparison";
        reason = `"${a.label}" contrasts with "${b.label}" — test distinction ability`;
        break;
      case "extends":
      case "applies_to":
        type = crossChapter ? "cross_chapter_synthesis" : "dependency_reasoning";
        reason = crossChapter
          ? `"${a.label}" (Ch.${a.chapter_first_seen}) ${edge.relationship_type} "${b.label}" (Ch.${b.chapter_first_seen})`
          : `"${a.label}" ${edge.relationship_type} "${b.label}"`;
        break;
      default:
        type = crossChapter ? "cross_chapter_synthesis" : "dependency_reasoning";
        reason = `${edge.relationship_type} link between "${a.label}" and "${b.label}"`;
    }

    // Check if either concept has misconceptions
    const stateA = stateMap.get(a.id);
    const stateB = stateMap.get(b.id);
    if (stateA?.misconception_flags?.length || stateB?.misconception_flags?.length) {
      type = "misconception_repair";
      const flags = [...(stateA?.misconception_flags || []), ...(stateB?.misconception_flags || [])];
      reason = `Misconception repair: ${flags.slice(0, 2).join(", ")}`;
    }

    pairs.push({ a, b, edge, type, reason });
  }

  // Sort pairs to prioritize cross-chapter and misconception repair
  pairs.sort((x, y) => {
    const typeOrder: Record<GraphQuestionType, number> = {
      misconception_repair: 0,
      cross_chapter_synthesis: 1,
      prerequisite_check: 2,
      comparison: 3,
      dependency_reasoning: 4,
    };
    return (typeOrder[x.type] || 5) - (typeOrder[y.type] || 5);
  });

  return { selected, pairs: pairs.slice(0, 8) };
}

function arraysOverlap(a: number[], b: number[]): boolean {
  const setA = new Set(a);
  return b.some((v) => setA.has(v));
}

// ─── Main Handler ───────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      bookId,
      bookTitle = "",
      bookType = "text",
      currentChapter,
      questionCount = 5,
      chapterContent = "",
    } = await req.json();

    if (!bookId) {
      return new Response(JSON.stringify({ error: "bookId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Starting", { bookId, bookType, currentChapter, questionCount });

    // ── Fetch graph data ──────────────────────────
    const [nodesRes, edgesRes] = await Promise.all([
      supabase.from("concept_nodes").select("*").eq("book_id", bookId).order("importance", { ascending: false }),
      supabase.from("concept_edges").select("*").eq("book_id", bookId),
    ]);

    const nodes: ConceptNode[] = nodesRes.data || [];
    const edges: ConceptEdge[] = edgesRes.data || [];

    if (nodes.length < 3) {
      return new Response(
        JSON.stringify({ error: "insufficient_graph", message: "Book knowledge graph needs at least 3 concept nodes." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch learner states (from JWT) ───────────
    let learnerStates: LearnerState[] = [];
    const jwt = authHeader.replace("Bearer ", "");
    if (jwt) {
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (user) {
        const nodeIds = nodes.map((n) => n.id);
        const { data } = await supabase
          .from("learner_concept_states")
          .select("*")
          .eq("user_id", user.id)
          .in("concept_node_id", nodeIds);
        learnerStates = data || [];
      }
    }

    // ── Prioritize & select concepts ──────────────
    const { selected, pairs } = prioritizeConcepts(nodes, edges, learnerStates, currentChapter);
    log("Selected concepts", { count: selected.length, pairs: pairs.length });

    // ── Build question generation prompt ──────────
    const conceptDescriptions = selected
      .map(
        (n) =>
          `• ${n.label} (Ch.${n.chapter_first_seen}, refs: [${n.chapters_referenced?.join(",")}], difficulty: ${n.difficulty}/5)
  Definition: ${n.definition || "N/A"}
  Examples: ${n.examples?.slice(0, 2).join("; ") || "N/A"}
  Applications: ${n.applications?.slice(0, 2).join("; ") || "N/A"}`
      )
      .join("\n\n");

    const pairDescriptions = pairs
      .map(
        (p, i) =>
          `Pair ${i + 1} [${p.type}]: "${p.a.label}" ←(${p.edge.relationship_type})→ "${p.b.label}"
  Reason: ${p.reason}
  Chapters: ${p.a.label} first in Ch.${p.a.chapter_first_seen}, ${p.b.label} first in Ch.${p.b.chapter_first_seen}`
      )
      .join("\n\n");

    const weakConceptInfo = learnerStates
      .filter((s) => s.mastery_score < 50)
      .map((s) => {
        const node = nodes.find((n) => n.id === s.concept_node_id);
        return node
          ? `• ${node.label}: mastery ${s.mastery_score}%, misconceptions: [${s.misconception_flags?.join(", ") || "none"}]`
          : null;
      })
      .filter(Boolean)
      .join("\n");

    // Ensure at least 40% are cross-chapter
    const minCrossChapter = Math.max(1, Math.ceil(questionCount * 0.4));

    const prompt = `You are the ScrollLibrary Graph-Driven Question Engine.

Generate exactly ${questionCount} mastery questions using the BOOK-LEVEL KNOWLEDGE GRAPH below.
These questions must test CROSS-CHAPTER understanding and concept relationships.

BOOK: "${bookTitle}" (type: ${bookType})
${currentChapter ? `Current chapter: ${currentChapter}` : ""}

═══ CONCEPT NODES (prioritized by learner weakness) ═══
${conceptDescriptions}

═══ CONCEPT RELATIONSHIP PAIRS (use these to create questions) ═══
${pairDescriptions}

${weakConceptInfo ? `═══ WEAK CONCEPTS (prioritize these) ═══\n${weakConceptInfo}` : ""}

${chapterContent ? `═══ CURRENT CHAPTER CONTEXT (first 3000 chars) ═══\n${chapterContent.slice(0, 3000)}` : ""}

QUESTION TYPE DISTRIBUTION (MANDATORY):
- At least ${minCrossChapter} questions MUST combine concepts from different chapters
- At least 1 prerequisite_check question
- At least 1 comparison question
- Prefer scenario/application format for cross-chapter questions

QUESTION TYPES:
1. prerequisite_check — Test if foundational concept is understood before dependent concept
2. comparison — Compare/contrast two related or contrasting concepts
3. cross_chapter_synthesis — Combine ideas from multiple chapters into one reasoning question
4. dependency_reasoning — Test understanding of how one concept enables/affects another
5. misconception_repair — Target known misconceptions with corrective scenarios

RULES:
- Every question must use scenario/application format (not simple definitions)
- Each question must reference 2+ concepts from the graph
- Distractors must come from related concepts in the graph
- Questions must require reasoning across the concept relationship, not just recall
- Randomize correctIndex across positions 0-3`;

    log("Generating questions via AI");

    const genResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Generate graph-driven cross-chapter mastery questions. Return structured JSON via the tool call.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_graph_questions",
              description: "Generate cross-chapter questions from the knowledge graph",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correctIndex: { type: "number" },
                        reasoningExplanation: { type: "string" },
                        bloomLevel: {
                          type: "string",
                          enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"],
                        },
                        bloomJustification: { type: "string" },
                        conceptsUsed: { type: "array", items: { type: "string" } },
                        questionType: {
                          type: "string",
                          enum: [
                            "prerequisite_check",
                            "comparison",
                            "cross_chapter_synthesis",
                            "dependency_reasoning",
                            "misconception_repair",
                          ],
                        },
                        graphReason: { type: "string", description: "Why the graph suggested this question" },
                        sourceConceptIds: { type: "array", items: { type: "string" }, description: "IDs of concept nodes used" },
                        sourceChapters: { type: "array", items: { type: "number" }, description: "Chapter numbers involved" },
                        difficulty: { type: "number" },
                        pointValue: { type: "number" },
                        timeLimit: { type: "number" },
                      },
                      required: [
                        "question",
                        "options",
                        "correctIndex",
                        "reasoningExplanation",
                        "bloomLevel",
                        "bloomJustification",
                        "conceptsUsed",
                        "questionType",
                        "graphReason",
                        "sourceConceptIds",
                        "sourceChapters",
                        "difficulty",
                        "pointValue",
                        "timeLimit",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_graph_questions" } },
      }),
    });

    if (!genResp.ok) {
      const errText = await genResp.text();
      log("AI generation failed", { status: genResp.status });
      return new Response(JSON.stringify({ error: "AI generation failed", detail: errText }), {
        status: genResp.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const genData = await genResp.json();
    let questions: any[] = [];
    try {
      const args = genData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (args) {
        const parsed = JSON.parse(args);
        questions = parsed.questions || [];
      }
    } catch (e) {
      log("Parse failed", { error: String(e) });
    }

    // ── Map concept labels to IDs ─────────────────
    for (const q of questions) {
      // Resolve sourceConceptIds from labels if AI returned labels instead of UUIDs
      if (q.sourceConceptIds?.length && !q.sourceConceptIds[0]?.includes("-")) {
        q.sourceConceptIds = q.conceptsUsed
          .map((label: string) => {
            const node = nodes.find(
              (n) => n.label.toLowerCase() === label.toLowerCase() || n.normalized_label === label.toLowerCase().replace(/\s+/g, "_")
            );
            return node?.id;
          })
          .filter(Boolean);
      }

      // Resolve sourceChapters from concepts if not provided
      if (!q.sourceChapters?.length && q.sourceConceptIds?.length) {
        const chapters = new Set<number>();
        for (const cid of q.sourceConceptIds) {
          const node = nodes.find((n) => n.id === cid);
          if (node) {
            chapters.add(node.chapter_first_seen);
            node.chapters_referenced?.forEach((c: number) => chapters.add(c));
          }
        }
        q.sourceChapters = Array.from(chapters).sort((a, b) => a - b);
      }

      // Ensure metadata
      q.isGraphDriven = true;
    }

    log("Complete", { questionCount: questions.length });

    return new Response(JSON.stringify({ questions, graphStats: { nodes: nodes.length, edges: edges.length, weakConcepts: learnerStates.filter((s) => s.mastery_score < 50).length } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    log("Error", { message: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
