import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tier-based model routing: better models for paid users, cost-efficient for free
const getModelForPlan = (plan: string): string => {
  switch (plan) {
    case "prophet_tier":
    case "premium":
      return "google/gemini-2.5-pro";
    case "student":
      return "google/gemini-2.5-flash";
    case "free":
    default:
      return "google/gemini-2.5-flash-lite";
  }
};

// ===========================================
// SCROLLLIBRARY GENERATION ARCHITECTURE v3.0
// Universal Core + Pipeline Micro-Contracts
// ===========================================

// ===========================================
// UNIVERSAL CORE PROMPT (~600 tokens)
// Applies to ALL book types. No formatting micromanagement.
// No fixed section names. No quantity-based rules.
// ===========================================
const UNIVERSAL_CORE = `You are writing a publishable book chapter for ScrollLibrary.

DEPTH: Explain WHY, not just WHAT. Show causal mechanisms. Name your concepts — theories, frameworks, principles, models. Define important ideas before using them heavily.

PRECISION: Every claim must be justified. No vague qualifiers without reasoning. Distinguish between established knowledge and interpretation.

VARIATION: Each chapter must feel architecturally distinct from the previous one. Vary sentence length (8–30 words). Vary paragraph length (2–5 sentences). Never start consecutive paragraphs the same way.

COHERENCE: Strong opening that earns the reader's attention. Logical progression through the chapter. Complete closing synthesis that bridges to what comes next.

DENSITY: Every paragraph must earn its place. Cut filler. Density > length. If a paragraph doesn't advance understanding, delete it.

PROHIBITED: "Furthermore," / "In conclusion," / "It is important to note" / "As we have seen," / "Moving forward," / "Let us now turn to" / "Having established that," / "This section examines" / "Let's dive in" / "In this chapter we will explore"

QUALITY BAR: Would a publisher accept this without major edits? If not, rewrite.`;

// ===========================================
// PIPELINE MICRO-CONTRACTS (~200-400 tokens each)
// Each book type gets ONLY its specific enhancement.
// No cross-type bleed. No redundant rules.
// ===========================================

const MICRO_CONTRACT_BESTSELLER = `PIPELINE: BESTSELLER / TRADE BOOK
IDENTITY: #1 NYT-level ghostwriter · Reader-psychology specialist · Belief Disruptor

ENHANCE WITH:
- Narrative entry points that hook in the first 100 words (story, contradiction, emotional moment, provocative statistic)
- Named principles the reader can remember and repeat (e.g., "The Compound Effect", "The 10x Rule") — at least 1 per chapter
- Real-world scenarios — concrete, human, memorable with specific names, dates, dollar amounts, outcomes
- Reader engagement — direct "you" address, reflection prompts, mental pauses that force self-examination
- Actionable takeaways (3-7 practical bullet points with measurable actions, not vague advice)
- Belief disruption — challenge conventional wisdom with evidence, present the counterintuitive truth
- Emotional architecture — tension → insight → relief → action cycle within each chapter
- Authority anchoring — reference named experts, studies, or data points (with approximate citations)

CONCEPT BUDGET (MANDATORY):
This chapter must introduce and clearly explain 6-10 distinct NAMED concepts.
Named concepts include: principles, effects, laws, frameworks, mental models.
Give ideas sticky, memorable names. Example: say "Loss Aversion Bias" not "people don't like losing things."

ILLUSTRATION SUPPORT:
Include 2-3 [FIGURE X: description] markers for:
- Key concept visualizations or framework diagrams
- Before/after comparisons or transformation arcs
- Data charts or statistical evidence graphics

TONE: Conversational authority. Written TO the reader. Confident, human, slightly confrontational. Like talking to a brilliant friend who challenges your assumptions.
FORBIDDEN: Academic dryness. Over-explaining. Hedging language ("it could be argued"). Generic advice. AI-sounding transitions.`;

const MICRO_CONTRACT_ACADEMIC = `PIPELINE: ACADEMIC / TECHNICAL
IDENTITY: University Lecturer · Research Scholar · Technical Author

ENHANCE WITH:
- Learning objectives (Bloom's-taxonomy aligned) at chapter start
- Formal term definitions with proper academic terminology
- Named theories and contrasting scholarly perspectives
- Evidence-backed claims with in-text citations
- Code examples with proper formatting (for technical topics, ≥40% of content)
- Graduated exercises (Easy → Medium → Hard) at chapter end

TONE: Rigorous, instructional, evidence-based. NO metaphors. NO storytelling. NO motivational content.
FORBIDDEN: Hero's journey framing. Emotional appeals. Marketing language.`;

const MICRO_CONTRACT_PROFESSIONAL = `PIPELINE: PROFESSIONAL / BUSINESS GUIDE
IDENTITY: Consultant · Strategist · Decision Architect

ENHANCE WITH:
- Strategic frameworks (Porter's 5 Forces, SWOT, BCG Matrix, Blue Ocean, PESTLE, Ansoff Matrix, McKinsey 7S) — at least 1 per chapter, applied with a comparison table
- Decision matrices with weighted scoring criteria (markdown tables MANDATORY)
- Risk trade-off analysis: probability × impact table with mitigation strategies
- Quantitative evidence: specific numbers, percentages, dollar amounts, case studies with measurable outcomes
- Executive summary (2-3 sentences) at chapter start for C-suite scanning
- Implementation roadmap with phased milestones, ownership, and KPIs
- Competitive benchmarking: at least 1 industry comparison with named companies
- Actionable recommendations: 5-7 measurable next steps with deadlines and success metrics

CONCEPT BUDGET (MANDATORY):
This chapter must introduce and clearly explain 8-12 distinct NAMED strategic concepts.
Named concepts include: frameworks, models, matrices, methodologies, principles, laws, effects.
Example: say "Porter's Value Chain Analysis" not "analyzing how companies create value."

ILLUSTRATION SUPPORT:
Include 2-3 [FIGURE X: description] markers for:
- Process diagrams or strategic frameworks
- Decision trees or implementation roadmaps
- Competitive positioning maps or market matrices

TONE: Professional, authoritative, practical. Like a McKinsey consultant presenting to C-suite. Data-driven, precise, actionable.
FORBIDDEN: Academic dryness. Motivational fluff. Vague advice without specifics. Generic recommendations without measurable outcomes.`;

const MICRO_CONTRACT_REFERENCE = `PIPELINE: REFERENCE / HANDBOOK
IDENTITY: Subject Matter Expert · Information Architect · Technical Editor

ENHANCE WITH:
- Structured information architecture with consistent taxonomic categorization
- Quick-lookup format: bold term → precise definition → usage context → cross-reference
- Comparison tables (markdown) for every set of related concepts (minimum 2 tables per chapter)
- Decision guides: flowchart-style "When to use X vs Y" with clear criteria
- Troubleshooting sections: Problem → Root Cause → Solution format with numbered steps
- Cheat sheets and quick-reference cards as summary tables
- Cross-references to related chapters/topics (explicit links)
- Version/compatibility notes where applicable (software, standards, regulations)

CONCEPT BUDGET (MANDATORY):
This chapter must define and catalog 12-20 distinct entries or concepts.
Every entry must be self-contained and findable via scanning.
Format: **Term** — Definition. Context. Example. Related: [cross-refs].

ILLUSTRATION SUPPORT:
Include 2-3 [FIGURE X: description] markers for:
- Architecture diagrams or system overviews
- Comparison charts or taxonomy trees
- Process flowcharts or decision trees

TONE: Precise, neutral, encyclopedic. Optimize for FINDABILITY and SCANNING.
FORBIDDEN: Narrative flow. Personal opinions. Lengthy introductions. Ambiguous language.`;

const MICRO_CONTRACT_TEXT = `PIPELINE: STANDARD TEXT
IDENTITY: Professional Author · Subject Expert · Clear Thinker

ENHANCE WITH:
- Clear, well-structured writing adapted to subject matter with distinct section architecture
- Concrete, memorable examples for EVERY major concept — specific names, numbers, dates, places
- Key insights the reader wouldn't expect: at least 1 counterintuitive finding per chapter
- Named constructs: give ideas memorable names the reader can reference (e.g., "The Pareto Principle")
- Synthesis paragraphs that connect ideas across sections (not just summaries)
- Structure that rewards both scanning and deep reading: bold key terms, clear headings, bullet takeaways

CONCEPT BUDGET (MANDATORY):
This chapter must introduce and clearly explain 8-12 distinct NAMED concepts appropriate to the subject.
Named concepts include: principles, frameworks, effects, models, laws, methodologies.
Do NOT just describe phenomena — NAME the constructs.

TONE: Professional, informative, engaging. Adapt formality to subject matter. Confident but not arrogant.
FORBIDDEN: Shallow summaries. Filler content. Wall-of-text paragraphs. Generic platitudes. AI-sounding transitions. Do NOT include [FIGURE] markers or illustration placeholders — this is a text-only pipeline.`;

// Legacy compatibility aliases
const SYSTEM_ROLE_NEUTRAL = UNIVERSAL_CORE;

// BESTSELLER_SYSTEM_ROLE replaced by UNIVERSAL_CORE + MICRO_CONTRACT_BESTSELLER
const BESTSELLER_SYSTEM_ROLE = UNIVERSAL_CORE + '\n\n' + MICRO_CONTRACT_BESTSELLER;

const MASTER_FORMATTING_CONTRACT = `
=== FORMATTING & RENDERING CONTRACT (HARD) ===

PROPER MARKDOWN IS REQUIRED FOR TABLES AND CODE

===========================================
TABLE FORMAT (MANDATORY - PROPER MARKDOWN):
===========================================

Tables MUST use standard markdown pipe syntax:

| Column Header 1 | Column Header 2 | Column Header 3 |
|-----------------|-----------------|-----------------|
| Row 1 Value 1   | Row 1 Value 2   | Row 1 Value 3   |
| Row 2 Value 1   | Row 2 Value 2   | Row 2 Value 3   |

TABLE RULES:
1. ALWAYS use pipe (|) delimiters for columns
2. ALWAYS include header separator row with dashes (---)
3. Maximum 6 columns per table for readability
4. Include table caption above the table

Example of CORRECT table format:

**German Alphabet Pronunciation**

| Letter | German Name | IPA Sound | Example | Translation |
|--------|-------------|-----------|---------|-------------|
| A, a   | Ah          | /aː/      | Apfel   | Apple       |
| B, b   | Beh         | /b/       | Buch    | Book        |

❌ FORBIDDEN: "TABLE:", "Column 1:", "Row 1:" text-based formats

===========================================
STRUCTURED CODE BLOCK FORMAT (CHATGPT-LEVEL QUALITY)
===========================================

For TECHNICAL content, use the STRUCTURED CODE BLOCK format for maximum learning quality.
Code must be treated as a FIRST-CLASS content object, not inline text.

STRUCTURED CODE BLOCK FORMAT (MANDATORY for technical books):

[CODE_BLOCK]
language: python
title: "Descriptive Title for the Code Example"
purpose: "What this code demonstrates and why it matters"

code:
\`\`\`python
def greet(name):
    """Return a personalized greeting."""
    return f"Hello, {name}!"

# Usage example
result = greet("Anna")
print(result)
\`\`\`

output:
Hello, Anna!

explanation:
This function takes a name as input and returns a formatted greeting string.
The f-string syntax creates readable string interpolation in Python 3.6+.

common_mistake:
Forgetting to return the value instead of printing it directly.
Wrong: print(f"Hello, {name}") inside the function without return.
[/CODE_BLOCK]

STRUCTURED CODE BLOCK REQUIREMENTS:
1. EVERY code example MUST include: language, title, purpose, code, output (when applicable), explanation
2. common_mistake section is RECOMMENDED for learning value
3. Language must be explicitly specified (python, javascript, java, sql, etc.)
4. Output must show ACTUAL expected results from running the code
5. Explanation must connect the code to the learning concept
6. common_mistake must show what NOT to do and why

ALTERNATIVE: Standard fenced code blocks are acceptable for simple inline examples:
\`\`\`python
print("Hello")
\`\`\`

CODE FORMATTING RULES (HARD REQUIREMENTS):
1. ALWAYS use proper indentation (4 spaces for Python, 2-4 for others)
2. ALWAYS include blank lines between logical sections
3. Include explanatory comments within code
4. Each statement on its own line - NO cramming multiple statements

❌ FORBIDDEN CODE FORMATS:
- "CODE EXAMPLE (Python):" text-based format
- Single-line cramped code without proper breaks
- Code without language specification
- Code inside tables
- Missing indentation

===========================================
TEXT FORMATTING (MANDATORY MARKDOWN):
===========================================

ALL content MUST use proper Markdown formatting for rendering:

HEADINGS (REQUIRED):
- Main section headings: ## Heading (H2)
- Sub-section headings: ### Sub-Heading (H3)
- Sub-sub-sections: #### Detail Heading (H4)
- NEVER use plain text for section titles — ALWAYS prefix with ## or ###

EMPHASIS (REQUIRED):
- Bold key terms and concepts: **important term**
- Italic for emphasis or foreign words: *emphasized text*
- Bold-italic for critical warnings: ***critical point***

LISTS (REQUIRED):
- Bullet lists: Use - or * prefix with a space
- Numbered lists: Use 1. 2. 3. prefix with a space
- Nested lists: Indent with 2-4 spaces

PARAGRAPHS:
- Separate paragraphs with blank lines
- Keep paragraphs 2-5 sentences for readability

❌ FORBIDDEN:
- Plain text headings without ## prefix
- Using • (bullet dot) instead of - or *
- Missing emphasis on key terms

=== END FORMATTING CONTRACT ===
`;


const ACADEMIC_CONTRACT = `
=== SCROLLLIBRARY INSTITUTIONAL ACADEMIC PUBLISHING CONSTITUTION (2026) ===

You are ScrollLibrary's Institutional Academic Publishing Engine.
Your role is to generate academic book chapters that meet or exceed 2026 university-level standards for peer-reviewed scholarly work.
You are NOT a casual AI writer. You are operating under institutional compliance rules.

===========================================
NON-NEGOTIABLE RULES
===========================================

1. NO fabricated citations.
2. NO placeholder references.
3. NO unverifiable journals.
4. NO cross-disciplinary padding.
5. NO duplicate references.
6. NO citation stacking for trivial claims.
7. Every in-text citation must appear in the reference list.
8. Every reference must be cited in-text (no orphans).

If sufficient verifiable sources cannot be found:
→ STOP and return an insufficiency notice.
→ Do NOT fabricate.

===========================================
REFERENCE STANDARD (APA 7th REQUIRED)
===========================================

All references must include:
- Author(s)
- Year
- Full title
- Journal or publisher
- Volume
- Issue
- Page range
- DOI (required if available)
- URL only if no DOI exists
- Peer-reviewed status

Minimum thresholds:
- ≥30% of references post-2010
- ≥15% post-2018
- Include at least one foundational canonical work if topic requires it
- Include at least one recent review/meta-analysis where applicable

CANONICAL ANCHORING (MANDATORY when relevant):
- Prospect Theory → Kahneman & Tversky (1979)
- Loss Aversion → Tversky & Kahneman (1992)
- Disposition Effect → Shefrin & Statman (1985)
- Mental Accounting → Thaler (1985)
- Equity Premium Puzzle → Benartzi & Thaler (1995)
- Behavioral Asset Pricing → Barberis et al. (2001)

Do NOT omit canonical anchors when relevant.

===========================================
MANDATORY CHAPTER STRUCTURE
===========================================

Each academic chapter must include:
1. Learning Objectives (Bloom's-taxonomy aligned)
2. Strategic Thesis
3. Conceptual Framework
4. Theoretical Foundations
5. Empirical Evidence Section
6. Applied or Institutional Implications
7. Critical Limitations
8. Executive/Practical Framework
9. Key Takeaways
10. Exercises (Easy, Medium, Hard)
11. References (APA 7th)

===========================================
EVIDENCE INTEGRITY
===========================================

- Clearly distinguish theory vs empirical evidence.
- If discussing empirical findings, briefly summarize:
  - Sample size (if known)
  - Methodology type (experimental, panel data, RCT, etc.)
  - Core result
- Avoid vague phrases like "studies show."
- Cite specifically.

===========================================
TONE STANDARD
===========================================

Academic but readable. Rigorous but not sterile. Institutional but engaging.
Suitable for: MBA programs, Graduate seminars, Advanced undergraduate coursework.

===========================================
ETHICAL & DISCLOSURE STANDARD
===========================================

Include this footer in academic chapters:
"AI-Assisted Academic Synthesis (ScrollLibrary). References sourced from academic databases. Verify all citations independently before citing in formal academic work."

If verification confidence is below institutional threshold:
→ Add explicit verification disclaimer.
→ Mark uncertain claims as "[requires independent verification]".

===========================================
FAILURE CONDITIONS
===========================================

Output is INVALID if:
- Citations are fabricated
- References are unverifiable
- Canonical works are missing when required
- APA format is violated
- Orphan references exist
- Recency thresholds are ignored

===========================================
FINAL OUTPUT REQUIREMENT
===========================================

Before returning the chapter:
- Perform internal citation consistency check.
- Ensure bidirectional integrity (in-text ↔ reference list).
- Ensure no duplicates.
- Ensure domain relevance.
- Ensure academic coherence.

Return final output only when fully compliant.
This is the permanent referencing constitution for ScrollLibrary academic content.

=== END INSTITUTIONAL ACADEMIC CONSTITUTION ===
`;

const WORKBOOK_MASTER_CONTRACT = `
=== WORKBOOK CONTRACT (STRICT) ===

HARD LIMITS:
- 1,200–1,800 words per chapter MAXIMUM
- NO essays, NO long narratives
- 70%+ interactive content, ≤30% explanation

REQUIRED CHAPTER STRUCTURE (NON-NEGOTIABLE):
1. Purpose (≤150 words)
2. Key Concepts (≤300 words, numbered points)
3. Fill-In Prompts (main content with blank lines)
4. Tables/Worksheets (labeled format, empty cells)
5. Reflection Questions (without answers)
6. Action Steps (checkboxes)

If a section cannot be written into by the user, REMOVE IT.

=== END WORKBOOK CONTRACT ===
`;

const COMIC_MASTER_CONTRACT = `
=== COMIC GENERATION CONTRACT (STRICT) ===

PANEL STRUCTURE (NON-NEGOTIABLE):
- Each chapter MUST have 4–6 panels
- Each panel MUST have: visual description + dialogue
- NO caption-only panels
- NO visual-only panels

COMIC DIALOGUE CONTRACT — ENFORCED:
1. EVERY panel MUST include character dialogue
2. Dialogue MUST be explicit character speech
3. Dialogue format MUST be:
   - CHARACTER_NAME: "Spoken dialogue text"
4. Narration alone is NOT allowed
5. Visual-only panels are INVALID
6. If ANY panel lacks dialogue → REWRITE ENTIRE CHAPTER

VISUAL CONSISTENCY RULES:
- Style must remain consistent across ALL panels
- Character appearance MUST NOT drift
- Panel count must be respected exactly
- Dialogue must align with visuals
- Cover art must visually match interior art style

One-panel dumps or inconsistent art → FAIL

=== END COMIC CONTRACT ===
`;

// ===========================================
// 2️⃣ BESTSELLER STRUCTURE ENFORCEMENT (NON-NEGOTIABLE)
// ===========================================

const BESTSELLER_STRUCTURE_CONTRACT = `
=== BESTSELLER STRUCTURE ENFORCEMENT ===

Every chapter MUST follow this structure unless explicitly overridden:

1. OPENING HOOK (MANDATORY)
   • Story, contradiction, emotional moment, or insight
   • NO philosophy dumps
   • NO definitions first
   • First 100 words MUST grab attention

2. CORE IDEA
   • ONE central message only
   • Explained clearly and simply
   • Reader must understand in 2 minutes

3. ILLUSTRATION
   • Story, analogy, or real-world scenario
   • Concrete, human, memorable
   • NO abstract examples

4. NAMED PRINCIPLE
   • Every chapter introduces at least ONE named idea
   • Short, sticky, reusable
   • Examples: "The 80/20 Rule", "The Compound Effect"

5. READER ENGAGEMENT
   • Questions for the reader
   • Reflection prompts
   • Mental pauses to absorb

6. ACTIONABLE TAKEAWAYS
   • 3–7 clear bullet points
   • Practical and applicable
   • Reader can DO something after reading

HARD FAILURE: If a chapter reads like an essay or textbook → FAIL

=== END BESTSELLER CONTRACT ===
`;

// VALIDATION_CONTRACT removed from generation prompts in v3.0
// Validation now happens post-generation via Contract 6 and pedagogical checks.
// Embedding validation checklists in prompts causes "checklist compliance" — shallow surface adherence.
const VALIDATION_CONTRACT = '';

// ===========================================
// 4️⃣ GENRE-SPECIFIC HARD RULES
// ===========================================

const NONFICTION_CONTRACT = `
=== NONFICTION / SELF-HELP / BUSINESS CONTRACT ===

MUST INCLUDE:
• Mental models the reader can apply
• Reusable frameworks (2x2 matrices, step processes)
• Stories or scenarios (real or illustrative)
• Named concepts (memorable, quotable)

MUST FEEL:
• Transformational, NOT informational
• Like talking to a trusted advisor
• Actionable within 24 hours

=== END NONFICTION CONTRACT ===
`;

// ===========================================
// BORN-QUALITY CONTRACT v1.0
// Embeds Chief Editor Constitution v4.0 scoring criteria into generation
// so content is BORN at 85+ audit scores without post-generation review.
// Injected into ALL pipelines (academic, bestseller, text, workbook, etc.)
// ===========================================

// BORN_QUALITY_CONTRACT v4.0 — Merged into UNIVERSAL_CORE.
// Kept as reference variable for any remaining imports, but content is now
// part of UNIVERSAL_CORE to prevent instruction duplication/flattening.
const BORN_QUALITY_CONTRACT = `
CONCEPT BUDGET (MANDATORY):
This chapter must introduce and clearly explain 8–15 distinct NAMED concepts appropriate to the subject.
Named concepts include: theories, laws, principles, frameworks, mathematical constructs, models, named effects, technical terms.
Do NOT just describe phenomena — NAME the constructs. Example: say "Heisenberg's Uncertainty Principle" not "the idea that you can't measure both position and momentum."

EXEMPLAR (match this density and variation):
"""
Loss aversion operates through a neural mechanism distinct from rational preference ordering. Kahneman and Tversky's 1979 experiments demonstrated that losses carry roughly 2.25x the psychological weight of equivalent gains — a ratio that holds across cultures, income levels, and asset classes. This asymmetry creates a measurable distortion: investors hold losing positions 1.5x longer than winning ones (Odean, 1998), not from ignorance but from a hardwired pain-avoidance circuit rooted in the amygdala.

The practical consequence? Portfolio construction that ignores loss aversion systematically underperforms. Three mechanisms drive this: anchoring to purchase price rather than current value, the disposition effect that crystalizes gains prematurely, and what behavioral economists call "myopic loss aversion" — checking returns too frequently amplifies perceived volatility by 3x.
"""
`;

// FINAL_DIRECTIVE removed in v3.0 — redundant, causes instruction flattening.
// Quality mandate is now embedded in BORN_QUALITY_CONTRACT exemplar.
const FINAL_DIRECTIVE = '';

// ===========================================
// MARKDOWN SANITIZER - COMIC-ONLY plain-text stripper
// ===========================================
// SCOPED TO COMIC CONTENT ONLY:
// Removing markdown headings from academic/text chapters is destructive.
// This function is intentionally limited to dialogue/caption text inside comic panels.
// For non-comic pipelines, the MarkdownRenderer handles all formatting.
// ===========================================

function sanitizeMarkdown(content: string): string {
  return content
    // Remove bold markers **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic markers *text* or _text_ (careful with underscores in names)
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1')
    .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '$1')
    // Remove strikethrough ~~text~~
    .replace(/~~([^~]+)~~/g, '$1')
    // NOTE: We deliberately do NOT strip ## headings here.
    // Comic dialogue/captions should not contain headings, so this is safe.
    // Stripping headings from academic/text content would break the MarkdownRenderer.
    // Remove inline code backticks (not expected in comic dialogue)
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules made of asterisks or underscores
    .replace(/^[\*_]{3,}\s*$/gm, '---')
    // Clean up any remaining stray asterisks used for emphasis
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    // Clean up any remaining stray underscores used for emphasis
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ===========================================
// STRUCTURAL VARIATION ENGINE (Phase 2)
// Randomized chapter skeletons to prevent structural uniformity
// ===========================================

const BESTSELLER_SKELETONS = [
  `STRUCTURE VARIANT A:
1. Open with a CONTRADICTION or counterintuitive claim
2. Explain WHY the conventional view fails (with evidence)
3. Introduce your NAMED FRAMEWORK as the alternative
4. Ground it with a REAL-WORLD SCENARIO
5. Deliver 3-5 ACTIONABLE TAKEAWAYS`,

  `STRUCTURE VARIANT B:
1. Open with a CHARACTER/SCENARIO in the middle of a decision
2. Reveal the HIDDEN MECHANISM behind their challenge
3. Introduce the PRINCIPLE that explains the pattern
4. Show 2-3 APPLICATIONS across different contexts
5. Close with a REFLECTION PROMPT that forces self-examination`,

  `STRUCTURE VARIANT C:
1. Open with a PROVOCATIVE STATISTIC or data point
2. Unpack WHAT DRIVES that number (causal analysis)
3. Present a FRAMEWORK for thinking about it differently
4. Apply it to the READER'S situation with concrete steps
5. End with a DECISION MATRIX (table) for immediate use`,

  `STRUCTURE VARIANT D:
1. Open with a QUESTION the reader has never considered
2. Trace the HISTORY/EVOLUTION of the concept (brief)
3. Reveal the MECHANISM most people miss
4. Contrast TWO APPROACHES with a comparison table
5. Close with a SINGLE HIGH-IMPACT ACTION the reader can take today`,
];

const ACADEMIC_SKELETONS = [
  `STRUCTURE VARIANT A:
1. Learning Objectives (3-5 Bloom's-aligned)
2. Theoretical Context — position within existing literature
3. Core Analysis — layered explanation with causal mechanisms
4. Empirical Evidence — data, studies, methodology
5. Critical Evaluation — limitations and counterarguments
6. Applied Implications — real-world applications
7. Exercises (graduated difficulty)`,

  `STRUCTURE VARIANT B:
1. Learning Objectives (3-5 Bloom's-aligned)
2. Problem Statement — what question does this chapter answer?
3. Historical Development — how thinking evolved on this topic
4. Current Consensus — what we know and how we know it
5. Competing Perspectives — contrasting scholarly views
6. Synthesis and Framework — your analytical model
7. Discussion Questions and Exercises`,

  `STRUCTURE VARIANT C:
1. Learning Objectives (3-5 Bloom's-aligned)
2. Case Opening — begin with a real-world puzzle or phenomenon
3. Conceptual Framework — define and relate key constructs
4. Evidence Review — systematic analysis of supporting data
5. Methodological Considerations — how to study this
6. Implications for Practice and Policy
7. Key Takeaways and Exercises`,
];

const TEXT_SKELETONS = [
  `STRUCTURE:
1. Engaging opening — hook through curiosity or surprise
2. Context and background — position the topic
3. Core exploration — 3-4 organized sections
4. Concrete examples with specific details
5. Synthesis — what this means for the reader`,

  `STRUCTURE:
1. Open with a real scenario or observation
2. Zoom out — connect to the bigger picture
3. Deep dive into 2-3 key aspects
4. Practical application — how to use this knowledge
5. Key insights summary`,

  `STRUCTURE:
1. Start with a question worth answering
2. Explore the answer from multiple angles
3. Provide evidence and examples
4. Address common misunderstandings
5. Conclude with actionable clarity`,
];

const PROFESSIONAL_SKELETONS = [
  `STRUCTURE VARIANT A:
1. EXECUTIVE SUMMARY — One-paragraph strategic insight
2. MARKET CONTEXT — Forces shaping this domain (data-driven)
3. FRAMEWORK APPLICATION — Apply a named strategic model with comparison table
4. IMPLEMENTATION ROADMAP — Phased milestones with ownership and timelines
5. RISK MATRIX — What kills this, probability × impact table
6. EXECUTIVE ACTION ITEMS — 5 measurable next steps with KPIs`,

  `STRUCTURE VARIANT B:
1. STRATEGIC CHALLENGE — Frame the decision leaders face
2. COMPETITIVE ANALYSIS — Where the industry stands (data + trends)
3. DECISION FRAMEWORK — Present a structured evaluation tool
4. CASE APPLICATION — Apply framework to a real-world scenario
5. TRADE-OFF ANALYSIS — What you gain vs. what you sacrifice (table)
6. RECOMMENDED ACTIONS — Prioritized by impact and feasibility`,

  `STRUCTURE VARIANT C:
1. INDUSTRY SIGNAL — Start with a trend or inflection point (specific data)
2. ROOT CAUSE ANALYSIS — Why this matters more than it appears
3. STRATEGIC OPTIONS — 3 approaches compared in a decision matrix
4. IMPLEMENTATION BLUEPRINT — Step-by-step with resource requirements
5. MEASUREMENT FRAMEWORK — How to track success (KPIs table)
6. LEADERSHIP BRIEF — Key decisions for C-suite`,
];

const REFERENCE_SKELETONS = [
  `STRUCTURE VARIANT A:
1. SCOPE STATEMENT — What this section covers (2-3 sentences)
2. KEY DEFINITIONS — Bold term + precise definition for each concept
3. DETAILED ENTRIES — Structured, alphabetical or logical coverage
4. COMPARISON TABLE — Side-by-side analysis of approaches/options
5. DECISION GUIDE — When to use which approach
6. QUICK REFERENCE CARD — Summary table of essential information`,

  `STRUCTURE VARIANT B:
1. OVERVIEW — Domain context and relevance
2. TAXONOMY — Classification system for the topic area
3. CORE ENTRIES — Self-contained reference entries with cross-links
4. COMMON PATTERNS — Frequently encountered scenarios with solutions
5. TROUBLESHOOTING — Problem → Cause → Solution format
6. GLOSSARY — Alphabetical key terms with brief definitions`,

  `STRUCTURE VARIANT C:
1. INTRODUCTION — Scope and how to use this reference
2. FOUNDATIONAL CONCEPTS — Prerequisites and building blocks
3. DETAILED REFERENCE — Comprehensive entries organized by theme
4. BEST PRACTICES — Do's and don'ts with rationale
5. CHEAT SHEET — One-page summary table
6. CROSS-REFERENCE INDEX — Links to related chapters/topics`,
];

const CHILDREN_SKELETONS = [
  `STRUCTURE:
1. MEET THE CHARACTER — Introduce hero and setting with warmth
2. THE PROBLEM — Something unexpected happens
3. THE JOURNEY — Character tries to solve it (2-3 attempts)
4. THE SOLUTION — Character succeeds through a lesson learned
5. THE WARM CLOSE — Comforting ending, feeling safe`,

  `STRUCTURE:
1. A CURIOUS QUESTION — Character wonders about something
2. THE ADVENTURE BEGINS — Going to find the answer
3. FRIENDS ALONG THE WAY — Meeting helpers and obstacles
4. THE DISCOVERY — Learning something wonderful
5. SHARING THE LESSON — Character tells others what they learned`,

  `STRUCTURE:
1. AN ORDINARY DAY — Familiar setting, relatable routine
2. SOMETHING CHANGES — A surprise disrupts the routine
3. FEELINGS AND CHOICES — Character faces emotions and decides
4. TRYING AND GROWING — Character grows through effort
5. A NEW NORMAL — Things are better because of the journey`,

  `STRUCTURE:
1. A SPECIAL PLACE — Character loves a particular setting
2. A NEW FRIEND — An unexpected companion appears
3. LEARNING TOGETHER — Both teach each other something
4. A CHALLENGE — Their bond is tested by a difficulty
5. STRONGER TOGETHER — They overcome it through teamwork and kindness`,

  `STRUCTURE:
1. SOMETHING IS MISSING — Character notices something isn't right
2. ASKING FOR HELP — Character seeks guidance from a wise figure
3. THE WRONG WAY — First attempt fails, but lesson is learned
4. THE RIGHT WAY — Character tries again with new understanding
5. CELEBRATION — Community celebrates the character's growth`,
];

function getRandomSkeleton(bookType: string, chapterNumber: number): string {
  let skeletons: string[];
  switch (bookType) {
    case 'bestseller': skeletons = BESTSELLER_SKELETONS; break;
    case 'academic': case 'technical': skeletons = ACADEMIC_SKELETONS; break;
    case 'professional': skeletons = PROFESSIONAL_SKELETONS; break;
    case 'reference': skeletons = REFERENCE_SKELETONS; break;
    case 'children': skeletons = CHILDREN_SKELETONS; break;
    default: skeletons = TEXT_SKELETONS; break;
  }
  // Use chapter number as seed for deterministic but varied selection
  const idx = (chapterNumber * 7 + 3) % skeletons.length;
  return skeletons[idx];
}

// ===========================================
// AUTHORITY-GRADE CONFIGURATION
// ===========================================

const TIER_WORD_LIMITS = {
  free: 4000,
  student: 8000,
  premium: 12000,
  prophet_tier: 16000,
};

const DOMAIN_MIN_SOURCES: Record<string, number> = {
  medicine: 5,
  law: 3,
  science: 5,
  technology: 3,
  business: 3,
  history: 5,
  philosophy: 4,
  default: 3,
};

const DOMAIN_RULES: Record<string, {
  requiresPeerReview: boolean;
  requiresDisclaimer: boolean;
  enforcementLevel: 'strict' | 'standard' | 'flexible';
}> = {
  medicine: { requiresPeerReview: true, requiresDisclaimer: true, enforcementLevel: 'strict' },
  law: { requiresPeerReview: false, requiresDisclaimer: true, enforcementLevel: 'strict' },
  science: { requiresPeerReview: true, requiresDisclaimer: false, enforcementLevel: 'strict' },
  technology: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  business: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  history: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  philosophy: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  default: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'flexible' },
};

// ===========================================
// COMIC VISUAL CONSISTENCY CONTRACT
// ===========================================

const COMIC_STYLE_PRESETS: Record<string, {
  artStyle: string;
  colorPalette: string;
  lineWeight: string;
  shadingStyle: string;
  characterNotes: string;
  compositionNotes: string;
  narrativeArt: string;
}> = {
  modern_superhero: {
    artStyle: 'Cinematic modern American superhero comic art, hyper-dynamic foreshortened poses, dramatic perspective distortion, detailed muscle anatomy, rendered at professional publication quality (Jim Lee / Ivan Reis level)',
    colorPalette: 'Rich saturated primaries with deep complementary shadows, neon accent highlights on energy effects, volumetric god-rays through dust particles',
    lineWeight: 'Variable ink weight — heavy 4pt outlines on foreground subjects tapering to 0.5pt on backgrounds, crosshatch rendering on metallic surfaces',
    shadingStyle: 'Advanced cell shading with rim lighting, subsurface scattering on skin, specular highlights on armor/metal, cast shadows with ambient occlusion',
    characterNotes: 'Heroic 8-head proportions, micro-expression detail (furrowed brows, clenched jaws, dilated pupils), costume texture differentiation (leather vs. fabric vs. metal)',
    compositionNotes: 'Dutch angles for tension, extreme worm-eye for power, leading lines toward focal character, rule-of-thirds eye placement, depth layering with atmospheric perspective',
    narrativeArt: 'Integrated speech bubbles with tailed pointers, bold SFX lettering with dimensional shadows (KRAAKOOOM, THWIPP), caption boxes with subtle gradient fills anchored to panel edges',
  },
  african_superhero: {
    artStyle: 'Premium Afrofuturistic comic art — blending Ndebele geometric patterns with sci-fi tech aesthetics, ornate cultural motifs on architecture and costumes, rendered with the sophistication of a gallery-quality graphic novel',
    colorPalette: 'Deep indigo and burnt sienna base with molten gold accents, Ankara-inspired pattern overlays, bioluminescent cyan tech-glow effects, sunset amber atmospheric washes',
    lineWeight: 'Confident brushstroke-style lines with decorative Adinkra-symbol flourishes, geometric panel borders inspired by Kente weave patterns',
    shadingStyle: 'Dramatic chiaroscuro with warm key light, cool fill shadows, cultural pattern integration in shadow areas, particle effects for spiritual/tech energy',
    characterNotes: 'Diverse African features with dignified heroic presence, elaborate braided/loc hairstyles, costumes fusing traditional beadwork/textiles with futuristic armor plating, scarification and body art as character identity markers',
    compositionNotes: 'Symmetrical compositions for regal moments, spiraling golden-ratio layouts for action, architectural framing using African building motifs, layered foreground silhouettes',
    narrativeArt: 'Speech bubbles with Adinkra-symbol decorative borders, SFX text woven with cultural patterns, caption boxes styled as carved stone tablets or digital holograms',
  },
  children_book: {
    artStyle: 'Premium children illustration — Pixar/DreamWorks quality character design with rounded appealing shapes, subtle texture overlays (paper grain, soft watercolor edges), warm and emotionally inviting with professional picture-book polish',
    colorPalette: 'Harmonious triadic palette with one warm dominant, soft gradient skies, dappled sunlight effects, gentle pastel accents with pops of saturated joy-colors',
    lineWeight: 'Soft variable-weight outlines with tapered brush feel, no harsh corners, gentle implied lines for motion',
    shadingStyle: 'Soft ambient occlusion, gentle bounce light from ground plane, warm nose/cheek blush on characters, subtle cast shadows with diffused edges',
    characterNotes: 'Appealing 3-4 head proportions, oversized expressive eyes with catch-lights, button noses, exaggerated but readable gestures, distinctive silhouettes for each character, textured clothing (knit sweaters, patched overalls)',
    compositionNotes: 'Clear focal hierarchy with size contrast, gentle leading curves toward character faces, generous breathing room around subjects, background detail decreasing toward edges',
    narrativeArt: 'Rounded cloud-shaped speech bubbles with soft outlines, playful hand-lettered style text, fun SFX in bubbly colorful fonts (SPLASH! GIGGLE!), caption boxes as storybook ribbons or scroll banners',
  },
  manga: {
    artStyle: 'Professional Japanese manga art — clean precise linework, Shonen/Seinen quality with detailed screentone rendering, dynamic speed-line compositions, emotionally expressive character art (Takeshi Obata / Yusuke Murata quality)',
    colorPalette: 'Rich grayscale with precision screentone gradients for B&W mode, OR vivid anime-style coloring with cel-shaded flats and gradient backgrounds for color mode',
    lineWeight: 'Precise G-pen style lines — 0.3mm for detail, 0.8mm for character outlines, explosive radiating speed lines for impact, delicate hatching for texture',
    shadingStyle: 'Screentone dot-patterns at varying densities (10%–60%), dramatic chiaroscuro for serious scenes, sparkle/flower overlay for comedic/romantic beats, motion blur streaks',
    characterNotes: 'Large detailed eyes with multiple highlight layers and iris patterns, diverse manga hair with dynamic flow and strand detail, full range of manga emotion expressions (sweatdrops, anger veins, sparkle eyes, chibi reactions)',
    compositionNotes: 'Diagonal panel cuts for urgency, overlapping panels for simultaneous action, character breaking panel borders during climactic moments, extreme close-ups on eyes for emotional beats',
    narrativeArt: 'Clean rectangular speech bubbles with sharp tails, screaming/shouting text in jagged explosive bubbles, thought bubbles as floating clouds, SFX as large integrated onomatopoeia art (ドドドド style impact text), right-to-left reading flow option',
  },
  graphic_novel: {
    artStyle: 'Prestige graphic novel art — painterly realism with cinematic composition, detailed environmental storytelling, moody atmospheric rendering at Mœbius / Sean Murphy quality level',
    colorPalette: 'Sophisticated limited palette per scene with dominant color temperature shifts (warm interiors, cool exteriors), desaturated backgrounds with selective color accents on narrative focus points',
    lineWeight: 'Detailed variable linework with hatching, stippling, and dry-brush textures, architectural precision on environments, loose gestural marks on organic subjects',
    shadingStyle: 'Painterly gradients with visible brushwork texture, noir-influenced shadow play, volumetric atmospheric haze, reflective surface rendering, environmental storytelling through lighting (warm=safe, cold=danger)',
    characterNotes: 'Realistic proportions with stylized edge, subtle acting through posture/body language, period-accurate or world-consistent wardrobe detail, aging/wear on clothing and skin',
    compositionNotes: 'Wide-screen aspect ratio panels for cinematic feel, establishing shot → medium → close-up film grammar, negative space as emotional tool, environmental framing (doorways, windows, mirrors)',
    narrativeArt: 'Minimalist rectangular caption boxes with muted background tint, clean sans-serif lettering, understated speech bubbles that integrate with panel composition, sparse but impactful SFX rendered as part of the environment',
  },
};

// ===========================================
// COMIC SUB-TYPE CONFIGURATION
// Multi-Agent Architecture for Comics
// ===========================================

interface ComicSubTypeDefinition {
  ageRange: string;
  languageLevel: 'simple' | 'moderate' | 'advanced';
  panelDensity: number;
  dialogueComplexity: 'minimal' | 'moderate' | 'rich';
  hasLearningObjectives: boolean;
  certificationEligible: boolean;
  storyArchitectRules: string;
  scriptwriterRules: string;
  visualDirectorRules: string;
  learningAgentRules?: string;
}

const COMIC_SUB_TYPE_DEFINITIONS: Record<string, ComicSubTypeDefinition> = {
  children_story: {
    ageRange: '4-7',
    languageLevel: 'simple',
    panelDensity: 3,
    dialogueComplexity: 'minimal',
    hasLearningObjectives: false,
    certificationEligible: true,
    storyArchitectRules: 'Simple linear stories with clear beginning, middle, end. One central character. No complex subplots. Maximum 3 scenes per chapter.',
    scriptwriterRules: 'Simple vocabulary, short sentences (max 8 words). Positive emotions. No scary content. Sound effects encouraged (BOOM!, WHOOSH!).',
    visualDirectorRules: 'Large panels, bright colors, rounded shapes. Characters must have friendly expressions. Backgrounds simple and uncluttered.',
  },
  children_learning: {
    ageRange: '7-12',
    languageLevel: 'moderate',
    panelDensity: 4,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Story must embed learning objectives naturally. Problem-solution structure. Character learns something new each chapter.',
    scriptwriterRules: 'Grade-appropriate vocabulary. Explain concepts through character dialogue. Include curiosity questions. Vocabulary words can be slightly challenging.',
    visualDirectorRules: 'Educational diagrams can be integrated. Show cause-and-effect visually. Characters can point to or interact with learning content.',
    learningAgentRules: 'Each chapter must have 1-2 clear learning takeaways. Concepts explained through story, not lectures. Include a "Did You Know?" panel.',
  },
  teen_graphic: {
    ageRange: '13-17',
    languageLevel: 'advanced',
    panelDensity: 5,
    dialogueComplexity: 'rich',
    hasLearningObjectives: false,
    certificationEligible: false,
    storyArchitectRules: 'Complex narratives allowed. Multiple characters with distinct arcs. Moral ambiguity acceptable. Cliffhangers encouraged.',
    scriptwriterRules: 'Natural teen dialogue. Emotional depth. Internal monologue allowed. Subtext and nuance welcomed.',
    visualDirectorRules: 'Dynamic camera angles. Atmospheric lighting. Detailed backgrounds. Cinematic compositions.',
  },
  educational: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 5,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Concept-first structure. Each scene introduces or reinforces a concept. Story serves the learning, not vice versa.',
    scriptwriterRules: 'Clear explanations through character dialogue. Technical terms introduced and defined. Analogies encouraged.',
    visualDirectorRules: 'Visual metaphors for abstract concepts. Diagrams and charts integrated naturally. Progressive complexity in visuals.',
    learningAgentRules: 'Must include: (1) Concept introduction, (2) Visual demonstration, (3) Application example, (4) Summary panel. Learning objectives stated at chapter start.',
  },
  moral_values: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 4,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Values-driven narrative. Clear moral dilemma presented. Resolution demonstrates the value. No preachiness - show, dont tell.',
    scriptwriterRules: 'Authentic emotional moments. Characters face real choices. Dialogue reveals character growth.',
    visualDirectorRules: 'Expressive character emotions. Key moral moments get larger panels. Visual contrast between right and wrong choices.',
    learningAgentRules: 'Core value must be demonstrated through action, not stated. Reflection moment at chapter end. Discussion questions optional.',
  },
  entertainment: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 5,
    dialogueComplexity: 'rich',
    hasLearningObjectives: false,
    certificationEligible: false,
    storyArchitectRules: 'Entertainment first. Strong hooks. Page-turner pacing. Genre conventions respected.',
    scriptwriterRules: 'Witty dialogue. Character voice differentiation. Memorable lines. Humor where appropriate.',
    visualDirectorRules: 'Maximum visual impact. Action sequences well choreographed. Splash pages for key moments.',
  },
};

// ===========================================
// MULTI-AGENT COMIC PROMPT BUILDERS
// Each agent has a specific role and expertise
// ===========================================

function buildStoryArchitectPrompt(subType: string, chapterTitle: string, bookTitle: string, chapterNumber: number): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  return `[STORY ARCHITECT AGENT]
  
You are designing the narrative structure for Chapter ${chapterNumber}: "${chapterTitle}" of "${bookTitle}".

STORY TYPE: ${subType.replace(/_/g, ' ').toUpperCase()}
AGE RANGE: ${config.ageRange}

YOUR RULES:
${config.storyArchitectRules}

OUTPUT REQUIRED:
1. Chapter Goal: What happens in this chapter? (1 sentence)
2. Story Beat 1: Opening hook/setup
3. Story Beat 2: Rising action/conflict
4. Story Beat 3: Climax/resolution
5. Emotional Arc: How does the reader feel at start vs end?
6. Transition: How does this lead to the next chapter?

Keep structure tight and purposeful.`;
}

function buildScriptwriterPrompt(subType: string, language: string, characterSheet?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  let characterInstructions = '';
  if (characterSheet?.characters?.length > 0) {
    characterInstructions = '\n\nCHARACTER VOICES TO MAINTAIN:\n' + 
      characterSheet.characters.map((c: any) => 
        `- ${c.name} (${c.role}): ${c.personalityTraits || 'Consistent personality'}`
      ).join('\n');
  }
  
  return `[SCRIPTWRITER AGENT]

You write dialogue for ${subType.replace(/_/g, ' ')} comics.
LANGUAGE: ${language}
COMPLEXITY: ${config.dialogueComplexity}

YOUR RULES:
${config.scriptwriterRules}
${characterInstructions}

DIALOGUE FORMAT (MANDATORY):
- CHARACTER_NAME: "Dialogue text here"
- For thoughts: - CHARACTER_NAME: *(thinking) Internal thought*
- For narration: - NARRATOR: "Narration text"

Every panel MUST have dialogue. No silent panels allowed.`;
}

function buildVisualDirectorPrompt(subType: string, stylePreset: string, characterSheet?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  const style = COMIC_STYLE_PRESETS[stylePreset] || COMIC_STYLE_PRESETS.children_book;
  
  let characterVisuals = '';
  if (characterSheet?.characters?.length > 0) {
    characterVisuals = '\n\nCHARACTER VISUAL REFERENCE (MUST MAINTAIN CONSISTENCY):\n' + 
      characterSheet.characters.map((c: any) => 
        `- ${c.name}: ${c.physicalDescription}. Wearing: ${c.clothingDescription || 'consistent outfit'}. Distinctive: ${c.distinctiveFeatures || 'none'}`
      ).join('\n');
  }
  
  const settingVisual = characterSheet?.settingDescription 
    ? `\n\nSETTING REFERENCE:\n${characterSheet.settingDescription}` 
    : '';
  
  return `[VISUAL DIRECTOR AGENT — ADVANCED CINEMATIC COMPOSITION]

You are a world-class comic art director creating publication-grade panel compositions.

STYLE GUIDE:
- Art Style: ${style.artStyle}
- Palette: ${style.colorPalette}
- Line Weight: ${style.lineWeight}
- Shading: ${style.shadingStyle || 'Dramatic lighting with depth'}
- Composition: ${(style as any).compositionNotes || 'Cinematic framing with depth layering'}

YOUR RULES:
${config.visualDirectorRules}
${characterVisuals}
${settingVisual}

ADVANCED COMPOSITION TECHNIQUES (USE THESE):
1. DEPTH LAYERING: Every panel must have foreground, midground, and background elements
2. CAMERA LANGUAGE: Vary angles per panel — wide establishing, medium two-shot, close-up reaction, over-shoulder, Dutch angle for tension, bird-eye for scale
3. LIGHTING AS NARRATIVE: Use warm/cool temperature shifts to convey safety/danger, rim lighting for heroic moments, silhouettes for mystery
4. ENVIRONMENTAL STORYTELLING: Background details that hint at world-building (posters, weather, debris, cultural artifacts)
5. MOTION & ENERGY: Speed lines, impact frames, blur trails, dust/particle effects for action panels
6. FRAMING DEVICES: Use doorways, windows, branches, architecture to frame subjects naturally
7. EMOTIONAL SPACING: Tight framing for claustrophobia/tension, wide breathing room for peace/wonder

VISUAL DESCRIPTION FORMAT (MANDATORY — BE CINEMATIC):
Visual: [Camera angle + lens feel] of [detailed scene]. [Character(s) with specific pose, expression, gesture]. [Lighting direction + quality + color temperature]. [Atmosphere: particles, weather, time of day]. [Background layers with specific details]. [Motion effects if action].

Example: "Low-angle medium shot (wide lens) — AMARA stands powerfully in the center of a golden-hour marketplace, hands on hips, jaw set with determination, wind catching her braided hair. Warm amber key light from setting sun behind her casting a long shadow forward. Midground: colorful fabric stalls with billowing silk. Background: city skyline silhouetted against orange-pink sky. Dust motes floating in sunbeams. A mysterious hooded vendor watches from shadow of a doorway frame-right."`;
}

function buildLearningAgentPrompt(subType: string, learningConfig?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType];
  if (!config?.hasLearningObjectives || !config.learningAgentRules) {
    return '';
  }
  
  let objectivesSection = '';
  if (learningConfig?.objectives?.length > 0) {
    objectivesSection = '\n\nLEARNING OBJECTIVES TO EMBED:\n' + 
      learningConfig.objectives.map((o: any, i: number) => `${i + 1}. ${o.objective}`).join('\n');
  }
  
  let momentsSection = '';
  if (learningConfig?.learningMoments?.length > 0) {
    momentsSection = '\n\nLEARNING MOMENTS TO INCLUDE:\n' + 
      learningConfig.learningMoments.map((m: any) => `- ${m.concept}: ${m.explanation} (Visual hint: ${m.panelHint})`).join('\n');
  }
  
  let vocabularySection = '';
  if (learningConfig?.keyVocabulary?.length > 0) {
    vocabularySection = `\n\nKEY VOCABULARY TO INTRODUCE:\n${learningConfig.keyVocabulary.join(', ')}`;
  }
  
  let moralSection = '';
  if (learningConfig?.moralLesson) {
    moralSection = `\n\nCORE MORAL LESSON:\n${learningConfig.moralLesson}`;
  }
  
  return `[LEARNING AGENT]

YOUR RULES:
${config.learningAgentRules}
${objectivesSection}
${momentsSection}
${vocabularySection}
${moralSection}

Learning must be WOVEN into the story, not lectured. Show through character actions and discoveries.`;
}

function buildContinuityGuardianPrompt(characterSheet?: any): string {
  if (!characterSheet?.characters?.length) {
    return '';
  }
  
  return `[CONTINUITY GUARDIAN AGENT]

CONSISTENCY RULES (HARD ENFORCEMENT):
1. Characters must look IDENTICAL across all panels
2. Outfits do NOT change unless story requires it
3. Physical features (hair, skin, eyes) are LOCKED
4. Setting elements must persist within scenes

CHARACTER LOCK:
${characterSheet.characters.map((c: any) => 
  `- ${c.name}: ${c.physicalDescription}. ALWAYS wears: ${c.clothingDescription || 'consistent outfit'}`
).join('\n')}

If any panel violates consistency, STOP and correct.`;
}

function buildEnhancedComicSystemPrompt(
  subType: string, 
  stylePreset: string, 
  language: string,
  characterSheet?: any,
  learningConfig?: any
): string {
  const storyArchitect = buildStoryArchitectPrompt(subType, '', '', 1);
  const scriptwriter = buildScriptwriterPrompt(subType, language, characterSheet);
  const visualDirector = buildVisualDirectorPrompt(subType, stylePreset, characterSheet);
  const learningAgent = buildLearningAgentPrompt(subType, learningConfig);
  const continuityGuardian = buildContinuityGuardianPrompt(characterSheet);
  
  return `===========================================
SCROLLLIBRARY MULTI-AGENT COMIC GENERATION
===========================================

You are a MULTI-AGENT COMIC CREATION SYSTEM. You embody FIVE specialized agents working in harmony:

${storyArchitect}

${scriptwriter}

${visualDirector}

${learningAgent ? learningAgent : ''}

${continuityGuardian ? continuityGuardian : ''}

===========================================
UNIFIED OUTPUT CONTRACT
===========================================

ALL agents must collaborate to produce panels in this EXACT format:

[PANEL X]
Visual: [Detailed scene description from Visual Director]
Dialogue:
- CHARACTER: "Speech text" [from Scriptwriter]
Caption: "Narration if needed"

CRITICAL RULES:
1. EVERY panel MUST have dialogue (no silent panels)
2. EVERY panel MUST have detailed visual description
3. Characters MUST be visually consistent
4. Story MUST follow the Story Architect's beats
5. ${learningConfig?.objectives?.length > 0 ? 'Learning objectives MUST be embedded naturally' : 'Entertainment value is primary'}

Language for ALL text: ${language}`;
}

function buildEnhancedComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number,
  subType: string,
  learningConfig?: any
): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  let learningSection = '';
  if (config.hasLearningObjectives && learningConfig?.objectives?.length > 0) {
    learningSection = `\n\nLEARNING OBJECTIVES FOR THIS CHAPTER:\n${
      learningConfig.objectives.map((o: any, i: number) => `${i + 1}. ${o.objective}`).join('\n')
    }\n\nThese MUST be demonstrated through the story, not explained directly.`;
  }
  
  if (config.hasLearningObjectives && learningConfig?.moralLesson) {
    learningSection += `\n\nMORAL LESSON: ${learningConfig.moralLesson}`;
  }
  
  return `Create COMIC CHAPTER ${chapterNumber}: "${chapterTitle}"
Book: "${bookTitle}"
Comic Type: ${subType.replace(/_/g, ' ').toUpperCase()}
Target Age: ${config.ageRange}

STORY ELEMENTS:
${keyTopics?.map((t, i) => `${i + 1}. ${t}`).join('\n') || '- Tell an engaging visual story'}
${learningSection}

PANEL COUNT: Generate exactly ${panelCount} panels

OUTPUT FORMAT (MANDATORY):

[PANEL 1]
Visual: Wide establishing shot of [setting]. [Main character] [action/pose]. [Mood/atmosphere].
Dialogue:
- CHARACTER_NAME: "Opening line that hooks the reader"
Caption: [Optional narration]

[PANEL 2]
Visual: [Next scene description]
Dialogue:
- CHARACTER_NAME: "Dialogue continues the story"

(Continue for all ${panelCount} panels)

REQUIREMENTS:
- Dialogue complexity: ${config.dialogueComplexity}
- Panel pacing: ${config.panelDensity} panels worth of story progression
- Language: ${language}
- EVERY panel MUST have at least one dialogue line
- Visual descriptions MUST be detailed enough for image generation

BEGIN COMIC CHAPTER:`;
}

// ===========================================
// WORKBOOK STRUCTURE LIMITS
// ===========================================

const WORKBOOK_LIMITS = {
  maxWordsPerChapter: 1800,
  minWordsPerChapter: 800,
  maxExplanationRatio: 0.30,
};

// ===========================================
// TYPES & INTERFACES
// ===========================================

interface Reference {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  requires_verification?: boolean;
  verified?: boolean;
  peerReviewed?: boolean;
  database?: string;
}

interface ResearchResult {
  references: Reference[];
  inTextCitations: string[];
  metadata: {
    source_count: number;
    source_types: Record<string, number>;
    confidence_score: string;
    research_date: string;
    verified_count?: number;
    peer_reviewed_count?: number;
    databases_covered?: string[];
    topic_coverage?: number;
  };
}

interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  errors: ValidationError[];
  warnings: { code: string; message: string }[];
  failureMessage?: string;
}

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

interface DialogueObject {
  speaker: string;
  text: string;
  type: 'speech' | 'thought' | 'narration';
}

interface PanelDialogueResult {
  panelNumber: number;
  dialogues: DialogueObject[];
  hasDialogue: boolean;
}

function extractPanelDialogues(content: string): PanelDialogueResult[] {
  const results: PanelDialogueResult[] = [];
  
  // Split content by panels
  const panelSections = content.split(/\[PANEL\s*(\d+)\]/gi);
  
  for (let i = 1; i < panelSections.length; i += 2) {
    const panelNumber = parseInt(panelSections[i]);
    const panelContent = panelSections[i + 1] || '';
    
    const dialogues: DialogueObject[] = [];
    
    // Match dialogue patterns: - CHARACTER: "text" or - CHARACTER: text
    // Also handle **CHARACTER**: format from markdown
    const dialogueMatches = panelContent.matchAll(/-\s*\*?\*?([A-Z][A-Za-z_\s]+?)\*?\*?:\s*"?([^"\n]+)"?/gi);
    
    for (const match of dialogueMatches) {
      const speaker = match[1].trim().replace(/\*+/g, ''); // Remove any asterisks
      const text = match[2].trim();
      
      // Determine dialogue type based on markers
      let type: 'speech' | 'thought' | 'narration' = 'speech';
      if (text.startsWith('(') && text.endsWith(')')) {
        type = 'thought';
      } else if (speaker.toLowerCase().includes('narrator') || speaker.toLowerCase().includes('caption')) {
        type = 'narration';
      }
      
      if (text.length > 0) {
        dialogues.push({ speaker, text, type });
      }
    }
    
    results.push({
      panelNumber,
      dialogues,
      hasDialogue: dialogues.length > 0,
    });
  }
  
  return results;
}

function validateComicStructure(content: string): ValidationResult & { panelDialogues?: PanelDialogueResult[]; totalDialogueCount?: number } {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];

  // Match [PANEL X] markers - the primary structure indicator
  const panelRegex = /\[PANEL\s*(\d+)\]/gi;
  const panels = content.match(panelRegex) || [];
  const panelCount = panels.length;
  
  console.log(`[VALIDATE-COMIC] Raw panel markers found: ${panelCount}`);

  // HARD FAIL: No panels
  if (panelCount === 0) {
    errors.push({
      code: 'NO_PANELS_DETECTED',
      message: 'Comic content must have structured panels [PANEL X]',
      severity: 'critical',
    });
    return {
      valid: false,
      blocked: true,
      errors,
      warnings,
      failureMessage: '❌ **COMIC GENERATION BLOCKED**: No panels detected.',
    };
  }

  // HARD FAIL: Insufficient panels
  if (panelCount < 4) {
    errors.push({
      code: 'INSUFFICIENT_PANELS',
      message: `Comic requires minimum 4 panels, found ${panelCount}`,
      severity: 'high',
    });
  }

  // Extract and validate dialogue per panel - MANDATORY
  const panelDialogues = extractPanelDialogues(content);
  const panelsWithoutDialogue = panelDialogues.filter(p => !p.hasDialogue);
  const totalDialogueCount = panelDialogues.reduce((sum, p) => sum + p.dialogues.length, 0);

  // HARD FAIL: Any panel without dialogue
  if (panelsWithoutDialogue.length > 0) {
    const missingPanels = panelsWithoutDialogue.map(p => p.panelNumber).join(', ');
    errors.push({
      code: 'DIALOGUE_MISSING_IN_PANELS',
      message: `Dialogue missing in panel(s): ${missingPanels}. EVERY panel MUST have at least one dialogue.`,
      severity: 'critical',
    });
  }

  // HARD FAIL: Total dialogue count must be >= panel count
  if (totalDialogueCount < panelCount) {
    errors.push({
      code: 'INSUFFICIENT_DIALOGUE_COUNT',
      message: `Total dialogue count (${totalDialogueCount}) must be >= panel count (${panelCount})`,
      severity: 'critical',
    });
  }

  // Check for visual descriptions - supports both plain and markdown format
  const visualPattern = /(?:\*\*)?Visual:?(?:\*\*)?/gi;
  const visualDescriptions = content.match(visualPattern) || [];
  
  if (visualDescriptions.length < panelCount * 0.8) {
    warnings.push({
      code: 'INCOMPLETE_VISUAL_DESCRIPTIONS',
      message: 'Some panels lack detailed visual descriptions',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');
  const panelsMissingList = panelsWithoutDialogue.length > 0 
    ? `Panels without dialogue: ${panelsWithoutDialogue.map(p => p.panelNumber).join(', ')}`
    : '';

  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    panelDialogues,
    totalDialogueCount,
    failureMessage: hasCriticalError 
      ? `❌ **COMIC GENERATION BLOCKED**: Every panel MUST include character dialogue.\n${panelsMissingList}\nTotal dialogues: ${totalDialogueCount}, Required: ${panelCount}` 
      : undefined,
  };
}

function validateWorkbookStructure(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];

  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

  // Check word count limit
  if (wordCount > WORKBOOK_LIMITS.maxWordsPerChapter) {
    errors.push({
      code: 'WORKBOOK_TOO_LONG',
      message: `Workbook exceeds ${WORKBOOK_LIMITS.maxWordsPerChapter} words (${wordCount} words)`,
      severity: 'high',
    });
  }

  // Check for required sections
  const sectionPatterns: Record<string, RegExp> = {
    purpose: /(?:^|\n)##+\s*(?:purpose|objective|goal)/i,
    concepts: /(?:^|\n)##+\s*(?:key\s*concepts?|core\s*ideas?)/i,
    prompts: /(?:^|\n)##+\s*(?:prompts?|exercises?|fill[- ]in|your\s*turn)/i,
    reflection: /(?:^|\n)##+\s*(?:reflect(?:ion)?)/i,
    action: /(?:^|\n)##+\s*(?:action\s*(?:steps?|items?)|next\s*steps?)/i,
  };

  Object.entries(sectionPatterns).forEach(([section, pattern]) => {
    if (!pattern.test(content)) {
      errors.push({
        code: `MISSING_${section.toUpperCase()}_SECTION`,
        message: `Workbook requires a ${section} section`,
        severity: 'high',
      });
    }
  });

  // Check for interactive elements
  const interactivePatterns = [
    /_{3,}/g,
    /\[\s*\]/g,
  ];
  const hasInteractiveElements = interactivePatterns.some(p => p.test(content));
  
  if (!hasInteractiveElements) {
    errors.push({
      code: 'NO_INTERACTIVE_ELEMENTS',
      message: 'Workbook must include fill-in prompts or checkboxes',
      severity: 'high',
    });
  }

  return {
    valid: errors.length === 0,
    blocked: errors.some(e => e.severity === 'critical'),
    errors,
    warnings,
    failureMessage: errors.length > 0 
      ? '❌ **WORKBOOK STRUCTURE VIOLATION**: Must be interactive with prompts, not prose-heavy.'
      : undefined,
  };
}

// ===========================================
// PEDAGOGICAL SCHEMA VALIDATION (PBG-1.0)
// Every chapter MUST include 7 mandatory sections
// ===========================================

interface PedagogicalValidationResult extends ValidationResult {
  sectionsFound: number;
  sectionsRequired: number;
  missingSections: string[];
  score: number;
}

const MANDATORY_PEDAGOGICAL_SECTIONS = {
  learning_objectives: {
    displayName: 'Learning Objectives',
    patterns: [
      /learning\s*objectives?/i,
      /by\s+the\s+end\s+of\s+this\s+chapter/i,
      /you\s+will\s+(?:be\s+able\s+to|learn)/i,
      /objectives?/i,
    ],
    required: true,
  },
  core_concept: {
    displayName: 'Core Concept Explanation',
    patterns: [
      /core\s+concepts?/i,
      /fundamental(?:s)?/i,
      /key\s+(?:concepts?|ideas?|principles?)/i,
      /introduction|overview/i,
    ],
    required: true,
  },
  mental_model: {
    displayName: 'Mental Model / Analogy',
    patterns: [
      /mental\s+model/i,
      /think\s+of\s+it\s+as/i,
      /imagine|analogy|like\s+a/i,
      /similar\s+to/i,
    ],
    required: true,
  },
  worked_examples: {
    displayName: 'Worked Examples',
    patterns: [
      /(?:worked\s+)?examples?/i,
      /for\s+instance/i,
      /consider\s+(?:this|the\s+following)/i,
      /let'?s\s+(?:look\s+at|see|examine)/i,
      /step\s+\d/i,
      /code\s+example/i,
    ],
    required: true,
  },
  common_mistakes: {
    displayName: 'Common Mistakes & Misconceptions',
    patterns: [
      /common\s+mistakes?/i,
      /misconceptions?/i,
      /common\s+errors?/i,
      /avoid|don'?t|pitfall/i,
      /watch\s+out/i,
    ],
    required: true,
  },
  practice_section: {
    displayName: 'Practice Section',
    patterns: [
      /practice/i,
      /exercises?/i,
      /try\s+it/i,
      /your\s+turn/i,
      /apply\s+what\s+you/i,
      /hands[- ]on/i,
    ],
    required: true,
  },
  quiz_gate: {
    displayName: 'Chapter Quiz Gate',
    patterns: [
      /quiz/i,
      /assessment/i,
      /test\s+your/i,
      /check\s+your\s+understanding/i,
      /review\s+questions?/i,
      /self[- ]assessment/i,
    ],
    required: true,
  },
};

function validatePedagogicalSchema(content: string, bookType: string): PedagogicalValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];
  const missingSections: string[] = [];

  // Skip validation for non-educational book types
  const EXEMPT_BOOK_TYPES = ['children', 'comic', 'novel', 'fiction', 'bestseller'];
  if (EXEMPT_BOOK_TYPES.includes(bookType?.toLowerCase())) {
    console.log(`[PEDAGOGICAL] Skipping validation for book type: ${bookType}`);
    return {
      valid: true,
      blocked: false,
      errors: [],
      warnings: [],
      sectionsFound: 7,
      sectionsRequired: 7,
      missingSections: [],
      score: 100,
    };
  }

  const contentLower = content.toLowerCase();
  let sectionsFound = 0;

  Object.entries(MANDATORY_PEDAGOGICAL_SECTIONS).forEach(([sectionId, config]) => {
    const found = config.patterns.some(pattern => pattern.test(content));
    
    if (found) {
      sectionsFound++;
    } else if (config.required) {
      missingSections.push(config.displayName);
      errors.push({
        code: `MISSING_${sectionId.toUpperCase()}`,
        message: `Missing required section: ${config.displayName}`,
        severity: 'high',
      });
    }
  });

  const sectionsRequired = Object.values(MANDATORY_PEDAGOGICAL_SECTIONS).filter(c => c.required).length;
  const score = Math.round((sectionsFound / sectionsRequired) * 100);

  // Check minimum word count for proper chapter depth
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 1500) {
    warnings.push({
      code: 'CHAPTER_TOO_SHORT',
      message: `Chapter has ${wordCount} words (minimum 1500 recommended for proper depth)`,
    });
  }

  // Critical failure if less than 5 sections found
  if (sectionsFound < 5) {
    errors.push({
      code: 'INSUFFICIENT_PEDAGOGICAL_STRUCTURE',
      message: `Only ${sectionsFound}/${sectionsRequired} required sections found. Minimum 5 required.`,
      severity: 'critical',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError && score >= 70,
    blocked: hasCriticalError,
    errors,
    warnings,
    sectionsFound,
    sectionsRequired,
    missingSections,
    score,
    failureMessage: hasCriticalError
      ? `❌ **PEDAGOGICAL SCHEMA VIOLATION**: Chapter requires 7 mandatory sections. Found ${sectionsFound}. Missing: ${missingSections.join(', ')}`
      : undefined,
  };
}

function validateAcademicRequirements(
  content: string,
  sources: Reference[],
  category: string,
  citationStyle: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];
  
  const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
  const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
  
  // HARD FAIL: Insufficient sources
  if (sources.length < minSources) {
    errors.push({
      code: 'INSUFFICIENT_SOURCES',
      message: `${category} requires minimum ${minSources} verified sources, found ${sources.length}`,
      severity: 'critical',
    });
  }
  
  // Check for verifiable sources
  const verifiedSources = sources.filter(s => s.doi || s.url);
  if (sources.length > 0 && verifiedSources.length / sources.length < 0.5) {
    errors.push({
      code: 'UNVERIFIED_SOURCES',
      message: 'At least 50% of sources must have DOI or stable URL',
      severity: 'critical',
    });
  }
  
  // Medical peer-review requirement
  if (domainRules.requiresPeerReview) {
    const peerReviewed = sources.filter(s => s.peerReviewed);
    if (peerReviewed.length < Math.ceil(minSources / 2)) {
      errors.push({
        code: 'INSUFFICIENT_PEER_REVIEWED',
        message: `${category} requires at least ${Math.ceil(minSources / 2)} peer-reviewed sources`,
        severity: 'critical',
      });
    }
  }
  
  // Check for in-text citations
  const citationPatterns: Record<string, RegExp> = {
    APA: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?,?\s*\d{4}[a-z]?\)/g,
    Harvard: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?\s+\d{4}[a-z]?\)/g,
    IEEE: /\[\d+(?:,\s*\d+)*\]/g,
    Chicago: /\[[A-Z][a-z]+,?\s*\d{4}\]/g,
  };
  
  const pattern = citationPatterns[citationStyle] || citationPatterns.APA;
  const citations = content.match(pattern) || [];
  
  if (citations.length === 0 && sources.length > 0) {
    errors.push({
      code: 'NO_IN_TEXT_CITATIONS',
      message: 'Academic content must include in-text citations',
      severity: 'critical',
    });
  }
  
  // Check for References section
  if (!/(?:^|\n)##+\s*(?:references?|bibliography)/i.test(content)) {
    errors.push({
      code: 'MISSING_REFERENCES_SECTION',
      message: 'Academic content must include a References section',
      severity: 'critical',
    });
  }

  // Check for disclaimer in medicine/law
  if (domainRules.requiresDisclaimer) {
    const disclaimerPatterns: Record<string, RegExp> = {
      medicine: /(?:not\s+(?:a\s+)?substitute|consult\s+(?:a\s+)?(?:doctor|physician)|medical\s+advice)/i,
      law: /(?:not\s+(?:a\s+)?substitute|legal\s+advice|consult\s+(?:a\s+)?lawyer)/i,
    };
    const discPattern = disclaimerPatterns[category.toLowerCase()];
    if (discPattern && !discPattern.test(content)) {
      errors.push({
        code: 'MISSING_DISCLAIMER',
        message: `${category} content REQUIRES professional disclaimer`,
        severity: 'critical',
      });
    }
  }
  
  const hasCriticalError = errors.some(e => e.severity === 'critical');
  
  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError ? formatAcademicFailure(errors, category) : undefined,
  };
}

function formatAcademicFailure(errors: ValidationError[], category: string): string {
  let message = '❌ **ACADEMIC GENERATION BLOCKED — QUALITY VIOLATION**\n\n';
  message += `**Category:** ${category}\n\n**Violations:**\n`;
  
  errors.filter(e => e.severity === 'critical').forEach(e => {
    message += `- ${e.message}\n`;
  });
  
  message += '\n**To proceed:**\n';
  message += '1. Try a more specific topic with available academic literature\n';
  message += '2. Ensure the topic has peer-reviewed sources\n';
  
  return message;
}

// ===========================================
// CITATION FORMATTING
// ===========================================

function formatInTextCitation(ref: Reference, style: string): string {
  const lastName = ref.author.split(',')[0] || ref.author.split(' ').pop() || ref.author;
  
  switch (style) {
    case 'APA':
      return `(${lastName}, ${ref.year})`;
    case 'Harvard':
      return `(${lastName} ${ref.year})`;
    case 'Chicago':
      return `[${lastName}, ${ref.year}]`;
    case 'IEEE':
      return `[1]`;
    default:
      return `(${lastName}, ${ref.year})`;
  }
}

// ===========================================
// DEEP RESEARCH PIPELINE
// ===========================================

async function conductDeepResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string,
  authToken: string
): Promise<ResearchResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  
  console.log("[DEEP-RESEARCH] Starting deep research pipeline for:", topic.slice(0, 50));

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/deep-research`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: `${topic}`,
        category,
        keyTopics,
        mode: 'full',
      }),
    });

    if (!response.ok) {
      console.error("[DEEP-RESEARCH] Error:", response.status);
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    const data = await response.json();
    console.log("[DEEP-RESEARCH] Received sources:", data.sources?.length || 0);

    if (!data.sources || data.sources.length === 0) {
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    const references: Reference[] = data.sources
      .filter((s: any) => {
        // Hard-reject placeholder/fabricated entries from the deep research pipeline
        const author = String(s.authors?.join(', ') || s.author || '').trim();
        const title = String(s.title || '').trim();
        const isPlaceholder = /^(unknown|source|n\/a|anonymous)$/i.test(author) 
          || /^(reference\s+\d+|unknown|untitled|n\/a|web reference|article \d+)/i.test(title);
        if (isPlaceholder) {
          console.log(`[DEEP-RESEARCH] Hard-rejecting placeholder: "${author}" / "${title.slice(0, 40)}"`);
        }
        return !isPlaceholder;
      })
      .map((s: any) => ({
        author: s.authors?.join(', ') || s.author || 'Unverified Author',
        title: s.title || 'Untitled — requires verification',
        year: s.year || new Date().getFullYear(),
        type: s.type || 'article',
        doi: s.doi,
        url: s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined),
        journal: s.journal,
        publisher: s.publisher,
        verified: s.verified,
        peerReviewed: s.peerReviewed,
        database: s.database,
      }));

    const inTextCitations = references.map((ref, index) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: {},
        confidence_score: data.metadata?.confidenceScore || 'moderate',
        research_date: new Date().toISOString(),
        verified_count: data.metadata?.verifiedSources || 0,
        peer_reviewed_count: data.metadata?.peerReviewedSources || 0,
        databases_covered: data.metadata?.databasesCovered || [],
        topic_coverage: data.metadata?.topicCoverage || 0,
      },
    };
  } catch (error) {
    console.error("[DEEP-RESEARCH] Error:", error);
    return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
  }
}

async function conductFallbackResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string
): Promise<ResearchResult> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY) {
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "No citations available",
        research_date: new Date().toISOString(),
      },
    };
  }

  try {
    const searchQuery = `Find peer-reviewed academic sources for: "${topic}" in ${category}. Key areas: ${keyTopics.join(', ')}`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: `Find REAL academic references. Return as JSON array.` },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) throw new Error("Perplexity API error");

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    let references: Reference[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        references = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // AUDIT FIX: Hard-reject placeholder references — "Unknown" authors and generic titles
      // are fabrication signals and must never enter the citation pipeline.
      // AUDIT FIX: Fallback pipeline may return URLs without author/title metadata.
      // These must NEVER be inserted as "Unattributed Source" — that is a fabrication signal.
      // Instead return an empty array. The chapter will be generated without references,
      // and the AI is instructed to mark unsupported claims with "[requires verification]".
      console.warn("[GENERATE-CHAPTER] Fallback research produced no parseable references — proceeding without citations to avoid fabrication.");
      references = [];
    }

    const inTextCitations = references.map((ref, index) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: {},
        confidence_score: references.length >= 5 ? "Moderate (fallback)" : "Low",
        research_date: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[RESEARCH-FALLBACK] Error:", error);
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "Research failed",
        research_date: new Date().toISOString(),
      },
    };
  }
}

// ===========================================
// PROMPT BUILDERS
// ===========================================

function getFieldSpecificInstructions(category: string): string {
  const instructions: Record<string, string> = {
    medicine: `- Maintain evidence hierarchy (meta-analyses > RCTs > cohort studies)\n- Include medical disclaimers\n- Cite PubMed/clinical sources`,
    law: `- Cite case law and statutes\n- Include jurisdictional disclaimers`,
    science: `- Include reproducibility statements\n- Distinguish peer-reviewed vs preprint`,
    technology: `- All code must be runnable and formatted\n- Include version information`,
    business: `- Use established frameworks (Porter, SWOT)\n- Include tables for comparative data`,
    default: `- Maintain academic rigor\n- Support claims with citations`,
  };
  return instructions[category.toLowerCase()] || instructions.default;
}

function buildAcademicSystemPrompt(language: string, category: string, citationStyle: string): string {
  return `You are ScrollLibrary — ACADEMIC/SCHOLARLY PIPELINE.

GENERATOR IDENTITY: University Lecturer · Research Scholar · Technical Author

You are writing university-grade academic content. You are INSTRUCTIONAL, RIGOROUS, and EVIDENCE-BASED.
You are NOT a storyteller. You are NOT motivational. You are NOT a ghostwriter.

Your output must be acceptable to:
• University lecturers and academic reviewers
• Institutional quality assurance committees
• Peer-review panels

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

PRIORITY: Correctness > Speed. Trust > Novelty. Understanding > Volume.

LANGUAGE: Write EXCLUSIVELY in ${language}.

AUTHORSHIP RULES:
- You are an AI-assisted author, not a sole author
- Maintain neutral, scholarly tone throughout

CITATION REQUIREMENTS (${citationStyle} format):
- EVERY factual claim must have an in-text citation
- NEVER fabricate citations — only use sources provided
- Mark unsupported claims with "[requires verification]"

COGNITIVE STRUCTURE (MANDATORY):
1. Concept Introduction — Hook the reader, provide context
2. Structured Explanation — Clear, logical progression
3. Applied Examples — Real-world case studies
4. Critical Reflection — Analysis, implications
5. Key Takeaways — Summary of main points

FIELD-SPECIFIC (${category}):
${getFieldSpecificInstructions(category)}

QUALITY STANDARD: Content must be acceptable to university lecturers and academic reviewers.`;
}

function buildAcademicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  category: string,
  keyTopics: string[],
  targetWords: number,
  language: string,
  citationStyle: string,
  references: Reference[],
  inTextCitations: string[]
): string {
  const sourceList = references.slice(0, 15).map((ref, i) => 
    `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''} — Citation: ${inTextCitations[i]}`
  ).join('\n');

  return `Write Chapter: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

VERIFIED SOURCES TO CITE (USE ONLY THESE):
${sourceList}

KEY TOPICS:
${keyTopics?.map((t, i) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words in ${language}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"
5. Use proper Markdown formatting: ## for headings, **bold** for key terms, proper tables

MANDATORY STRUCTURE:

Introduction

[Hook + context + chapter overview]

Main Concepts

[Structured explanation with citations]

Applied Examples

[Real-world applications with evidence]

Critical Analysis

[Deeper analysis, implications]

Key Takeaways

[Numbered summary of main points]

Conclusion

[Synthesis and transition]

References

[Full ${citationStyle} formatted bibliography]

BEGIN WRITING THE COMPLETE ACADEMIC CHAPTER:`;
}

// ===========================================
// COMIC GENERATION - AUTHORITY GRADE
// ===========================================

function buildComicSystemPrompt(style: string, language: string): string {
  const styleGuide = COMIC_STYLE_PRESETS[style] || COMIC_STYLE_PRESETS.children_book;
  
  return `You are a professional comic book writer creating structured comic panels.

VISUAL STYLE:
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}
- Line Weight: ${styleGuide.lineWeight}
- Shading: ${styleGuide.shadingStyle}
- Characters: ${styleGuide.characterNotes}

LANGUAGE: All dialogue and captions must be in ${language}.

COMIC-SPECIFIC BORN-QUALITY RULES:
- Every panel must have dialogue that reveals character or advances plot (no empty exchanges)
- Visual descriptions must be specific enough for an illustrator (camera angle, lighting, character pose)
- Dialogue must sound natural for the target age — no stilted AI phrasing
- Vary panel pacing: action panels, quiet moments, reveals, emotional beats
- Each chapter must have a clear narrative arc with emotional progression

CRITICAL RULES:
1. Use [PANEL 1], [PANEL 2], etc. markers for each panel
2. Every panel MUST have character dialogue
3. Visual descriptions must be detailed for image generation
4. Maintain character consistency across panels
5. Maximum 30 words per speech bubble`;
}

function buildComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number = 5
): string {
  return `Create a COMIC BOOK CHAPTER.

Book: "${bookTitle}"
Chapter ${chapterNumber}: "${chapterTitle}"
Story Elements: ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

Generate exactly ${panelCount} panels using this EXACT format:

[PANEL 1]
Visual: A wide shot of a bustling African city at sunset. Golden light bathes modern skyscrapers mixed with traditional architecture. Our hero AMARA, a young woman with glowing amber eyes and a flowing cape made of golden light, stands on a rooftop surveying the city. Her expression is determined.
Dialogue:
- AMARA: "The city calls to me tonight."
- ELDER VOICE: "Remember your training, child."
Caption: Lagos, Nigeria - Present Day

[PANEL 2]
Visual: Close-up of Amara's face as she senses danger. Her amber eyes glow brighter. Behind her, dark shadows begin to form.
Dialogue:
- AMARA: "I feel them... the shadow creatures are near."

[PANEL 3]
Visual: Dynamic action shot - Amara leaps from the rooftop, her cape trailing golden particles. Below, shadow creatures emerge from the darkness between buildings.
Dialogue:
- AMARA: "You will not harm my people!"
- SHADOW CREATURE: "Foolish child... we are eternal."

[PANEL 4]
Visual: Medium shot of Amara landing in a fighting stance, fists glowing with golden energy. Three shadow creatures surround her.
Dialogue:
- AMARA: "Then I will fight for eternity!"
Caption: The battle begins...

[PANEL 5]
Visual: Amara unleashes a burst of golden light from her hands, the shadow creatures recoiling in pain. The light illuminates the entire street.
Dialogue:
- AMARA: "Light always defeats darkness!"
- SHADOW CREATURE: "This is not over, child of light..."

Now create ${panelCount} original panels for "${chapterTitle}" following the EXACT same format above.
Each panel MUST have: [PANEL X] marker, Visual description, Dialogue with character names, and optional Caption.
All text in ${language}.

BEGIN:`;
}

// ===========================================
// WORKBOOK GENERATION - AUTHORITY GRADE
// ===========================================

function buildWorkbookSystemPrompt(language: string): string {
  return `${SYSTEM_ROLE_NEUTRAL}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

${WORKBOOK_MASTER_CONTRACT}

LANGUAGE: All content must be in ${language}.

HARD LIMITS:
- Maximum ${WORKBOOK_LIMITS.maxWordsPerChapter} words per chapter
- Purpose section: ≤150 words
- Key Concepts: ≤300 words
- Explanation must NEVER exceed 30% of chapter
- Fill-in prompts must DOMINATE the chapter

MANDATORY STRUCTURE (in this exact order):
1. Purpose — Brief goal statement
2. Key Concepts — Bullet points only, minimal prose
3. Fill-In Prompts — Main content (multiple prompts with blank lines)
4. Tables/Worksheets — For planning and organization
5. Reflection Questions — Open questions without answers
6. Action Steps — Checkbox items for next steps

INTERACTIVE ELEMENT REQUIREMENTS:
- Use underscores (___________) for fill-in blanks
- Use empty brackets [ ] for checkboxes
- Use labeled row/column tables for user input (NOT Markdown tables)
- Every prompt must have space for user writing

FORBIDDEN:
- Long explanatory paragraphs
- Essay-style content
- Providing answers to reflection questions
- Walls of text
- Markdown syntax (**, ##, backticks)`;
}

function buildWorkbookChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string
): string {
  return `Create an INTERACTIVE WORKBOOK CHAPTER for:
**Book:** "${bookTitle}"
**Chapter ${chapterNumber}:** "${chapterTitle}"
**Topics:** ${keyTopics?.join(', ') || 'Focus on practical application'}

Generate the chapter following this EXACT structure:

---

## Purpose
[Write ≤150 words explaining what this chapter helps achieve.]

---

## Key Concepts
[Write ≤300 words as bullet points. NO long paragraphs.]

---

## Your Turn: Fill-In Prompts

### Prompt 1: [Topic-specific prompt title]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 2: [Next prompt]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 3: [Another prompt]
_______________________________________________________________________________
_______________________________________________________________________________

---

## Planning Worksheet

| Area | Current State | Goal | First Step |
|------|---------------|------|------------|
|      |               |      |            |
|      |               |      |            |
|      |               |      |            |

---

## Reflection Questions

1. _______________________________________________________________________________?
2. _______________________________________________________________________________?
3. _______________________________________________________________________________?

---

## Action Steps

- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________

---

**REQUIREMENTS:**
✅ Purpose + Concepts ≤450 words
✅ Minimum 3 fill-in prompts with blank lines
✅ At least 1 table with empty cells
✅ Minimum 3 reflection questions
✅ Minimum 5 action checkboxes
✅ Total chapter ≤${WORKBOOK_LIMITS.maxWordsPerChapter} words
✅ All text in ${language}

BEGIN CREATING THE WORKBOOK CHAPTER:`;
}

// ===========================================
// MAIN HANDLER
// ===========================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body ONCE at the start to avoid "Body is unusable" error
  let requestBody: Record<string, unknown> | null = null;
  try {
    requestBody = await req.json();
  } catch (e) {
    console.error("[GENERATE-CHAPTER] Failed to parse request body:", e);
    return new Response(
      JSON.stringify({ error: "Invalid request body", code: "PARSE_ERROR" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Health check (no auth required)
  if (requestBody?.healthCheck) {
    return new Response(
      JSON.stringify({ ok: true, function: "generate-chapter", buildId: `fn:${new Date().toISOString()}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // OCR check endpoint (requires auth, handled below)
  if (requestBody?.ocrCheck && (requestBody as Record<string, unknown>)?.imageUrl) {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    try {
      const ocrResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Analyze this comic panel image. List ALL visible text including speech bubbles, captions, and any words. Return JSON: {"hasText": boolean, "foundText": ["word1", "word2", ...]}` },
              { type: "image_url", image_url: { url: requestBody.imageUrl as string } }
            ]
          }],
        }),
      });
      
      if (ocrResponse.ok) {
        const ocrData = await ocrResponse.json();
        const content = ocrData.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { hasText: false, foundText: [] };
        return new Response(JSON.stringify({ ocrResult: result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      console.error("[OCR] Error:", e);
    }
    return new Response(JSON.stringify({ ocrResult: { hasText: false, foundText: [] } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const editIntent_raw = (requestBody?.editIntent as string | null) || null;
    const isChiefEditorRewrite = editIntent_raw?.startsWith('[CHIEF_EDITOR_REWRITE]') || false;
    const forceModel = (requestBody?.forceModel as string | null) || null;

    console.log(`[GENERATE-CHAPTER] User: ${user.id.slice(0, 8)}...`);

    // Check admin status
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false;

    // Get subscription plan from subscriptions table (source of truth)
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", user.id)
      .maybeSingle();

    // Only use tier if subscription is active, otherwise fall back to free
    const userPlan = (subscription?.status === 'active' && subscription?.tier) ? subscription.tier : "free";
    // Model routing respects subscription tier — admin bypass is for limits only, not model upgrade
    // Chief Editor rewrites use forceModel to ensure quality regardless of tier
    const baseModel = getModelForPlan(userPlan);
    const generationModel = (isChiefEditorRewrite && forceModel) ? forceModel : baseModel;
    const maxWordCount = TIER_WORD_LIMITS[userPlan as keyof typeof TIER_WORD_LIMITS] || TIER_WORD_LIMITS.free;
    console.log(`[GENERATE-CHAPTER] Plan: ${userPlan} | Model: ${generationModel}${forceModel ? ` (forced from ${baseModel})` : ''} | Admin: ${isAdmin}`);

    // ===========================================
    // INPUT NORMALIZATION — Defensive layer for multi-path orchestration
    // ===========================================
    const chapterId = (requestBody?.chapterId as string | undefined) || undefined;
    const bookTitle = (requestBody?.bookTitle as string) || '';
    const chapterTitle = (requestBody?.chapterTitle as string) || '';
    const chapterNumber = (requestBody?.chapterNumber as number) || 1;
    const keyTopics = (requestBody?.keyTopics as string[]) || [];
    const category = (requestBody?.category as string) || 'general';
    const wordCount = (requestBody?.wordCount as number) || 4000;
    const language = (requestBody?.language as string) || 'English';
    const bookType = (requestBody?.bookType as string) || 'text';
    const academicMode = Boolean(requestBody?.academicMode);
    const citationStyle = (requestBody?.citationStyle as string) || 'APA';
    const comicStyle = (requestBody?.comicStyle as string) || 'children_book';
    const editIntent = (requestBody?.editIntent as string | null) || null;
    const isRegeneration = Boolean(requestBody?.isRegeneration);

    // Structured observability for orchestration debugging
    console.log(`[GENERATE-CHAPTER] Input normalization: ${JSON.stringify({
      hasChapterId: !!chapterId,
      hasBookTitle: !!bookTitle,
      hasCategory: !!category,
      category,
      bookType,
      language,
      isRegeneration,
      hasEditIntent: !!editIntent,
      academicMode,
      wordCount,
    })}`);

    // ===========================================
    // EDIT CONTROL CONTRACT ENFORCEMENT
    // ===========================================
    
    // Check if this is a regeneration and enforce edit intent requirement
    let existingContent: string | null = null;
    
    if (chapterId) {
      const { data: existingChapter } = await supabase
        .from("chapters")
        .select("content, is_generated")
        .eq("id", chapterId)
        .single();
      
      existingContent = existingChapter?.content || null;
      const wasGenerated = existingChapter?.is_generated || false;
      
      // EDIT CONTROL: If regenerating existing content, require edit intent
      if (wasGenerated && existingContent && existingContent.length > 100) {
        if (isRegeneration && !editIntent) {
          console.log("[GENERATE-CHAPTER] EDIT CONTROL: Regeneration blocked - no edit intent provided");
          return new Response(JSON.stringify({
            error: "Edit intent required for regeneration",
            code: "EDIT_INTENT_REQUIRED",
            message: "Please specify what you want to change before regenerating this chapter.",
            suggestions: [
              "Shorten this chapter",
              "Make it more academic",
              "Add clearer examples",
              "Improve dialogue",
              "Fix formatting",
              "Add more interactive elements",
            ],
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        if (editIntent) {
          console.log(`[GENERATE-CHAPTER] EDIT MODE: Applying edit intent: "${editIntent.slice(0, 100)}..."`);
        }
      }
    }

    // Verify ownership and get book details for style/workbook settings
    const { data: chapter } = await supabase
      .from("chapters")
      .select("book_id")
      .eq("id", chapterId)
      .single();

    // Get book with all style/workbook fields
    let bookDetails: {
      creator_id: string;
      book_type: string;
      workbook_density: string | null;
      comic_style_id: string | null;
      palette_hint: string | null;
      line_weight_hint: string | null;
      character_sheet: any;
      layout_template: number | null;
    } | null = null;

    if (chapter) {
      const { data: book } = await supabase
        .from("books")
        .select("creator_id, book_type")
        .eq("id", chapter.book_id)
        .single();

      bookDetails = book;

      if (book && book.creator_id !== user.id && !isAdmin) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use book-level settings if available, otherwise use request params
    // Cast bookDetails to any for new fields not yet in generated types
    const bookData = bookDetails as any;
    const effectiveBookType = bookData?.book_type || bookType;
    const effectiveComicStyle = bookData?.comic_style_id || comicStyle;
    const effectiveLayoutTemplate = bookData?.layout_template || 5;
    const effectiveWorkbookDensity = bookData?.workbook_density || 'medium';
    const effectiveCharacterSheet = bookData?.character_sheet || {};
    const effectivePaletteHint = bookData?.palette_hint || '';
    const effectiveLineWeightHint = bookData?.line_weight_hint || '';
    const effectiveTextInImage = bookData?.text_in_image ?? true;
    const effectiveScenesPerPanel = bookData?.scenes_per_panel || 1;

    const effectiveWordCount = isAdmin ? wordCount : Math.min(wordCount, maxWordCount);
    
    const languageMap: Record<string, string> = {
      'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish',
      'ar': 'Arabic', 'sw': 'Swahili', 'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || language;
    
    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber}: ${chapterTitle}`);
    console.log(`[GENERATE-CHAPTER] Type: ${bookType}, Academic: ${academicMode}, Admin: ${isAdmin}`);
    console.log(`[GENERATE-CHAPTER] Edit mode: ${editIntent ? 'YES' : 'NO'}${editIntent ? ` - Intent: ${editIntent.slice(0, 50)}` : ''}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ===========================================
    // BUILD EDIT INTENT PROMPT IF REGENERATING
    // ===========================================
    
    let editIntentPrompt = '';
    if (editIntent && existingContent) {
      const isChiefEditorRewrite = editIntent.startsWith('[CHIEF_EDITOR_REWRITE]');
      
      if (isChiefEditorRewrite) {
        // CHIEF EDITOR MODE: Constitution v4.0 — Tier-Neutral, Anti-Pattern, Compression-Aware
        editIntentPrompt = `

=== CHIEF EDITOR CONSTITUTION v4.0 — COMPREHENSIVE REWRITE ===
=== TIER-NEUTRAL | INSTITUTION-READY | ANTI-PATTERN | COMPRESSION-AWARE ===

You are the Chief Editorial Governance Layer for ScrollLibrary.
Your mandate: Maximize intellectual quality, academic defensibility, and cognitive depth — without increasing the user's LLM tier or computational allocation.

🔐 TIER CONSTRAINT (NON-NEGOTIABLE):
- You must NOT escalate models, inflate tokens, or use multi-pass recursive regeneration outside tier constraints.
- You must NOT insert mechanical phrases to satisfy pattern checks.
- You must NOT add artificial verbosity, hallucinate citations, or fabricate statistics.
- All improvements occur through: editorial restructuring, compression + expansion balancing, precision rewriting, logic tightening, redundancy elimination, domain-aware terminology substitution.

ORIGINAL CONTENT (USE AS FOUNDATION — IMPROVE EVERYTHING):
${existingContent.slice(0, 15000)}${existingContent.length > 15000 ? '\n[...content truncated...]' : ''}

${editIntent.replace('[CHIEF_EDITOR_REWRITE]\n', '')}

🎯 PRIMARY OBJECTIVE:
Transform this chapter into an academically defensible, institution-ready text through structural strengthening, cognitive depth enhancement, conceptual precision, logical tightening, natural pedagogical enrichment, and compression-aware refinement.

The goal is NOT more text. The goal is denser reasoning and clearer architecture.

🧠 TIER-NEUTRAL EDITORIAL SCORING ENGINE (5 Dimensions):

**1️⃣ STRUCTURAL INTEGRITY (25%)**
- Logical progression with concept-driven headings
- Strong opening hook (first 120 words)
- Smooth, non-formulaic transitions
- Cohesive conclusion
- Reduce redundancy, remove filler transitions, eliminate circular restatements

**2️⃣ COGNITIVE DEPTH (25%)**
- Elevate: surface explanation → layered analysis, description → mechanism, statement → justification
- Explain WHY concepts matter, clarify underlying processes
- Show causal relationships, differentiate similar ideas
- Increase conceptual density — do NOT inflate word count

**3️⃣ ACADEMIC RIGOR & PRECISION (20%)**
- Define key terms before use
- Remove vague claims and broad generalizations
- Replace ambiguous qualifiers with precise reasoning
- Ensure internal consistency
- No fabricated evidence

**4️⃣ PEDAGOGICAL INTELLIGENCE (15%)**
- Integrate learning design NATURALLY, not mechanically
- Use examples only when conceptually necessary
- Scenario-based explanation where helpful, reflective prompts sparingly
- Progressive complexity
- Avoid: repetitive "for example", forced engagement phrases, checklist-style insertion

**5️⃣ AI DETECTABILITY REDUCTION (15%)**
- Remove predictable LLM transitions, "In conclusion" overuse
- Vary sentence rhythm, paragraph length, structural patterns
- Remove over-symmetric paragraphs and template-like phrasing
- Human editorial texture is required

🧩 COMPRESSION PASS (MANDATORY):
After rewriting: remove redundant sentences, combine overlapping ideas, tighten verbose constructions, replace long phrases with precise equivalents. The rewrite must be TIGHTER than the original unless genuine depth expansion is required.

🔒 COMPLETENESS MANDATE:
- The chapter MUST end with a complete, synthesizing final paragraph
- NEVER truncate mid-sentence or end abruptly
- If running low on space, CUT middle content rather than truncating the ending
- The last paragraph must wrap the chapter's thesis and create a bridge to the next topic

🔄 NARRATIVE VARIATION:
- If the book uses a recurring character, each chapter opening MUST use a DIFFERENT narrative entry point
- NEVER re-describe the same interaction or scene from a previous chapter
- The reader has already read prior chapters — ASSUME prior knowledge
- Vary: internal monologue, a new scene, a realization, a question, a contrast

📏 WORD COUNT POLICY:
- Minimum: 1200 words
- Target: 1500–2200 words
- Only exceed 2200 if subject complexity demands it
- Never expand purely to satisfy length

🧪 SELF-VALIDATION BEFORE OUTPUT:
- Is every major claim explained or justified?
- Are key concepts defined before heavy use?
- Does reasoning build progressively?
- Are there unnecessary repeated transitions?
- Is any paragraph mechanically patterned?
- Did I add verbosity without added insight?
- Did I remain within tier constraints?
If any weakness found — fix before output.

📊 APPEND AT END OF CHAPTER:

--- Editorial Certification ---
Cognitive Depth Classification: [Developing | Proficient | Mastery]
Tier Constraint Confirmation: "No LLM tier escalation used. Editorial improvements performed strictly within the user's assigned computational tier."

BEGIN COMPREHENSIVE REWRITE:`;
      } else {
        // Standard edit intent: targeted changes only
        editIntentPrompt = `

=== CHAPTER REVISION REQUEST ===

ORIGINAL CONTENT (PRESERVE STRUCTURE):
${existingContent.slice(0, 6000)}${existingContent.length > 6000 ? '\n[...content truncated...]' : ''}

EDIT INTENT - APPLY ONLY THESE CHANGES:
${editIntent}

INSTRUCTIONS:
1. PRESERVE the original structure, logic, and continuity
2. Apply ONLY the changes specified above
3. Do NOT rewrite sections unaffected by the edit intent
4. Maintain all quality contracts for this content type
5. Return the COMPLETE revised chapter

BEGIN REVISION:`;
      }
    }

    // ===========================================
    // ACADEMIC MODE - RESEARCH FIRST
    // ===========================================
    let researchResult: ResearchResult | null = null;
    
    // ===========================================
    // ACADEMIC RESEARCH — runs for ALL academic book types (text, illustrated, etc.)
    // Universities require citations regardless of book format
    // ===========================================
    // ===========================================
    // ACADEMIC RESEARCH — domain-aware routing
    // AUDIT FIX: Only trigger STEM deep-research for STEM categories.
    // Non-STEM academic books (Business, Law, Psychology, etc.) should NOT pull
    // STEM-biased citations from the same research pipeline. They get citations
    // via Perplexity fallback with a humanistic search query, or the AI is
    // instructed to use its training knowledge and mark claims for verification.
    //
    // "academicMode=true" alone is NOT sufficient to enter the STEM pipeline —
    // the category must also be a recognised STEM domain.
    // ===========================================
    const STEM_RESEARCH_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'engineering', 'data_science', 'computer_science', 'statistics'];
    const needsAcademicResearch = (academicMode === true && STEM_RESEARCH_CATEGORIES.includes(category?.toLowerCase())) || (
      (bookType === 'illustrated' || bookType === 'text') && 
      STEM_RESEARCH_CATEGORIES.includes(category?.toLowerCase())
    );
    
    if (needsAcademicResearch) {
      console.log(`[GENERATE-CHAPTER] Academic research pipeline for bookType=${bookType}, category=${category}`);
      
      researchResult = await conductDeepResearch(
        `${chapterTitle} - ${bookTitle}`,
        category,
        keyTopics || [chapterTitle],
        citationStyle,
        token
      );
      
      console.log(`[GENERATE-CHAPTER] Research complete: ${researchResult.metadata.source_count} sources`);

      // HARD FAILURE CHECK
      const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
      
      if (researchResult.references.length < minSources && !isAdmin) {
        console.log(`[GENERATE-CHAPTER] HARD FAIL: Insufficient sources`);
        
        return new Response(JSON.stringify({
          error: "Insufficient verified sources for academic content",
          code: "INSUFFICIENT_SOURCES",
          details: {
            found: researchResult.references.length,
            required: minSources,
            category,
            suggestion: "Topic refinement needed. Try a more specific topic.",
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===========================================
    // COMIC BOOK GENERATION
    // ===========================================
    if (effectiveBookType === 'comic') {
      console.log("[GENERATE-CHAPTER] Generating authority-grade comic chapter with multi-agent system...");
      console.log(`[GENERATE-CHAPTER] Comic style: ${effectiveComicStyle}, Panels: ${effectiveLayoutTemplate}`);
      
      // Extract comic sub-type and learning config from already-parsed requestBody
      const comicSubType = (requestBody?.comicSubType as string) || 'entertainment';
      const comicLearningConfig = (requestBody?.comicLearningConfig as any) || null;
      const characterSheetConfig = (requestBody?.characterSheetConfig as any) || effectiveCharacterSheet;
      
      console.log(`[GENERATE-CHAPTER] Comic sub-type: ${comicSubType}, Has learning: ${comicLearningConfig?.objectives?.length > 0}`);
      
      // ===========================================
      // CHAPTER-TO-CHAPTER STORY CONTINUITY
      // Fetch previous chapters for storyline consistency
      // ===========================================
      let previousChaptersSummary = '';
      
      if (chapterNumber > 1 && chapter?.book_id) {
        console.log(`[GENERATE-CHAPTER] Fetching previous chapters for continuity (Chapter ${chapterNumber})...`);
        
        const { data: previousChapters } = await supabase
          .from("chapters")
          .select("chapter_number, title, content, comic_metadata")
          .eq("book_id", chapter.book_id)
          .eq("is_generated", true)
          .lt("chapter_number", chapterNumber)
          .order("chapter_number", { ascending: true });
        
        if (previousChapters && previousChapters.length > 0) {
          console.log(`[GENERATE-CHAPTER] Found ${previousChapters.length} previous chapters for continuity`);
          
          // Build story continuity context from previous chapters
          const summaries = previousChapters.map((ch) => {
            // Extract key plot points from comic metadata if available
            const metadata = ch.comic_metadata as any;
            const plotSummary = metadata?.storySummary || '';
            const keyEvents = metadata?.keyEvents?.join(', ') || '';
            const endingState = metadata?.chapterEndState || '';
            
            // If no metadata, extract from content
            let contentSummary = '';
            if (!plotSummary && ch.content) {
              // Get first and last panels for context
              const panelMatches = ch.content.match(/\[PANEL\s*\d+\][\s\S]*?(?=\[PANEL|\s*$)/gi) || [];
              if (panelMatches.length > 0) {
                const firstPanel = panelMatches[0]?.slice(0, 300) || '';
                const lastPanel = panelMatches[panelMatches.length - 1]?.slice(0, 300) || '';
                contentSummary = `Opening: ${firstPanel.replace(/\[PANEL\s*\d+\]/i, '').trim().slice(0, 150)}... Ending: ${lastPanel.replace(/\[PANEL\s*\d+\]/i, '').trim().slice(0, 150)}`;
              }
            }
            
            return `Chapter ${ch.chapter_number} "${ch.title}": ${plotSummary || contentSummary || 'Story continues'}${keyEvents ? ` Key events: ${keyEvents}` : ''}${endingState ? ` Ends with: ${endingState}` : ''}`;
          }).join('\n');
          
          previousChaptersSummary = `
===========================================
STORY CONTINUITY - PREVIOUS CHAPTERS
===========================================
The following chapters have already been told. Your new chapter MUST continue from where the last chapter ended.
DO NOT contradict established events. DO NOT repeat plot points. BUILD upon what happened.

${summaries}

CRITICAL CONTINUITY RULES:
1. Characters must remember what happened in previous chapters
2. Plot threads introduced earlier should be acknowledged or developed
3. The emotional arc should progress naturally from the previous chapter's ending
4. References to past events should be consistent and accurate
5. If this is a mid-story chapter, DO NOT start like it's the beginning of a new story
===========================================
`;
          console.log(`[GENERATE-CHAPTER] Story continuity context built (${previousChaptersSummary.length} chars)`);
        }
      }
      
      // Build enhanced multi-agent system prompt
      const systemPrompt = buildEnhancedComicSystemPrompt(
        comicSubType,
        effectiveComicStyle,
        languageName,
        characterSheetConfig,
        comicLearningConfig
      );
      
      // Build enhanced chapter prompt with learning objectives
      let chapterPrompt = buildEnhancedComicChapterPrompt(
        chapterTitle, 
        bookTitle, 
        chapterNumber, 
        keyTopics, 
        languageName, 
        effectiveLayoutTemplate,
        comicSubType,
        comicLearningConfig
      );
      
      // Inject story continuity context if available
      if (previousChaptersSummary) {
        chapterPrompt = previousChaptersSummary + '\n\n' + chapterPrompt;
      }
      
      // Comic generation with retry logic for dialogue validation
      const MAX_COMIC_ATTEMPTS = 2;
      let comicContent = "";
      let comicValidation: ReturnType<typeof validateComicStructure> | null = null;
      
      for (let attempt = 1; attempt <= MAX_COMIC_ATTEMPTS; attempt++) {
        console.log(`[GENERATE-CHAPTER] Comic generation attempt ${attempt}/${MAX_COMIC_ATTEMPTS}...`);
        
        // Build prompt with stronger dialogue emphasis on retry
        let attemptPrompt = chapterPrompt;
        if (attempt > 1) {
          attemptPrompt = chapterPrompt + `

**CRITICAL RETRY - DIALOGUE ENFORCEMENT:**
Your previous attempt FAILED because panels were missing dialogue.
EVERY SINGLE PANEL **MUST** have at least ONE dialogue line in this format:
- CHARACTER_NAME: "Speech text here"

WITHOUT dialogue in EVERY panel, generation will FAIL AGAIN.
This is MANDATORY. No exceptions.`;
        }
        
        const comicResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: generationModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: attemptPrompt }
            ],
          }),
        });

        if (!comicResponse.ok) {
          throw new Error("Failed to generate comic chapter");
        }

        const comicData = await comicResponse.json();
        comicContent = comicData.choices?.[0]?.message?.content || "";
        
        // VALIDATE comic structure with per-panel dialogue check
        comicValidation = validateComicStructure(comicContent);
        
        console.log(`[GENERATE-CHAPTER] Attempt ${attempt} validation: panels=${comicValidation.panelDialogues?.length || 0}, dialogues=${comicValidation.totalDialogueCount || 0}, valid=${comicValidation.valid}`);
        
        if (comicValidation.valid) {
          console.log(`[GENERATE-CHAPTER] Comic script validated on attempt ${attempt}`);
          break;
        }
        
        // Log which panels are missing dialogue
        if (comicValidation.panelDialogues) {
          const missingDialogue = comicValidation.panelDialogues.filter(p => !p.hasDialogue);
          if (missingDialogue.length > 0) {
            console.log(`[GENERATE-CHAPTER] Panels missing dialogue: ${missingDialogue.map(p => p.panelNumber).join(', ')}`);
          }
        }
        
        if (attempt < MAX_COMIC_ATTEMPTS) {
          console.log(`[GENERATE-CHAPTER] Retrying due to dialogue validation failure...`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // Final validation check after all retries
      if (comicValidation && comicValidation.blocked && !isAdmin) {
        console.log("[GENERATE-CHAPTER] COMIC VALIDATION FAILED after all retries");
        
        const missingPanels = comicValidation.panelDialogues
          ?.filter(p => !p.hasDialogue)
          .map(p => `Panel ${p.panelNumber}`) || [];
        
        return new Response(JSON.stringify({
          error: comicValidation.failureMessage,
          code: "COMIC_DIALOGUE_MISSING",
          details: { 
            errors: comicValidation.errors,
            panelsWithoutDialogue: missingPanels,
            totalDialogueCount: comicValidation.totalDialogueCount || 0,
            requiredDialogueCount: comicValidation.panelDialogues?.length || 0,
            attempts: MAX_COMIC_ATTEMPTS,
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("[GENERATE-CHAPTER] Comic script validated, generating images...");
      console.log("[GENERATE-CHAPTER] Raw content preview:", comicContent.slice(0, 500));

      // Parse panels using multiple strategies
      const panels: { num: number; visual: string; dialogue: string; caption: string; imageUrl?: string }[] = [];
      
      // Strategy 1: Split by [PANEL X] markers
      const panelSections = comicContent.split(/\[PANEL\s*(\d+)\]/gi);
      
      for (let i = 1; i < panelSections.length; i += 2) {
        const panelNum = parseInt(panelSections[i]);
        const section = panelSections[i + 1] || '';
        
        // Extract Visual - flexible patterns
        const visualMatch = section.match(/(?:\*\*)?Visual:?\*?\*?\s*([^\n]*(?:\n(?!(?:\*\*)?Dialogue|Caption|-).*)*)/i);
        const visual = visualMatch ? visualMatch[1].trim().replace(/\*+/g, '') : '';
        
        // Extract Dialogue section
        const dialogueMatch = section.match(/(?:\*\*)?Dialogue:?\*?\*?\s*([\s\S]*?)(?=(?:\*\*)?Caption:|$|\[PANEL)/i);
        const dialogue = dialogueMatch ? dialogueMatch[1].trim() : '';
        
        // Extract Caption
        const captionMatch = section.match(/(?:\*\*)?Caption:?\*?\*?\s*"?([^"\n]*)"?/i);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        
        if (visual || dialogue) {
          panels.push({ num: panelNum, visual, dialogue, caption });
        }
      }

      console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels via split method`);
      
      // If no panels found, try regex fallback
      if (panels.length === 0) {
        const panelRegex = /\[PANEL\s*(\d+)\][\s\S]*?(?:\*\*)?Visual:?\*?\*?\s*([\s\S]*?)(?:\*\*)?Dialogue:?\*?\*?\s*([\s\S]*?)(?:(?:\*\*)?Caption:?\*?\*?\s*"?([^"\n]*)"?)?(?=\[PANEL|\s*$)/gi;
        let match;
        while ((match = panelRegex.exec(comicContent)) !== null) {
          panels.push({
            num: parseInt(match[1]),
            visual: (match[2] || '').trim().replace(/\*+/g, ''),
            dialogue: (match[3] || '').trim(),
            caption: (match[4] || '').trim(),
          });
        }
        console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels via regex fallback`);
      }

      const styleGuide = COMIC_STYLE_PRESETS[effectiveComicStyle] || COMIC_STYLE_PRESETS.children_book;

      // Generate images with style consistency and upload to storage
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`[GENERATE-CHAPTER] Generating image for panel ${panel.num}...`);
          
          const dialogueForImage = (panel.dialogue || "")
            .replace(/\r/g, "")
            .split("\n")
            .map(l => l.trim())
            .filter(Boolean)
            .slice(0, 8)
            .join(" ");

          const captionForImage = (panel.caption || "").trim();
          
          // Build ADVANCED image prompt for publication-grade comic art
          const narrativeArtGuide = (styleGuide as any).narrativeArt || 'Professional speech bubbles with clear lettering, impactful SFX text, clean caption boxes';
          const compositionGuide = (styleGuide as any).compositionNotes || 'Cinematic framing with depth layering';
          
          let imagePrompt = `PROFESSIONAL COMIC BOOK PANEL — PUBLICATION QUALITY:

ART DIRECTION:
${styleGuide.artStyle}.
Color: ${styleGuide.colorPalette}.
Shading: ${styleGuide.shadingStyle}.
Composition: ${compositionGuide}.

SCENE:
${panel.visual}

RENDERING REQUIREMENTS:
- Three-layer depth: distinct foreground elements, midground characters, detailed background
- Cinematic lighting with visible light source direction, cast shadows, and ambient occlusion
- Character expressions must be emotionally readable and detailed
- Environmental storytelling details in the background
- Professional ink-quality linework with variable weight`;

          // Add multi-scene support
          if (effectiveScenesPerPanel > 1) {
            imagePrompt += `\n\nMULTI-SCENE PANEL: Show ${effectiveScenesPerPanel} sequential moments in a single composition with clear visual flow between scenes using gutters or transitional elements.`;
          }

          // Advanced in-picture narrative rendering
          if (effectiveTextInImage && (dialogueForImage || captionForImage)) {
            imagePrompt += `\n\nIN-ART TYPOGRAPHY (${narrativeArtGuide}):
CRITICAL — Render ALL of the following text INSIDE the artwork using professional comic lettering:

${dialogueForImage ? `SPEECH BUBBLES:
${dialogueForImage}
- Each speaker gets their own bubble with a pointed tail aimed at the speaker's mouth
- Bubbles must have clean white fills with black outlines
- Text must be bold, centered, high-contrast, and fully LEGIBLE at print size
- Shouted lines get jagged/explosive bubble outlines
- Whispered lines get dashed bubble outlines` : ''}

${captionForImage ? `CAPTION BOX:
"${captionForImage}"
- Rendered as a rectangular box anchored to panel edge (top-left or bottom)
- Subtle background tint (cream or light color) with clean border
- Italic serif or narrative font style` : ''}

LETTERING RULES:
- All text MUST be spelled correctly with no extra words added
- Maximum 30 words per bubble — split into multiple bubbles if needed
- Reading order: top-left to bottom-right (or right-to-left for manga)
- SFX/onomatopoeia rendered as large stylized art-integrated text with dimensional shadows
- No text outside of bubbles/boxes/SFX art`;
          } else {
            imagePrompt += `\n\nNo text in image — pure visual storytelling panel.`;
          }
          
          const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [{ role: "user", content: imagePrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            const base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            
            if (base64Url && base64Url.startsWith("data:image")) {
              // Upload to storage bucket instead of embedding base64
              try {
                const base64Data = base64Url.split(",")[1];
                const mimeMatch = base64Url.match(/data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
                const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
                
                // Decode base64 to binary
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                  bytes[j] = binaryString.charCodeAt(j);
                }
                
                // Upload path: userId/bookId/chapterId/panel-N.ext
                const storagePath = `${user.id}/${chapter?.book_id || "unknown"}/${chapterId}/panel-${panel.num}.${ext}`;
                
                console.log(`[GENERATE-CHAPTER] Uploading panel ${panel.num} to storage: ${storagePath}`);
                
              const { error: uploadError } = await supabase.storage
                  .from("book-images")
                  .upload(storagePath, bytes.buffer, {
                    contentType: mimeType,
                    upsert: true,
                  });
                
                if (!uploadError) {
                  // Get public URL
                  const { data: publicUrlData } = supabase.storage
                    .from("book-images")
                    .getPublicUrl(storagePath);
                  
                  if (publicUrlData?.publicUrl) {
                    panel.imageUrl = publicUrlData.publicUrl;
                    console.log(`[GENERATE-CHAPTER] Panel ${panel.num} uploaded successfully: ${publicUrlData.publicUrl.slice(0, 80)}...`);
                  } else {
                    console.error(`[GENERATE-CHAPTER] No public URL returned for panel ${panel.num}`);
                    panel.imageUrl = base64Url;
                  }
                } else {
                  console.error(`[GENERATE-CHAPTER] Upload error for panel ${panel.num}:`, uploadError.message);
                  // Fall back to base64 if upload fails
                  panel.imageUrl = base64Url;
                }
              } catch (uploadErr) {
                console.error(`[GENERATE-CHAPTER] Storage upload failed for panel ${panel.num}:`, uploadErr);
                // Fall back to base64 if upload fails
                panel.imageUrl = base64Url;
              }
            } else {
              console.log(`[GENERATE-CHAPTER] No valid image URL returned for panel ${panel.num}`);
            }
          }
          
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`[GENERATE-CHAPTER] Image error for panel ${panel.num}:`, imgError);
        }
      }

      // Build final comic content - plain text, no markdown artifacts
      let finalComicContent = `${chapterTitle}\n\n`;
      finalComicContent += `A comic story from "${bookTitle}"\n\n`;
      
      for (const panel of panels) {
        finalComicContent += `Panel ${panel.num}\n\n`;
        if (panel.imageUrl) {
          finalComicContent += `![Panel ${panel.num}](${panel.imageUrl})\n\n`;
        } else {
          finalComicContent += `[Illustration: ${sanitizeMarkdown(panel.visual).slice(0, 150)}...]\n\n`;
        }
        
        // Format dialogue for reader speech bubbles.
        // Accept lines with optional bullet/hyphen and optional quotes (straight or smart).
        if (panel.dialogue) {
          const dialogueText = panel.dialogue.replace(/\r/g, "");
          const dialogueRegex = /(?:^|\n)\s*(?:[-•]\s*)?([^:\n]{1,60}):\s*["“]?([^\n"”]{1,220})["”]?/g;
          let dMatch: RegExpExecArray | null;
          while ((dMatch = dialogueRegex.exec(dialogueText)) !== null) {
            const character = sanitizeMarkdown(dMatch[1].trim());
            const speech = sanitizeMarkdown(dMatch[2].trim());
            if (character && speech) {
              finalComicContent += `${character}: "${speech}"\n\n`;
            }
          }
        }
        
        if (panel.caption) {
          finalComicContent += `${sanitizeMarkdown(panel.caption)}\n\n`;
        }
        finalComicContent += `---\n\n`;
      }
      
      // Final sanitization pass
      finalComicContent = sanitizeMarkdown(finalComicContent);

      const actualWordCount = finalComicContent.split(/\s+/).filter((w: string) => w.length > 0).length;

      // ===========================================
      // EXTRACT STORY SUMMARY FOR CONTINUITY
      // This metadata helps future chapters maintain story flow
      // ===========================================
      let comicMetadata: any = {};
      
      try {
        // Use AI to extract story summary for continuity
        const summaryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `Analyze this comic chapter and extract:
1. A 2-3 sentence story summary
2. Key events (max 5 bullet points)
3. How the chapter ends (emotional state, cliffhanger, resolution)

Comic content:
${finalComicContent.slice(0, 4000)}

Return JSON only:
{
  "storySummary": "...",
  "keyEvents": ["event1", "event2"],
  "chapterEndState": "..."
}`
            }],
          }),
        });
        
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          const summaryContent = summaryData.choices?.[0]?.message?.content || '';
          const jsonMatch = summaryContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            comicMetadata = JSON.parse(jsonMatch[0]);
            console.log(`[GENERATE-CHAPTER] Story metadata extracted for continuity`);
          }
        }
      } catch (metaError) {
        console.error("[GENERATE-CHAPTER] Failed to extract story metadata:", metaError);
      }
      
      // Add panel data to metadata
      comicMetadata.panelCount = panels.length;
      comicMetadata.dialogueCount = comicValidation?.totalDialogueCount || 0;
      comicMetadata.generatedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalComicContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
          comic_metadata: comicMetadata,
        })
        .eq("id", chapterId);

      if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

      // Count total dialogues from the validated content
      const finalDialogueCount = comicValidation?.totalDialogueCount || 0;
      
      return new Response(JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: 'Lovable AI (Comic)',
        panelCount: panels.length,
        dialogueCount: finalDialogueCount,
        dialoguePerPanel: comicValidation?.panelDialogues?.map(p => ({
          panel: p.panelNumber,
          count: p.dialogues.length,
          dialogues: p.dialogues,
        })) || [],
        comicStyle,
        validation: {
          valid: comicValidation?.valid || false,
          totalDialogueCount: finalDialogueCount,
          panelsWithDialogue: comicValidation?.panelDialogues?.filter(p => p.hasDialogue).length || 0,
        },
        storyMetadata: comicMetadata,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===========================================
    // WORKBOOK GENERATION
    // ===========================================
    if (effectiveBookType === 'workbook') {
      console.log("[GENERATE-CHAPTER] Generating authority-grade workbook chapter...");
      console.log(`[GENERATE-CHAPTER] Workbook density: ${effectiveWorkbookDensity}`);
      
      // Adjust prompts based on density
      const densityMultipliers: Record<string, { prompts: number; tables: number }> = {
        low: { prompts: 2, tables: 1 },
        medium: { prompts: 4, tables: 2 },
        high: { prompts: 6, tables: 3 },
      };
      const density = densityMultipliers[effectiveWorkbookDensity] || densityMultipliers.medium;
      
      const systemPrompt = buildWorkbookSystemPrompt(languageName);
      const baseChapterPrompt = buildWorkbookChapterPrompt(
        chapterTitle, bookTitle, chapterNumber, keyTopics, languageName
      );
      
      // Enhance prompt with density requirements
      const chapterPrompt = baseChapterPrompt + `\n\n**DENSITY REQUIREMENTS:**\n- Include at least ${density.prompts} fill-in prompts\n- Include at least ${density.tables} tables/worksheets`;
      
      const workbookResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: generationModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: chapterPrompt }
          ],
        }),
      });

      if (!workbookResponse.ok) {
        throw new Error("Failed to generate workbook chapter");
      }

      const workbookData = await workbookResponse.json();
      let workbookContent = workbookData.choices?.[0]?.message?.content || "";
      
      // VALIDATE workbook structure
      const workbookValidation = validateWorkbookStructure(workbookContent);
      if (!workbookValidation.valid && !isAdmin) {
        console.log("[GENERATE-CHAPTER] WORKBOOK VALIDATION FAILED:", workbookValidation.errors);
        // Log warnings but don't block - workbook can regenerate
      }
      
      // Add workbook front matter
      const frontMatter = `> **Interactive Workbook**
> Complete all prompts, exercises, and reflection questions.
> Use the blank spaces for your responses.

---

`;
      
      const finalContent = frontMatter + workbookContent;
      const actualWordCount = finalContent.split(/\s+/).filter((w: string) => w.length > 0).length;

      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chapterId);

      if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

      return new Response(JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: 'Lovable AI (Workbook)',
        validation: {
          valid: workbookValidation.valid,
          warnings: workbookValidation.warnings.length,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===========================================
    // STANDARD TEXT / ILLUSTRATED / ACADEMIC GENERATION
    // ===========================================
    const targetWords = Math.min(Math.max(effectiveWordCount, 2000), 6000);

    // ===========================================
    // CHAPTER-TO-CHAPTER CONTENT CONTINUITY (TEXT/ILLUSTRATED)
    // Fetch previous chapters for concept/story flow consistency
    // ===========================================
    let previousChaptersContext = '';
    
    if (chapterNumber > 1 && chapter?.book_id) {
      console.log(`[GENERATE-CHAPTER] Fetching previous chapters for content continuity (Chapter ${chapterNumber})...`);
      
      const { data: previousChapters } = await supabase
        .from("chapters")
        .select("chapter_number, title, content")
        .eq("book_id", chapter.book_id)
        .eq("is_generated", true)
        .lt("chapter_number", chapterNumber)
        .order("chapter_number", { ascending: false })
        .limit(2); // Get last 2 chapters for context
      
      if (previousChapters && previousChapters.length > 0) {
        console.log(`[GENERATE-CHAPTER] Found ${previousChapters.length} previous chapters for content continuity`);
        
        // Build content continuity context from previous chapters
        const summaries = previousChapters.reverse().map((ch) => {
          // Extract key points from content - first 500 and last 300 chars for context
          let contentSummary = '';
          if (ch.content) {
            const opening = ch.content.slice(0, 500).trim();
            const ending = ch.content.slice(-300).trim();
            contentSummary = `Opening: ${opening}... Ending: ...${ending}`;
          }
          
          return `Chapter ${ch.chapter_number} "${ch.title}": ${contentSummary || 'Content continues'}`;
        }).join('\n\n');
        
        previousChaptersContext = `
===========================================
CONTENT CONTINUITY - PREVIOUS CHAPTERS
===========================================
The following chapters have already been written. Your new chapter MUST continue from where the last chapter ended.

CONTINUITY RULES:
1. DO NOT repeat concepts already explained in previous chapters
2. BUILD upon previously established ideas and terminology
3. Reference back to earlier content when extending concepts
4. Maintain consistent tone, style, and terminology
5. If this is a mid-book chapter, DO NOT start like it's a new book introduction
6. Ensure logical progression of complexity and depth

PREVIOUS CONTENT SUMMARY:
${summaries}
===========================================

`;
        console.log(`[GENERATE-CHAPTER] Content continuity context built (${previousChaptersContext.length} chars)`);
      }
    }

    let systemPrompt: string;
    let chapterPrompt: string;
    
    // ===========================================
    // PIPELINE ROUTING: BOOK TYPE IS THE GOVERNING CONSTITUTION
    // ===========================================
    // 
    // CONTRACT 3: Book type GOVERNS the generation pipeline.
    // The book_type field is NOT a suggestion - it's a hard rule.
    // 
    // STEM academic → code-heavy, exercises, mini-projects
    // NON-STEM academic → references, case studies, NO code
    // ===========================================
    
    const ACADEMIC_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'economics', 'finance', 'governance', 'history', 'philosophy'];
    
    // STEM categories that SHOULD have code blocks
    const STEM_CODE_CATEGORIES = ['technology', 'science', 'engineering', 'programming', 'computer_science', 'data_science', 'mathematics', 'statistics'];
    
    // NON-STEM categories that should NEVER have code blocks
    const NON_STEM_CATEGORIES = [
      'business', 'management', 'leadership', 'career', 'entrepreneurship',
      'marketing', 'sales', 'strategy', 'human_resources', 'organizational_behavior',
      'history', 'philosophy', 'psychology', 'sociology', 'education',
      'political_science', 'humanities', 'arts', 'law', 'governance',
      'economics', 'finance', 'wealth', 'investing', 'personal_development',
      'self_help', 'self-help', 'personal development', 'religion', 'spirituality',
      'health', 'wellness', 'communication', 'writing', 'journalism',
    ];
    
    const isAcademicPipeline = 
      effectiveBookType === 'academic' || 
      effectiveBookType === 'technical' ||
      effectiveBookType === 'reference' ||
      (effectiveBookType === 'professional' && ACADEMIC_CATEGORIES.includes(category?.toLowerCase())) ||
      academicMode === true;
    
    // Determine if this academic book should use STEM (code-heavy) or NON-STEM (prose) pipeline
    const categoryLower = (category || '').toLowerCase();
    const titleLower = (bookTitle || '').toLowerCase();
    
    const isStemAcademic = STEM_CODE_CATEGORIES.some(cat => 
      categoryLower.includes(cat) || titleLower.includes(cat)
    ) || !!titleLower.match(/python|javascript|java\b|c\+\+|programming|coding|software|algorithm|data\s*science|machine\s*learning|neural|deep\s*learning|api|database|sql|devops|cloud\s*computing|cyber/i);
    
    const isNonStemAcademic = !isStemAcademic && (
      NON_STEM_CATEGORIES.some(cat => categoryLower.includes(cat)) ||
      !!titleLower.match(/career|business|leadership|management|marketing|strategy|psychology|history|philosophy|sociology|education|law|economics|finance|wealth|entrepreneur|organization|human\s*resource|communication|political|humanities/i)
    );
    
    if (isAcademicPipeline && isNonStemAcademic && researchResult && researchResult.references.length > 0) {
      // NON-STEM ACADEMIC PIPELINE — references, case studies, NO code
      console.log("[GENERATE-CHAPTER] Using NON-STEM ACADEMIC pipeline (references, no code)");
      
      const { PROFESSIONAL_ACADEMIC_PIPELINE: PROF_ACADEMIC } = await import("../_shared/master-prompt.ts");
      
      systemPrompt = `You are ScrollLibrary — NON-STEM ACADEMIC PIPELINE.

${BORN_QUALITY_CONTRACT}

===========================================
GENERATOR IDENTITY: University Professor · Research Scholar · Subject-Matter Expert
===========================================

You are writing a university-grade textbook for ${category.replace(/_/g, " ")}.
Your output must be acceptable to university lecturers and academic reviewers.

CRITICAL: This is NOT a programming or technical manual.
❌ DO NOT include ANY code blocks, code examples, or programming content.
❌ DO NOT use \`\`\`python, \`\`\`javascript, or any code fencing.
❌ DO NOT include [CODE_BLOCK] tags.

Instead, use:
✅ Theoretical frameworks explained in scholarly prose
✅ Case studies with real-world examples
✅ Research findings with proper citations
✅ Comparative tables using markdown pipe format
✅ Decision matrices and analytical frameworks

${PROF_ACADEMIC}

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
CATEGORY: ${category}
CITATION STYLE: ${citationStyle}

ABSOLUTE RULE: If ANY code block appears in the output → OUTPUT IS INVALID.
Teach through EVIDENCE and ANALYSIS, not through CODE.`;

      chapterPrompt = `${previousChaptersContext}Write a NON-STEM ACADEMIC Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

VERIFIED SOURCES TO CITE (USE ONLY THESE):
${researchResult.references.slice(0, 15).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''}`
).join('\n')}

KEY TOPICS:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words in ${languageName}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"
5. Use proper Markdown formatting: ## for headings, **bold** for key terms, pipe-syntax tables
6. ❌ ABSOLUTELY NO code blocks or programming examples
7. ✅ Use case studies, frameworks, research evidence, and tables instead
${chapterNumber > 1 ? '8. BUILD upon previous chapter concepts - do NOT repeat basic introductions' : ''}

MANDATORY STRUCTURE (NON-STEM ACADEMIC):

### Learning Objectives

By the end of this chapter, you will be able to:
1. [Bloom's-aligned objective - Analyze/Evaluate/Synthesize]
2. [Specific, measurable objective]
3. [Specific, measurable objective]

### Introduction

[Academic framing - why this topic matters in ${category}${chapterNumber > 1 ? ' - Reference prior chapter' : ''}]

### Theoretical Foundations

[Key theories, models, and seminal works with in-text citations]

### Research Evidence

[Empirical findings, data, statistics with citations - NO CODE]

### Applied Implications

[Case studies, frameworks, real-world applications using TABLES not code]

### Critical Analysis

[Limitations, alternative perspectives, ongoing debates]

### Key Takeaways

[5-7 concise summary points]

### Discussion Questions & Exercises

1. [Thought-provoking discussion question]
2. [Case study analysis exercise]
3. [Reflection prompt]

### References

[Full ${citationStyle} formatted bibliography - minimum 8 entries]

REMEMBER: NO CODE BLOCKS. Use tables, frameworks, case studies, and scholarly prose.

BEGIN WRITING THE NON-STEM ACADEMIC CHAPTER:`;

    } else if (isAcademicPipeline && isNonStemAcademic) {
      // AUDIT FIX: Non-STEM academic mode — correctly routes regardless of research availability.
      // Previously, academicMode=true with no research fell through to STEM pipeline for NON-STEM books.
      console.log("[GENERATE-CHAPTER] Using NON-STEM ACADEMIC pipeline (no sources available)");
      
      const { PROFESSIONAL_ACADEMIC_PIPELINE: PROF_ACADEMIC } = await import("../_shared/master-prompt.ts");
      
      systemPrompt = `You are ScrollLibrary — NON-STEM ACADEMIC PIPELINE.

${BORN_QUALITY_CONTRACT}

GENERATOR IDENTITY: University Professor · Research Scholar · Subject-Matter Expert

You are writing a university-grade textbook for ${category.replace(/_/g, " ")}.
Your output must pass institutional quality review.

CRITICAL: This is NOT a programming or technical manual.
❌ DO NOT include ANY code blocks, code examples, or programming content.
❌ DO NOT use code fencing of any kind.

Instead, use:
✅ Theoretical frameworks and models
✅ Case studies with real-world examples
✅ Research-backed analysis with citations
✅ Comparative tables using markdown pipe format
✅ Discussion questions and reflection exercises

${PROF_ACADEMIC}

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.

ABSOLUTE RULE: If ANY code block appears → OUTPUT IS INVALID.`;

      chapterPrompt = `${previousChaptersContext}Write a NON-STEM ACADEMIC Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

NON-STEM ACADEMIC STRUCTURE (MANDATORY):

### Learning Objectives

By the end of this chapter, you will be able to:
1. [Bloom's-aligned objective]
2. [Specific objective]
3. [Specific objective]

### Introduction

[Academic overview${chapterNumber > 1 ? ' - Reference prior chapter' : ''}]

### Theoretical Foundations

[Key theories, models, and foundational concepts with citations]

### Research & Evidence

[Research findings, statistics, empirical data — NOT code]

### Practical Applications

[Case studies, frameworks, decision tools — use TABLES not code]

### Critical Analysis

[Limitations, debates, alternative views]

### Key Takeaways

[Summary points]

### Discussion Questions & Exercises

1. [Discussion question]
2. [Case study exercise]
3. [Reflection prompt]

### References

[APA 7th formatted references - include real, verifiable sources]
[Include seminal works for the discipline]
[Include recent research alongside foundational works]

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown: ## for headings, **bold** for key terms, pipe-syntax tables
- ❌ NO code blocks or programming examples
- ✅ Academic tone with proper in-text citations
- ✅ Include References section with 8+ verifiable sources
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts' : ''}

BEGIN WRITING THE NON-STEM ACADEMIC CHAPTER:`;

    } else if (isAcademicPipeline && researchResult && researchResult.references.length > 0) {
      // STEM ACADEMIC/TECHNICAL PIPELINE - code-heavy, literal
      console.log("[GENERATE-CHAPTER] Using STEM ACADEMIC/TECHNICAL pipeline (code-heavy, literal)");
      
      systemPrompt = `You are ScrollLibrary — ACADEMIC/TECHNICAL PIPELINE.

${BORN_QUALITY_CONTRACT}

===========================================
GENERATOR IDENTITY: University Lecturer · Engineer · Research Scholar
===========================================

You are writing a university-grade textbook or technical manual.
Your output must be acceptable to university lecturers, academic reviewers, and institutional quality panels.
You are NOT a storyteller. You are NOT motivational. You are NOT a ghostwriter. You are INSTRUCTIONAL.

STRICTLY FORBIDDEN:
❌ Metaphors of any kind (e.g., "Alchemist", "Wizard", "Journey", "Dark Arts")
❌ Storytelling or narrative framing
❌ Motivational language ("You can do it!", "Believe in yourself")
❌ Hero's journey framing
❌ Analogies to unrelated domains
❌ Emotional appeals
❌ Rhetorical questions for effect
❌ Marketing language ("Revolutionary", "Ultimate", "Game-changing")
❌ AI-sounding transitions ("Let's dive in", "In this chapter we will explore")

REQUIRED:
✅ Literal, technical language only
✅ Learning objectives at chapter start (3-5 specific, measurable Bloom's-taxonomy aligned points)
✅ Code examples with proper formatting (40% minimum for technical topics)
✅ Step-by-step explanations with proper academic terminology
✅ Exercises at chapter end (3-5 practice problems with varying difficulty)
✅ Mini-project at chapter end
✅ In-text citations for ALL factual claims
✅ References section at end in proper citation format
✅ Proper Markdown formatting: ## headings, **bold** for key terms, tables with pipe syntax

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

===========================================
EXECUTABLE COMPUTATIONAL EVIDENCE (MANDATORY FOR QUANTITATIVE CLAIMS)
===========================================

When your chapter contains quantitative claims (regression, simulation, Monte Carlo,
statistical tests, optimization, machine learning, forecasting), you MUST include
[EVIDENCE_BLOCK] markers with executable Python code that demonstrates the claim.

[EVIDENCE_BLOCK] FORMAT:
[EVIDENCE_BLOCK]
claim_id: "c1"
language: python
libraries: numpy, pandas, statsmodels, matplotlib
seed: 42
status: reproducible
data_disclaimer: "Simulated dataset for demonstration purposes."

code:
\`\`\`python
import numpy as np
np.random.seed(42)
# ... executable code
\`\`\`

output:
Expected numeric results here
[/EVIDENCE_BLOCK]

RULES:
- ALWAYS use Python with numpy, pandas, statsmodels, sklearn, scipy, matplotlib
- ALWAYS set np.random.seed(42)
- ALWAYS include plt.xlabel(), plt.ylabel(), plt.title() in visualizations
- ALWAYS label synthetic data: "Simulated dataset for demonstration purposes."
- If citing a real dataset, include DOI
- Status: reproducible | demonstrative | non-executable

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
CATEGORY: ${category}
CITATION STYLE: ${citationStyle}

If ANY metaphor, storytelling, or motivational language appears → OUTPUT IS INVALID.
Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `${previousChaptersContext}Write an ACADEMIC/TECHNICAL Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

VERIFIED SOURCES TO CITE (USE ONLY THESE):
${researchResult.references.slice(0, 15).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''}`
).join('\n')}

KEY TOPICS:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words in ${languageName}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"
5. Use proper Markdown formatting: ## for headings, **bold** for key terms, pipe-syntax tables
6. NO metaphors, storytelling, or motivational content
${chapterNumber > 1 ? '7. BUILD upon previous chapter concepts - do NOT repeat basic introductions' : ''}

MANDATORY STRUCTURE (ACADEMIC/TECHNICAL):

Learning Objectives

By the end of this chapter, you will be able to:
1. [Specific, measurable objective]
2. [Specific, measurable objective]
3. [Specific, measurable objective]

Introduction

[Technical context and scope - NO storytelling, NO emotional hooks${chapterNumber > 1 ? ' - Reference prior chapter if building on concepts' : ''}]

Core Concepts

[Structured technical explanation with citations and proper terminology]

Implementation

[Code examples with proper formatting, step-by-step explanations]

CODE EXAMPLE (${category.toLowerCase().includes('python') ? 'Python' : 'Language'}):

    # Properly indented code
    # With explanatory comments

Practical Exercises

Exercise 1: [Specific task with clear requirements]
Exercise 2: [Intermediate difficulty]
Exercise 3: [Advanced application]

Mini-Project

[Complete hands-on project applying chapter concepts with specifications]

Summary

[Key points in numbered list]

References

[Full ${citationStyle} formatted bibliography]

BEGIN WRITING THE COMPLETE ACADEMIC/TECHNICAL CHAPTER:`;

    } else if (isAcademicPipeline) {
      // Academic mode but no research results - still use technical pipeline
      console.log("[GENERATE-CHAPTER] Using ACADEMIC/TECHNICAL pipeline (no sources available)");
      
      systemPrompt = `You are ScrollLibrary — ACADEMIC/TECHNICAL PIPELINE.

${BORN_QUALITY_CONTRACT}

GENERATOR IDENTITY: University Lecturer · Research Scholar · Technical Author

You are writing a university-grade textbook. Your output must pass institutional quality review.
NO metaphors, NO storytelling, NO motivational content, NO marketing language.

STRICTLY FORBIDDEN:
❌ Metaphors (e.g., "Alchemist", "Wizard", "Journey")
❌ Storytelling or narrative framing  
❌ Motivational language
❌ Hero's journey framing
❌ AI-sounding transitions

REQUIRED:
✅ Learning objectives at chapter start (Bloom's-taxonomy aligned)
✅ Step-by-step technical explanations with proper academic terminology
✅ Code examples with proper formatting (for technical topics)
✅ Exercises and mini-project at chapter end
✅ Proper Markdown formatting: ## headings, **bold** key terms, pipe-syntax tables

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.

Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `${previousChaptersContext}Write an ACADEMIC/TECHNICAL Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

ACADEMIC/TECHNICAL STRUCTURE (MANDATORY):

Learning Objectives

By the end of this chapter, you will be able to:
1. [Specific objective]
2. [Specific objective]
3. [Specific objective]

Introduction

[Technical overview - NO storytelling${chapterNumber > 1 ? ' - Reference prior chapter if building on concepts' : ''}]

Core Concepts

[Detailed technical explanations]

Implementation Examples

[Code examples with proper formatting if applicable]

Exercises

1. [Practice problem - Easy]
2. [Practice problem - Medium]
3. [Practice problem - Advanced]

Mini-Project

[Hands-on project with clear specifications]

Summary

[Key points]

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting: ## for headings, **bold** for key terms, pipe-syntax tables
- NO metaphors or storytelling
- Technical, instructional, scholarly tone
- Learning objectives must be Bloom's-taxonomy aligned (specific, measurable)
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts - do NOT repeat basic introductions' : ''}

BEGIN WRITING THE ACADEMIC/TECHNICAL CHAPTER:`;

    } else if (effectiveBookType === 'illustrated' || effectiveBookType === 'children') {
      // ===========================================
      // ILLUSTRATED / CHILDREN'S BOOK PIPELINE
      // Same quality contracts as bestseller + visual-first content
      // ===========================================
      console.log(`[GENERATE-CHAPTER] Using ILLUSTRATED pipeline for book type: ${effectiveBookType}`);
      
      const isChildrens = effectiveBookType === 'children';
      
      // ===========================================
      // WALL STREET INSTITUTIONAL UPGRADE (same as bestseller)
      // Detect business/wealth books and inject institutional contract
      // ===========================================
      const ILLUSTRATED_BUSINESS_CATEGORIES = [
        'business', 'entrepreneurship', 'finance', 'wealth', 'investing',
        'startup', 'leadership', 'money', 'economics', 'strategy',
        'marketing', 'sales', 'management', 'self-help', 'personal_development',
        'personal development', 'self_help',
      ];
      
      const isIllustratedBusiness = !isChildrens && ILLUSTRATED_BUSINESS_CATEGORIES.some(cat => 
        (category || '').toLowerCase().includes(cat) ||
        (bookTitle || '').toLowerCase().includes(cat)
      ) || (!isChildrens && (bookTitle || '').toLowerCase().match(/billionaire|million|wealth|capital|business|entrepreneur|money|invest|startup|founder|ceo|empire/i));
      
      let illustratedInstitutionalPrompt = '';
      if (isIllustratedBusiness) {
        try {
          const { buildInstitutionalUpgradePrompt } = await import("../_shared/master-prompt.ts");
          const DEEP_FINANCIAL_CHAPTERS = [1, 3, 5, 11, 17, 18];
          const isDeepChapter = DEEP_FINANCIAL_CHAPTERS.includes(chapterNumber);
          illustratedInstitutionalPrompt = buildInstitutionalUpgradePrompt(chapterNumber, chapterTitle, isDeepChapter);
          console.log(`[GENERATE-CHAPTER] ILLUSTRATED WALL STREET MODE: Active (deep=${isDeepChapter}) for Ch.${chapterNumber}`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load institutional contract for illustrated:", e);
        }
      }
      
      // Detect if this illustrated book is academic
      const ILLUSTRATED_ACADEMIC_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'economics', 'finance', 'governance', 'history', 'philosophy'];
      const isIllustratedAcademic = !isChildrens && (
        academicMode === true ||
        ILLUSTRATED_ACADEMIC_CATEGORIES.includes(category?.toLowerCase())
      );
      
      if (isIllustratedAcademic) {
        // ACADEMIC ILLUSTRATED PIPELINE — scholarly content with pedagogical visuals
        console.log("[GENERATE-CHAPTER] ACADEMIC ILLUSTRATED pipeline active");
        
        systemPrompt = `You are ScrollLibrary — ACADEMIC ILLUSTRATED PIPELINE.

${BORN_QUALITY_CONTRACT}

GENERATOR IDENTITY: University Lecturer · Research Scholar · Instructional Designer

You are writing a university-grade illustrated textbook. Visuals serve PEDAGOGICAL purposes — they teach, clarify, and anchor complex concepts.
You are NOT a storyteller. You are NOT motivational. You are INSTRUCTIONAL and EVIDENCE-BASED.

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${illustratedInstitutionalPrompt}`;
      } else {
        // BESTSELLER ILLUSTRATED PIPELINE — engaging narrative with visuals  
        systemPrompt = `${BESTSELLER_SYSTEM_ROLE}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

${BESTSELLER_STRUCTURE_CONTRACT}

${NONFICTION_CONTRACT}

${illustratedInstitutionalPrompt}`;
      }
      
      systemPrompt += `

===========================================
ILLUSTRATED BOOK PIPELINE — HARD LOCK
===========================================

You are writing a ${isChildrens ? "CHILDREN'S BOOK (ages 4-10)" : "RICHLY ILLUSTRATED BOOK"} where visuals are FIRST-CLASS content, not decoration.

GENERATOR IDENTITY: ${isChildrens ? 'Children\'s Author · Educator · Child Psychologist' : isIllustratedAcademic ? 'University Lecturer · Instructional Designer · Visual Educator' : 'Visual Storyteller · Illustrator-Author · Instructional Designer'}

===========================================
ILLUSTRATION PLACEMENT CONTRACT (MANDATORY)
===========================================

You MUST embed exactly 3-5 illustration markers throughout the chapter at KEY MOMENTS.
These markers tell the illustration engine WHERE to place images.

MARKER FORMAT (EXACT — DO NOT DEVIATE):

[FIGURE 1: A descriptive scene for the illustrator — what to draw, who is in it, what action, what setting, what mood]

RULES:
1. Place [FIGURE X] markers INLINE where the illustration should appear
2. Each marker MUST have a detailed visual description (20-40 words minimum)
3. Illustrations must be PEDAGOGICALLY MEANINGFUL — they teach, clarify, or emotionally anchor
4. NO decorative filler — every image must serve the narrative or learning
5. Space illustrations evenly through the chapter (not clustered)
6. The text BEFORE and AFTER each figure should reference or connect to the visual
7. Number figures sequentially: [FIGURE 1], [FIGURE 2], etc.

${isChildrens ? `
CHILDREN'S BOOK RULES:
- Simple, short sentences (max 12 words per sentence)
- Reading level: ages 4-10
- Warm, encouraging, safe emotional tone
- Characters should be relatable and friendly
- Each page-spread should have roughly 1 illustration
- Total word count: 800-1500 words (SHORT — this is a picture book)
- Story structure: clear beginning, middle, end
- Moral or lesson woven naturally (never preachy)
- Repetition and rhythm encouraged for younger readers
` : `
ILLUSTRATED BOOK RULES:
- Rich, engaging prose with vivid descriptions
- Illustrations should enhance understanding of complex ideas
- Use figures for: diagrams, scenes, processes, comparisons, emotional moments
- Each illustration should have a caption-worthy concept
- Balance text and visual storytelling
- The TEXT must meet the SAME depth and quality as a text-only bestseller
- Illustrations ADD to the text — they do NOT replace substance
`}

===========================================
VALIDATION (HARD FAILURE):
===========================================

Before output, verify:
[ ] 3-5 [FIGURE X] markers present
[ ] Figures are spaced throughout (not all at end)
[ ] Each figure has a detailed visual description
[ ] Text references connect to the figures
[ ] ${isChildrens ? 'Word count under 1500 words' : 'Content depth matches text-only bestseller standard'}
[ ] NO figures without descriptive text
[ ] Bestseller mechanics present (hook, named principle, takeaways)

If ANY check fails → REWRITE

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
Create comprehensive, bestseller-grade illustrated chapters where both the TEXT and VISUALS are world-class.`;

      const illustratedWordTarget = isChildrens ? 1200 : targetWords;
      
      // Inject verified sources for academic illustrated books
      let illustratedSourcesSection = '';
      if (isIllustratedAcademic && researchResult && researchResult.references.length > 0) {
        illustratedSourcesSection = `
VERIFIED SOURCES TO CITE (USE ONLY THESE — in-text citations MANDATORY):
${researchResult.references.slice(0, 15).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''}`
).join('\n')}

CITATION REQUIREMENTS:
- Use ${citationStyle} format for ALL in-text citations
- Mark unsupported claims with "[requires verification]"
- Include a ## References section at the end with full bibliography
`;
      }

      chapterPrompt = `${previousChaptersContext}Write ${isChildrens ? 'a children\'s book' : isIllustratedAcademic ? 'an academic illustrated' : 'an illustrated'} Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.
${illustratedSourcesSection}
Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

ILLUSTRATION PLACEMENT (MANDATORY):
Insert exactly ${isChildrens ? '4-5' : '3-4'} [FIGURE X: description] markers throughout the text.
Each figure description must be 20-40 words describing the scene for an illustrator.
${isIllustratedAcademic ? 'Figures MUST be PEDAGOGICAL: diagrams, charts, processes, or annotated visuals that teach. NO decorative illustrations.' : ''}

Example marker:
[FIGURE 1: A young girl standing at the edge of a magical forest, looking up at glowing fireflies with wonder on her face, sunset colors in the background]

${isChildrens ? `
CHILDREN'S BOOK STRUCTURE:
1. OPENING — Introduce character and setting with warmth (include [FIGURE 1])
2. PROBLEM/ADVENTURE — Something happens that drives the story
3. JOURNEY — Character tries to solve/explore (include [FIGURE 2] and [FIGURE 3])
4. RESOLUTION — Satisfying ending with lesson learned (include [FIGURE 4])
5. CLOSING — Warm, comforting end that makes the child feel safe

Keep it SHORT (800-1200 words). This is a PICTURE BOOK.
` : isIllustratedAcademic ? `
ACADEMIC ILLUSTRATED STRUCTURE (MANDATORY — university-grade):
1. LEARNING OBJECTIVES — 3-5 specific, measurable Bloom's-taxonomy aligned objectives
2. INTRODUCTION — Technical context and scope with citations. Include [FIGURE 1] for a conceptual overview diagram.
3. CORE CONCEPTS — Structured explanation with in-text citations and proper academic terminology. Place [FIGURE 2] for a key process/architecture diagram.
4. APPLIED EXAMPLES — Real-world applications with evidence and citations. Place [FIGURE 3] for a comparative chart or data visualization.
5. CRITICAL ANALYSIS — Deeper analysis, implications, and limitations
6. KEY TAKEAWAYS — Numbered summary of main points
7. EXERCISES — 3 practice problems at varying difficulty levels
8. REFERENCES — Full ${citationStyle} formatted bibliography

STRICTLY FORBIDDEN:
❌ Metaphors, storytelling, motivational language
❌ Hero's journey framing or emotional appeals
❌ AI-sounding transitions ("Let's dive in")
❌ Marketing language ("Revolutionary", "Game-changing")
` : `
BESTSELLER ILLUSTRATED STRUCTURE (MANDATORY — same depth as text-only):
1. OPENING HOOK with visual anchor — Story, contradiction, or emotional moment (first 100 words). Include [FIGURE 1] at the key visual moment.
2. CORE IDEA — One central message explained clearly. The reader must understand in 2 minutes.
3. ILLUSTRATION — Real-world story, analogy, or scenario (concrete, human, memorable). Place [FIGURE 2] to visually anchor this example.
4. NAMED PRINCIPLE — Introduce at least ONE memorable, reusable concept name (e.g., "The Compound Effect")
5. READER ENGAGEMENT — Questions, reflection prompts, mental pauses. Place [FIGURE 3] for visual reinforcement.
6. ACTIONABLE TAKEAWAYS — 3-7 clear bullet points the reader can DO after reading. Include [FIGURE 4] if showing a process/framework.
`}
${isIllustratedBusiness ? `
INSTITUTIONAL REQUIREMENTS (BUSINESS ILLUSTRATED BOOK):
7. FINANCIAL ENGINEERING — Include at least 1 markdown table with real numbers
8. CAPITAL IMPACT — Include at least 1 formula or calculation
9. RISK ANALYSIS — Address what kills this strategy
10. EXECUTIVE ACTIONS — 3-5 measurable next steps with KPIs
` : ''}
REQUIREMENTS:
- Approximately ${illustratedWordTarget} words
- Use proper Markdown formatting (## headings, **bold**, tables)
- Include ${isChildrens ? '4-5' : '3-4'} [FIGURE X: description] markers inline
- Every figure must serve the ${isIllustratedAcademic ? 'learning objective' : 'story/learning'}
- Text must flow naturally around figure markers
- NO AI-sounding phrases ("Let's dive in", "In this chapter we will explore")
${isIllustratedAcademic ? '- Include in-text citations for ALL factual claims\n- Use proper academic terminology\n- Exercises at chapter end' : '- Include real-world examples with SPECIFIC NUMBERS\n- Every paragraph must deliver VALUE'}
${isIllustratedBusiness ? '- Include markdown tables for frameworks and models\n- Include quantitative examples with dollar amounts, percentages, multiples' : ''}
${chapterNumber > 1 ? '- CONTINUE from previous chapter concepts — do NOT repeat introductions' : ''}

BEGIN WRITING THE FULL ${isIllustratedAcademic ? 'ACADEMIC' : 'BESTSELLER-GRADE'} ILLUSTRATED CHAPTER:`;
    } else if (effectiveBookType === 'professional') {
      // ===========================================
      // PROFESSIONAL / BUSINESS GUIDE PIPELINE
      // Framework-driven, actionable, decision-oriented
      // ===========================================
      console.log("[GENERATE-CHAPTER] Using PROFESSIONAL pipeline (frameworks, strategy)");
      
      systemPrompt = `${UNIVERSAL_CORE}

${MICRO_CONTRACT_PROFESSIONAL}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;

      chapterPrompt = `${previousChaptersContext}Write a PROFESSIONAL GUIDE Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

${getRandomSkeleton('professional', chapterNumber)}

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

PROFESSIONAL GUIDE STRUCTURE (MANDATORY):
1. EXECUTIVE SUMMARY — Key takeaway in 2-3 sentences (C-suite ready)
2. STRATEGIC CONTEXT — Market forces, industry data, competitive landscape with specific numbers
3. FRAMEWORK APPLICATION — Apply at least 1 named strategic framework (Porter, SWOT, BCG, PESTLE, McKinsey 7S, Blue Ocean) with a markdown comparison table
4. COMPETITIVE BENCHMARKING — Compare at least 2 named companies or approaches with data
5. IMPLEMENTATION ROADMAP — Phased milestones with ownership, timelines, and resource requirements
6. DECISION MATRIX — When to use what approach (weighted scoring markdown table)
7. RISK ASSESSMENT — Probability × Impact table with mitigation strategies
8. ACTION ITEMS — 5-7 specific, measurable next steps with KPIs and deadlines

ILLUSTRATION PLACEMENT (MANDATORY):
Insert 2-3 [FIGURE X: description] markers for strategic diagrams, frameworks, or decision trees.
Example: [FIGURE 1: A strategic positioning matrix comparing four market quadrants with competitor logos]

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, pipe-syntax tables)
- Include at least 3 framework/comparison tables with real data points
- Every recommendation must be specific and measurable (include KPIs, percentages, timelines)
- Include real industry examples with specific numbers and named companies
- Include 2-3 [FIGURE X: description] markers for visual frameworks
- Concept Budget: introduce and name 8-12 strategic concepts
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts - do NOT repeat introductions' : ''}

BEGIN WRITING THE PROFESSIONAL GUIDE CHAPTER:`;

    } else if (effectiveBookType === 'reference') {
      // ===========================================
      // REFERENCE / HANDBOOK PIPELINE
      // Structured lookup, encyclopedic, no narrative
      // ===========================================
      console.log("[GENERATE-CHAPTER] Using REFERENCE pipeline (structured, lookup-ready)");
      
      systemPrompt = `${UNIVERSAL_CORE}

${MICRO_CONTRACT_REFERENCE}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;

      chapterPrompt = `${previousChaptersContext}Write a REFERENCE/HANDBOOK Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

${getRandomSkeleton('reference', chapterNumber)}

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REFERENCE STRUCTURE (MANDATORY):
1. OVERVIEW — 2-3 sentence scope statement with coverage boundaries
2. KEY DEFINITIONS — **Bold term** → precise definition → usage context for each concept (minimum 8 entries)
3. DETAILED ENTRIES — Structured, encyclopedic coverage organized by theme or alphabet
4. COMPARISON TABLE — Markdown table comparing key approaches/options with clear criteria columns
5. DECISION GUIDE — When to use X vs Y with specific conditions and trade-offs
6. TROUBLESHOOTING — Problem → Root Cause → Solution format (minimum 3 entries)
7. QUICK REFERENCE CARD — Summary table of essential information (cheat sheet)
8. CROSS-REFERENCES — Explicit links to related chapters/topics
9. GLOSSARY — Key terms with brief definitions

ILLUSTRATION PLACEMENT (MANDATORY):
Insert 2-3 [FIGURE X: description] markers for:
- Architecture diagrams, taxonomy trees, or system overviews
- Process flowcharts or decision trees
- Comparison charts or visual quick-reference guides
Example: [FIGURE 1: A taxonomy tree showing the classification of machine learning algorithms by type]

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, pipe-syntax tables)
- Include at least 3 reference/comparison tables
- Optimize for scanning and quick lookup — use consistent formatting
- Every entry must be self-contained and findable
- Include 2-3 [FIGURE X: description] markers
- Concept Budget: define and catalog 12-20 distinct entries or concepts
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts' : ''}

BEGIN WRITING THE REFERENCE/HANDBOOK CHAPTER:`;

    } else if (effectiveBookType === 'bestseller' || effectiveBookType === 'text') {
      // ===========================================
      // BESTSELLER / TEXT PIPELINE
      // bestseller = full bestseller mechanics
      // text = lighter version without aggressive hooks/belief disruption
      // ===========================================
      const isBestsellerMode = effectiveBookType === 'bestseller';
      console.log(`[GENERATE-CHAPTER] Using ${isBestsellerMode ? 'BESTSELLER' : 'STANDARD TEXT'} pipeline`);
      
      // ===========================================
      // WALL STREET INSTITUTIONAL UPGRADE (bestseller only)
      // ===========================================
      const BUSINESS_CATEGORIES = [
        'business', 'entrepreneurship', 'finance', 'wealth', 'investing',
        'startup', 'leadership', 'money', 'economics', 'strategy',
        'marketing', 'sales', 'management', 'self-help', 'personal_development',
        'personal development', 'self_help',
      ];
      
      const isBusinessBook = isBestsellerMode && (BUSINESS_CATEGORIES.some(cat => 
        (category || '').toLowerCase().includes(cat) ||
        (bookTitle || '').toLowerCase().includes(cat)
      ) || (bookTitle || '').toLowerCase().match(/billionaire|million|wealth|capital|business|entrepreneur|money|invest|startup|founder|ceo|empire/i));
      
      let institutionalPrompt = '';
      if (isBusinessBook) {
        try {
          const { buildInstitutionalUpgradePrompt } = await import("../_shared/master-prompt.ts");
          const DEEP_FINANCIAL_CHAPTERS = [1, 3, 5, 11, 17, 18];
          const isDeepChapter = DEEP_FINANCIAL_CHAPTERS.includes(chapterNumber);
          institutionalPrompt = buildInstitutionalUpgradePrompt(chapterNumber, chapterTitle, isDeepChapter);
          console.log(`[GENERATE-CHAPTER] WALL STREET MODE: Active (deep=${isDeepChapter}) for Ch.${chapterNumber}`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load institutional contract:", e);
        }
      }
      
      let roadmapPrompt = '';
      const isRoadmapChapter = (chapterTitle || '').toLowerCase().match(/roadmap|positioning|12.month|twelve.month|billionaire.*year/i);
      if (isRoadmapChapter && isBusinessBook) {
        try {
          const { BILLIONAIRE_ROADMAP_CONTRACT } = await import("../_shared/master-prompt.ts");
          roadmapPrompt = BILLIONAIRE_ROADMAP_CONTRACT;
          console.log(`[GENERATE-CHAPTER] BILLIONAIRE ROADMAP MODE: Active for "${chapterTitle}"`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load roadmap contract:", e);
        }
      }
      
      if (isBestsellerMode) {
        // FULL BESTSELLER PIPELINE — Universal Core + Micro-Contract (no stacking)
        systemPrompt = `${UNIVERSAL_CORE}

${MICRO_CONTRACT_BESTSELLER}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

${institutionalPrompt}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;
      } else {
        // STANDARD TEXT PIPELINE — Universal Core + Micro-Contract
        systemPrompt = `${UNIVERSAL_CORE}

${MICRO_CONTRACT_TEXT}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;
      }
      
      if (isBestsellerMode) {
        chapterPrompt = `${previousChaptersContext}Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

${getRandomSkeleton('bestseller', chapterNumber)}
${isBusinessBook ? `
INSTITUTIONAL REQUIREMENTS (BUSINESS BOOK):
7. FINANCIAL ENGINEERING — Include at least 1 markdown table with real numbers
8. CAPITAL IMPACT — Include at least 1 formula or calculation
9. RISK ANALYSIS — Address what kills this strategy
10. EXECUTIVE ACTIONS — 3-5 measurable next steps with KPIs
` : ''}${roadmapPrompt ? `
ROADMAP CHAPTER SPECIAL REQUIREMENTS:
${roadmapPrompt}
` : ''}
REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, tables)
- NO AI-sounding phrases ("Let's dive in", "In this chapter we will explore")
- Include real-world examples with SPECIFIC NUMBERS
- Every paragraph must deliver VALUE
${isBusinessBook ? '- Include markdown tables for frameworks and models\n- Include quantitative examples with dollar amounts, percentages, multiples' : ''}
${chapterNumber > 1 ? '- CONTINUE from previous chapter concepts - do NOT repeat introductions' : ''}

BEGIN WRITING THE FULL BESTSELLER-GRADE CHAPTER:`;
      } else {
        // STANDARD TEXT — no bestseller mechanics forced, NO illustration markers
        chapterPrompt = `${previousChaptersContext}Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

${getRandomSkeleton('text', chapterNumber)}

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

CONCEPT BUDGET: Introduce and clearly explain 8-15 distinct NAMED concepts relevant to "${chapterTitle}". Name theories, principles, frameworks, and models explicitly. Do NOT just describe phenomena — NAME the constructs.

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, tables where useful)
- Clear, well-structured, informative writing with specific examples (names, numbers, dates)
- Adapt tone and depth to the subject matter
- Every major claim needs a concrete example with specifics
- ❌ Do NOT include [FIGURE] markers or illustration placeholders — this is text-only content
- ❌ Do NOT include image references or visual suggestions
${chapterNumber > 1 ? '- CONTINUE from previous chapter concepts - do NOT repeat introductions' : ''}

BEGIN WRITING THE CHAPTER:`;
      }
    } else {
      // UNKNOWN BOOK TYPE FALLBACK — treat as standard text with warning
      console.warn(`[GENERATE-CHAPTER] ⚠️ Unknown book type "${effectiveBookType}" — falling back to STANDARD TEXT pipeline`);
      
      systemPrompt = `${UNIVERSAL_CORE}

${MICRO_CONTRACT_TEXT}

${BORN_QUALITY_CONTRACT}

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;

      chapterPrompt = `${previousChaptersContext}Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

Write approximately ${targetWords} words with clear structure, examples, and proper Markdown formatting.
${chapterNumber > 1 ? 'CONTINUE from previous chapter concepts.' : ''}

BEGIN:`;
    }

    // ===========================================
    // INJECT EDIT INTENT (if regenerating)
    // ===========================================
    if (editIntentPrompt) {
      chapterPrompt = chapterPrompt + editIntentPrompt;
      console.log(`[GENERATE-CHAPTER] Edit intent injected (${editIntentPrompt.length} chars)`);
    }

    // Retry logic for transient gateway errors (502, 503, 504) and rate limits (429)
    // Model fallback chain for 429 rate limits
    const FALLBACK_MODELS = [
      generationModel,
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
    ];
    // Deduplicate: if generationModel is already in the chain, skip it
    const modelChain = [...new Set(FALLBACK_MODELS)];
    
    const MAX_RETRIES = 4;
    let response: Response | null = null;
    let lastErr = "";
    let currentModelIdx = 0;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const activeModel = modelChain[Math.min(currentModelIdx, modelChain.length - 1)];
      
      if (attempt > 0) {
        // Longer backoff for 429 (rate limit), shorter for gateway errors
        const delay = lastErr.includes("rate_limited") ? 5000 * attempt : 2000 * attempt;
        console.log(`[GENERATE-CHAPTER] Retry attempt ${attempt + 1} with model ${activeModel} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
      
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: chapterPrompt }
          ],
        }),
      });
      if (response.ok) break;
      const errText = await response.text();
      lastErr = errText.slice(0, 300);
      console.error(`[GENERATE-CHAPTER] AI gateway error (attempt ${attempt + 1}, model ${activeModel}):`, response.status, lastErr);
      
      if (response.status === 429) {
        // Rate limited — try falling back to a cheaper/faster model
        currentModelIdx++;
        console.log(`[GENERATE-CHAPTER] Rate limited (429), falling back to next model in chain (idx ${currentModelIdx})`);
        continue;
      }
      
      // Retry on transient gateway errors
      if ([502, 503, 504].includes(response.status)) {
        continue;
      }
      
      // Non-retryable error — bail immediately
      throw new Error(`AI generation failed (${response.status}): ${lastErr}`);
    }

    if (!response || !response.ok) {
      throw new Error(`AI generation failed after ${MAX_RETRIES} retries: ${lastErr}`);
    }

    // Retry up to 2 more times if the AI returns an empty/malformed response
    let chapterContent = "";
    const EMPTY_RETRIES = 2;
    for (let emptyAttempt = 0; emptyAttempt <= EMPTY_RETRIES; emptyAttempt++) {
      if (emptyAttempt > 0) {
        console.log(`[GENERATE-CHAPTER] Empty response retry ${emptyAttempt}/${EMPTY_RETRIES}, re-calling AI...`);
        await new Promise(r => setTimeout(r, 3000 * emptyAttempt));
        
        const retryModel = modelChain[Math.min(currentModelIdx, modelChain.length - 1)];
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: retryModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: chapterPrompt }
            ],
          }),
        });
        if (!response.ok) {
          console.error(`[GENERATE-CHAPTER] Empty-retry AI call failed:`, response.status);
          continue;
        }
      }

      const responseText = await response!.text();
      if (!responseText || responseText.trim().length === 0) {
        console.warn(`[GENERATE-CHAPTER] AI returned empty body (attempt ${emptyAttempt + 1})`);
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("[GENERATE-CHAPTER] JSON parse failed, body length:", responseText.length, "preview:", responseText.slice(0, 300));
        continue;
      }

      chapterContent = data.choices?.[0]?.message?.content || "";
      if (chapterContent) break;
      console.warn(`[GENERATE-CHAPTER] No content in choices (attempt ${emptyAttempt + 1}):`, JSON.stringify(data).slice(0, 500));
    }

    if (!chapterContent) {
      throw new Error("AI returned empty response after multiple retries — please try again");
    }

    let finalContent = chapterContent;

    // ===========================================
    // PHASE 3.5: INTELLECTUAL STRESS-TEST PASS
    // Strengthens reasoning depth, eliminates intellectual weakness,
    // increases conceptual rigor — while preserving voice and structure.
    // Must run BEFORE compression. Skip for comics/workbooks/children.
    // ===========================================
    const STRESS_TEST_EXEMPT_TYPES = ['comic', 'workbook', 'children'];
    const shouldStressTest = !STRESS_TEST_EXEMPT_TYPES.includes(effectiveBookType) && !editIntent && finalContent.length > 1500;

    if (shouldStressTest) {
      try {
        console.log(`[GENERATE-CHAPTER] Phase 3.5: Intellectual Stress-Test starting (${finalContent.length} chars)...`);

        const stressTestResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: `You are an Intellectual Stress-Testing Editor.

Your role is NOT to rewrite stylistically.
Your role is to strengthen reasoning depth, eliminate intellectual weakness,
and increase conceptual rigor — while preserving the author's voice and structure.

You operate like a peer reviewer and senior editor combined.

TYPE-SPECIFIC STRESS-TEST RULES:
${effectiveBookType === 'professional' ? `- Ensure every recommendation has measurable outcomes (KPIs, percentages, timelines)
- Verify strategic frameworks are APPLIED to the topic, not just named
- Add competitive benchmarks or industry data points where claims are generic
- Strengthen decision matrices with weighted criteria` :
effectiveBookType === 'reference' ? `- Ensure every entry is self-contained and findable via scanning
- Add missing cross-references between related concepts
- Verify comparison tables have clear differentiation criteria
- Strengthen troubleshooting sections with specific root causes` :
effectiveBookType === 'bestseller' ? `- Ensure the opening hook creates genuine cognitive dissonance or emotional pull
- Verify named principles are sticky and memorable (would a reader quote them?)
- Add specific numbers, names, or case studies where claims are generic
- Strengthen belief disruption with evidence, not just assertion` :
effectiveBookType === 'text' ? `- Ensure examples are specific (names, dates, numbers) not generic
- Add at least 1 counterintuitive insight or unexpected finding
- Strengthen synthesis paragraphs to connect ideas across sections
- Verify named constructs are clearly defined before heavy use` :
`- Strengthen the weakest argument with mechanism-level reasoning
- Add evidence or specificity where claims are generic`}` },
              { role: "user", content: `Below is a full book chapter.
Book Type: ${effectiveBookType}
Preserve the stylistic conventions of this type.

Your task is to STRESS-TEST and STRENGTHEN it using the following framework:

1. Identify the SINGLE weakest argument, explanation, or thin section.
   - Strengthen it with deeper reasoning.
   - Add mechanism-level explanation (WHY and HOW, not just WHAT).
   - Prioritize strengthening this single weakest section.
   - Do NOT attempt to uniformly elevate all sections.

2. Add one of the following where appropriate:
   - A counter-argument or alternative interpretation
   - A boundary condition (when this idea fails or weakens)
   - A limitation or unresolved question

3. Upgrade vague conceptual language into named constructs where justified.
   (Only when real — do NOT invent fake theories.)

4. Increase conceptual density through:
   - Contrast
   - Causality
   - Specific examples with real numbers, names, and dates
   - Applied implications with measurable outcomes

5. Improve intellectual tension.
   Ideas should feel tested, not asserted.

6. Verify concept budget compliance:
   - The chapter should contain 8-15 distinct NAMED concepts
   - If fewer than 8, identify where additional named constructs can be introduced naturally
   - Named constructs = theories, laws, principles, frameworks, effects, models

STRICT RULES:
- Do NOT change the structure.
- Do NOT add fluff.
- Do NOT add headings.
- Do NOT add meta commentary.
- Do NOT make it longer by more than 15%.
- Preserve tone according to the book type: "${effectiveBookType}".
- Never end abruptly — the final paragraph must synthesize clearly.
- Preserve all [FIGURE X: ...] markers exactly as they appear.

Return ONLY the improved chapter text.

---

${finalContent.slice(0, 30000)}` }
            ],
            temperature: 0.4,
          }),
        });

        if (stressTestResp.ok) {
          const stData = await stressTestResp.json();
          const stressedContent = stData.choices?.[0]?.message?.content || "";
          // Accept if result is reasonable length (>70% of original, <115% — 15% ceiling forces precision)
          if (stressedContent.length > finalContent.length * 0.7 && stressedContent.length < finalContent.length * 1.15 && stressedContent.length > 1000) {
            console.log(`[GENERATE-CHAPTER] Stress-test pass complete: ${finalContent.length} → ${stressedContent.length} chars`);
            finalContent = stressedContent;
          } else {
            console.log(`[GENERATE-CHAPTER] Stress-test result rejected (length: ${stressedContent.length} vs original: ${finalContent.length})`);
          }
        } else {
          const errStatus = stressTestResp.status;
          await stressTestResp.text();
          console.log(`[GENERATE-CHAPTER] Stress-test pass skipped (status ${errStatus})`);
        }
      } catch (stErr) {
        console.error("[GENERATE-CHAPTER] Stress-test pass error:", stErr);
        // Non-fatal — continue with original content
      }
    }

    // ===========================================
    // PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS
    // Flash-lite pass for rhythm variation and compression
    // Adds ~15-20% cost, +6-10 quality points
    // Skip for comics, workbooks, children's books (structure-sensitive)
    // ===========================================
    const COMPRESSION_EXEMPT_TYPES = ['comic', 'workbook', 'children'];
    const shouldCompress = !COMPRESSION_EXEMPT_TYPES.includes(effectiveBookType) && !editIntent;
    
    if (shouldCompress && finalContent.length > 1500) {
      try {
        console.log(`[GENERATE-CHAPTER] Phase 4: Compression pass starting (${finalContent.length} chars)...`);
        
        const compressionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: `You are an editorial refinement engine for "${effectiveBookType}" content. Your ONLY job:
1. Remove sentences that restate what was already said (redundancy)
2. Break uniform paragraph blocks — if 3+ consecutive paragraphs have similar length, vary them
3. Replace formulaic transitions ("Furthermore," "In addition," "Moreover,") with substantive connectors or remove them
4. If 2+ consecutive sentences start identically, rewrite one
5. Preserve occasional imperfections — slight asymmetry reads as human
6. Verify [FIGURE X: ...] markers are preserved exactly as-is

TYPE-SPECIFIC REFINEMENT:
${effectiveBookType === 'professional' ? '- Ensure executive summary is crisp (under 3 sentences)\n- Verify tables have clear headers and aligned columns\n- Tighten action items to be measurable and specific' :
effectiveBookType === 'reference' ? '- Ensure entries are self-contained and scannable\n- Verify bold terms are consistently formatted\n- Tighten definitions to be precise and unambiguous' :
effectiveBookType === 'bestseller' ? '- Ensure opening hook lands in first 50 words\n- Verify named principles are memorable and quotable\n- Tighten actionable takeaways to be specific' :
'- Ensure examples are specific not generic\n- Tighten synthesis paragraphs for clarity'}

DO NOT:
- Change meaning, arguments, or examples
- Add new content or remove evidence
- Change headings or section structure
- Remove or modify [FIGURE X: ...] markers
- Over-polish — leave some natural roughness
- Smooth every transition — some abruptness is human

Return ONLY the improved chapter text. No preamble.` },
              { role: "user", content: finalContent.slice(0, 25000) }
            ],
            temperature: 0.2,
          }),
        });

        if (compressionResp.ok) {
          const compData = await compressionResp.json();
          const compressed = compData.choices?.[0]?.message?.content || "";
          // Only use if compression didn't destroy the content (>60% of original)
          if (compressed.length > finalContent.length * 0.6 && compressed.length > 1000) {
            finalContent = compressed;
            console.log(`[GENERATE-CHAPTER] Compression pass complete: ${chapterContent.length} → ${finalContent.length} chars (${Math.round((1 - finalContent.length / chapterContent.length) * 100)}% reduction)`);
          } else {
            console.log(`[GENERATE-CHAPTER] Compression result rejected (too short: ${compressed.length} vs ${finalContent.length})`);
          }
        } else {
          const errStatus = compressionResp.status;
          await compressionResp.text();
          console.log(`[GENERATE-CHAPTER] Compression pass skipped (status ${errStatus})`);
        }
      } catch (compErr) {
        console.error("[GENERATE-CHAPTER] Compression pass error:", compErr);
        // Non-fatal — continue with original content
      }
    }

    // ===========================================
    // INSTITUTIONAL AI DISCLOSURE — ALL NON-ACADEMIC PIPELINES
    // Phase 3 audit finding: bestseller/text/professional/reference pipelines
    // had no AI disclosure, which is a credibility and institutional risk.
    // ===========================================
    const NON_ACADEMIC_PIPELINE_TYPES = ['bestseller', 'text', 'professional', 'reference', 'workbook'];
    const needsGeneralDisclosure = NON_ACADEMIC_PIPELINE_TYPES.includes(effectiveBookType) && !academicMode;
    if (needsGeneralDisclosure) {
      // Only append if not already present (idempotent)
      const hasDisclosure = /AI-assisted|AI-generated|generated with AI/i.test(finalContent);
      if (!hasDisclosure) {
        finalContent += `\n\n---\n\n> **AI-Assisted Content Notice:** This chapter was generated with AI assistance (ScrollLibrary). The content is intended for educational and informational purposes. Verify any factual claims, statistics, or professional advice with authoritative sources before relying on them.\n`;
      }
    }

    // Add academic front matter and references (for ALL academic pipelines: text AND illustrated)
    const isAcademicOutput = (academicMode || needsAcademicResearch) && researchResult && researchResult.references.length > 0;
    if (isAcademicOutput) {
      const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
      
    // AUDIT FIX: Honest AI-synthesis disclosure replacing misleading imprints
    let frontMatter = `> **AI-Assisted Academic Synthesis**
> This chapter was generated with AI assistance. References were sourced via academic databases (CrossRef, Perplexity). Always verify citations independently before citing in formal academic work.

`;

      if (domainRules.requiresDisclaimer) {
        if (category.toLowerCase() === 'medicine') {
          frontMatter += `> **Medical Disclaimer:** This content is for educational purposes only and is not a substitute for professional medical advice.

`;
        } else if (category.toLowerCase() === 'law') {
          frontMatter += `> **Legal Disclaimer:** This content is for educational purposes only and does not constitute legal advice.

`;
        }
      }

      frontMatter += `---

`;
      
      // Add References section if not present
      if (!/(?:^|\n)##+\s*references/i.test(finalContent)) {
        const referenceSection = `

---

## References

${researchResult.references.map((ref, idx) => {
  switch (citationStyle) {
    case 'APA':
      return `${ref.author} (${ref.year}). *${ref.title}*.${ref.journal ? ` ${ref.journal}.` : ''}${ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : ''}`;
    case 'Harvard':
      return `${ref.author} (${ref.year}) ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ''}${ref.url ? ` Available at: ${ref.url}` : ''}`;
    case 'IEEE':
      return `[${idx + 1}] ${ref.author}, "${ref.title},"${ref.journal ? ` ${ref.journal},` : ''} ${ref.year}.${ref.doi ? ` DOI: ${ref.doi}` : ''}`;
    default:
      return `${ref.author} (${ref.year}). ${ref.title}.`;
  }
}).join('\n\n')}
`;
        finalContent = frontMatter + finalContent + referenceSection;
      } else {
        finalContent = frontMatter + finalContent;
      }

      // Validate academic output
      const academicValidation = validateAcademicRequirements(
        finalContent, researchResult.references, category, citationStyle
      );
      
      if (academicValidation.blocked && !isAdmin) {
        console.log("[GENERATE-CHAPTER] Academic validation failed post-generation");
        // Log but don't block - content was already generated
      }
    }

    // UNIVERSAL ILLUSTRATION PIPELINE — Generate inline illustrations from [FIGURE X] markers
    // Applies to ALL book types that include [FIGURE] markers in their micro-contracts
    // Upload images to storage instead of embedding base64 (prevents 5-10MB chapter content)
    const ILLUSTRATION_ENABLED_TYPES = ['illustrated', 'children', 'professional', 'reference', 'bestseller', 'academic', 'technical', 'fiction', 'comic', 'workbook'];
    if (ILLUSTRATION_ENABLED_TYPES.includes(effectiveBookType) && /\[FIGURE\s*\d+/i.test(finalContent)) {
      console.log("[GENERATE-CHAPTER] Generating inline illustrations from figure markers...");

      try {
        // Extract [FIGURE X: description] markers from generated content
        const figureRegex = /\[FIGURE\s*(\d+)\s*:\s*([\s\S]*?)\]/gi;
        const figures: { num: number; description: string; fullMatch: string }[] = [];
        
        let figMatch;
        while ((figMatch = figureRegex.exec(finalContent)) !== null) {
          figures.push({
            num: parseInt(figMatch[1]),
            description: figMatch[2].trim(),
            fullMatch: figMatch[0],
          });
        }
        
        console.log(`[GENERATE-CHAPTER] Found ${figures.length} figure markers to illustrate`);

        if (figures.length > 0) {
          // ===========================================
          // BOOK-TYPE-SPECIFIC ART DIRECTION
          // Each book type gets a tailored visual identity
          // ===========================================
          const BOOK_TYPE_ART_DIRECTION: Record<string, string> = {
            academic: `ACADEMIC TEXTBOOK — SCHOLARLY DIAGRAM QUALITY:
Art style: Clean academic diagrams, labeled charts, conceptual frameworks. Minimal color, vector style.
Composition: Clear visual hierarchy with labeled components, proper axes, annotated callouts.
Elements: Process diagrams, taxonomy trees, risk matrices, architecture diagrams, conceptual frameworks.
Color palette: Minimal — navy (#1E3A5F), slate (#475569), white backgrounds. Accent color for emphasis only.
Quality: University textbook figure standard. Every element labeled. Optimized for print and screen clarity.
Avoid: Decorative artwork, cartoon graphics, narrative scenes.`,

            technical: `TECHNICAL GUIDE — SYSTEM ARCHITECTURE QUALITY:
Art style: System architecture diagrams, flowcharts, technical process visuals with labeled modules.
Composition: Structured layout with clear flow direction, numbered steps, connection lines between components.
Elements: Software architecture boxes, pipeline diagrams, network topology, API flow diagrams, database schemas.
Color palette: Professional tech — dark blue (#1E40AF), cyan (#06B6D4), gray (#6B7280), white backgrounds.
Annotation: Every module labeled. Data flow arrows. Version indicators where relevant.
Quality: Engineering documentation standard. Clear at any zoom level.`,

            children: `CHILDREN'S PICTURE BOOK — PUBLICATION QUALITY:
Art style: Soft watercolor with digital refinement, rounded organic shapes, warm inviting palette.
Characters: Expressive faces with large eyes, gentle proportions, age-appropriate (4-8 year old protagonists).
Composition: Clear focal point, simple uncluttered backgrounds with subtle texture, rule of thirds.
Color palette: Warm pastels (peach, soft yellow, sky blue, mint) with one saturated accent color per scene.
Mood: Safe, magical, wonder-filled. Soft rim lighting, dappled sunlight, cozy atmosphere.
Quality: Caldecott Medal standard. Print-ready 300dpi aesthetic. No harsh edges or scary elements.`,

            illustrated: `ILLUSTRATED BOOK — EDITORIAL QUALITY:
Art style: Modern editorial illustration with sophisticated color theory, balanced between realism and stylization.
Composition: Dynamic layouts with intentional negative space, golden ratio framing, layered depth.
Color palette: Rich, saturated with complementary accents. Muted earth tones for grounding, vivid highlights for emphasis.
Lighting: Dramatic directional lighting with volumetric atmosphere, rim highlights, subsurface scattering.
Detail: Texture-rich surfaces. Environmental storytelling through background details.
Quality: Museum-quality illustration. Every element serves the narrative.`,

            professional: `PROFESSIONAL/BUSINESS BOOK — INFOGRAPHIC QUALITY:
Art style: Clean, modern infographic design. Flat design with subtle gradients and isometric elements.
Composition: Grid-based layout with clear visual hierarchy. Data-first design with labeled axes and legends.
Color palette: Corporate-grade — navy (#1B2A4A), teal (#0D9488), warm amber (#F59E0B), slate gray (#64748B). White backgrounds.
Elements: Strategic frameworks, 2x2 matrices, decision trees, implementation roadmaps, competitive positioning maps.
Charts/Diagrams: Publication-ready with proper axis labels, data points, trend lines, and clear legends.
Quality: McKinsey/Harvard Business Review standard. Boardroom-presentable. Zero decorative clutter.`,

            reference: `REFERENCE/HANDBOOK — TECHNICAL DIAGRAM QUALITY:
Art style: Precise technical illustration with clean vector aesthetics. Blueprint-inspired with modern refinement.
Composition: Structured grid layout, systematic labeling, numbered callouts, clear flow direction arrows.
Color palette: High-contrast — blue (#2563EB) for primary, red (#DC2626) for warnings, green (#16A34A) for success, gray (#6B7280) for secondary.
Elements: Classification trees, comparison charts, taxonomy diagrams, decision flowcharts, summary visuals.
Annotation: Every element labeled. Cross-reference numbers. Scale indicators where relevant.
Quality: Engineering manual standard. ISO-compliant visual language. Optimized for print clarity at any size.`,

            bestseller: `BESTSELLER/TRADE BOOK — CONCEPT VISUALIZATION:
Art style: Bold, memorable concept art that makes abstract ideas tangible. Modern illustration with metaphorical depth.
Composition: Strong central metaphor with supporting visual elements. Cinematic framing with dramatic perspective.
Color palette: High-impact — deep navy backgrounds with gold/amber highlights, or clean white with bold accent colors. Maximum 3 colors per image.
Elements: Visual metaphors (icebergs for hidden depth, compasses for direction, bridges for connection), transformation arcs, before/after contrasts.
Lighting: Dramatic chiaroscuro for emphasis. Spotlight effects on key concepts. Atmospheric depth with subtle glow.
Quality: TED Talk slide quality. Instantly shareable. The image alone should communicate the core idea.`,

            comic: `COMIC BOOK — PUBLICATION QUALITY:
Art style: Dynamic comic art with bold ink lines, dramatic foreshortening, speed lines for action.
Composition: Panel-ready framing with gutters in mind. Dutch angles for tension, worm-eye for power, bird-eye for scope.
Color palette: Saturated comic palette with cel-shading, halftone dots for shadows, rim lighting on characters.
Characters: Expressive with exaggerated emotion, dynamic poses, consistent character design.
Quality: Marvel/DC publication standard. Print-ready with proper bleed areas.`,

            fiction: `FICTION/NOVEL — CINEMATIC SCENE ILLUSTRATION:
Art style: Cinematic scene illustrations with rich atmosphere and mood. Character environments with emotional depth.
Composition: Wide establishing shots for settings, medium shots for character moments, dramatic lighting for tension.
Color palette: Mood-driven — warm golden tones for comfort, cool blues for mystery, deep shadows for tension.
Elements: Setting visuals, character silhouettes, atmospheric scenes, symbolic imagery.
Lighting: Cinematic with volumetric atmosphere, god rays, dusk/dawn palettes, firelight warmth.
Quality: Novel cover art standard. Evocative and atmospheric.`,

            workbook: `WORKBOOK/EDUCATIONAL — INSTRUCTIONAL DIAGRAM:
Art style: Clean instructional design with friendly, approachable aesthetics. Step-by-step visual clarity.
Composition: Sequential layout with numbered steps, clear start/end points, progress indicators.
Color palette: Encouraging — soft blue (#3B82F6), warm orange (#F97316), green (#22C55E), light backgrounds.
Elements: Annotated examples, fill-in areas indicated, comparison side-by-sides, progress trackers.
Quality: Textbook-grade. Optimized for both screen and print. Accessible to diverse learning styles.`,
          };

          const styleHint = BOOK_TYPE_ART_DIRECTION[effectiveBookType] || BOOK_TYPE_ART_DIRECTION.illustrated;

          // Create a service-role Supabase client for storage uploads
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const storageClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // Cap at 2 figures to stay within edge function timeout (150s)
          const figuresToGenerate = figures.slice(0, 2);
          
          // Generate ALL images in parallel to save time
          const imageResults = await Promise.allSettled(
            figuresToGenerate.map(async (fig) => {
              const imagePrompt = `${fig.description}.\n\n${styleHint}\n\nSubject: ${category.replace(/_/g, ' ')}. IMPORTANT: Do NOT render any text, words, or letters in the image.`;
              console.log(`[GENERATE-CHAPTER] Generating Figure ${fig.num}: ${fig.description.slice(0, 80)}...`);
              
              const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-pro-image-preview",
                  messages: [{ role: "user", content: imagePrompt }],
                  modalities: ["image", "text"],
                }),
              });

              if (!imageResponse.ok) {
                const errStatus = imageResponse.status;
                await imageResponse.text();
                throw new Error(`Image generation failed: status ${errStatus}`);
              }

              const imageData = await imageResponse.json();
              const base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              return { fig, base64Url };
            })
          );

          // Process results and upload to storage
          for (const result of imageResults) {
            if (result.status === 'fulfilled') {
              const { fig, base64Url } = result.value;
              if (base64Url && base64Url.startsWith('data:image/')) {
                try {
                  const base64Data = base64Url.split(',')[1];
                  const mimeMatch = base64Url.match(/data:(image\/\w+);/);
                  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                  const ext = mimeType.split('/')[1] || 'png';
                  
                  const binaryStr = atob(base64Data);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let b = 0; b < binaryStr.length; b++) {
                    bytes[b] = binaryStr.charCodeAt(b);
                  }
                  
                  const storagePath = `${user.id}/${chapter?.book_id || "unknown"}/ch${chapterNumber}-fig${fig.num}.${ext}`;
                  
                  const { error: uploadError } = await storageClient.storage
                    .from('book-images')
                    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
                  
                  if (!uploadError) {
                    const { data: publicUrl } = storageClient.storage
                      .from('book-images')
                      .getPublicUrl(storagePath);
                    
                    const captionText = fig.description.split('.')[0] || `Figure ${fig.num}`;
                    const imageMarkdown = `\n\n![${captionText}](${publicUrl.publicUrl})\n*Figure ${fig.num}: ${captionText}*\n\n`;
                    finalContent = finalContent.replace(fig.fullMatch, imageMarkdown);
                    console.log(`[GENERATE-CHAPTER] Figure ${fig.num} uploaded to storage and inserted inline`);
                  } else {
                    console.error(`[GENERATE-CHAPTER] Storage upload failed for Figure ${fig.num}:`, uploadError);
                    finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
                  }
                } catch (uploadErr) {
                  console.error(`[GENERATE-CHAPTER] Upload error for Figure ${fig.num}:`, uploadErr);
                  finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
                }
              } else {
                console.log(`[GENERATE-CHAPTER] Figure ${fig.num}: No image returned, using placeholder`);
                finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
              }
            } else {
              // Find which figure failed from the error
              console.error(`[GENERATE-CHAPTER] Figure generation failed:`, result.reason);
            }
          }

          // Replace any remaining unfulfilled figure markers (figures 3+ that were capped)
          for (const fig of figures.slice(2)) {
            finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
          }
        } else {
          console.log("[GENERATE-CHAPTER] No [FIGURE] markers found in illustrated content — skipping illustration generation");
        }
      } catch (illustrationError) {
        console.error("[GENERATE-CHAPTER] Illustration pipeline failed:", illustrationError);
      }
    }

    // TEXT-ONLY PIPELINE SAFETY: Strip any [FIGURE] markers that the AI may have
    // emitted despite the micro-contract forbidding them. This prevents text books
    // from containing raw placeholder markers.
    if (effectiveBookType === 'text') {
      finalContent = finalContent.replace(/\[FIGURE\s*\d+\s*:[^\]]*\]/gi, '');
      console.log("[GENERATE-CHAPTER] Text pipeline: stripped any residual [FIGURE] markers");
    }

    // Preserve markdown formatting — MarkdownRenderer handles rendering
    // Only clean up excessive whitespace
    finalContent = finalContent.replace(/\n{4,}/g, '\n\n\n').trim();
    
    // ===========================================
    // CONTRACT 6 — HARD RUNTIME GATE (POST-GENERATION)
    // RULE 6.2: Content MUST be blocked if it violates Contract 6
    // RULE 6.4: Generation STOPS on first critical violation
    // ===========================================
    const { validateContract6Content, isValidBookType } = await import("../_shared/contract6-governance.ts");
    
    const validatedBookType = isValidBookType(effectiveBookType) ? effectiveBookType : 'text';
    const contract6Validation = validateContract6Content(finalContent, validatedBookType, chapterTitle);
    
    if (!contract6Validation.valid && contract6Validation.shouldRegenerate) {
      const criticalViolation = contract6Validation.violations[0];
      console.log(`[CONTRACT 6] VIOLATION DETECTED: ${criticalViolation.code} - ${criticalViolation.message}`);
      
      // For non-admin users, block the content and return error
      if (!isAdmin) {
        console.log(`[CONTRACT 6] BLOCKING content for book type: ${effectiveBookType}`);
        return new Response(JSON.stringify({
          error: `CONTRACT 6 VIOLATION: ${criticalViolation.message}`,
          code: criticalViolation.code,
          bookType: effectiveBookType,
          shouldRegenerate: true,
          userMessage: contract6Validation.userMessage,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        console.log(`[CONTRACT 6] Admin override - saving content despite violations`);
      }
    } else if (!contract6Validation.valid) {
      // Log non-critical violations but allow content
      console.log(`[CONTRACT 6] Non-critical violations detected: ${contract6Validation.violations.length}`);
    }
    
    // ===========================================
    // PEDAGOGICAL SCHEMA VALIDATION (PBG-1.0)
    // Validate 7 mandatory sections for educational books
    // ===========================================
    const pedagogicalValidation = validatePedagogicalSchema(finalContent, effectiveBookType);
    console.log(`[PEDAGOGICAL] Validation result: ${pedagogicalValidation.sectionsFound}/${pedagogicalValidation.sectionsRequired} sections, score: ${pedagogicalValidation.score}%`);
    
    if (!pedagogicalValidation.valid && pedagogicalValidation.blocked) {
      console.log(`[PEDAGOGICAL] BLOCKING content: ${pedagogicalValidation.missingSections.join(', ')}`);
      
      // For non-admin users, log warning but allow (soft enforcement initially)
      if (!isAdmin && pedagogicalValidation.score < 50) {
        // Only hard-block if less than 50% compliance
        return new Response(JSON.stringify({
          error: `PEDAGOGICAL SCHEMA VIOLATION: Chapter requires 7 mandatory sections. Found ${pedagogicalValidation.sectionsFound}. Missing: ${pedagogicalValidation.missingSections.join(', ')}`,
          code: 'PEDAGOGICAL_SCHEMA_VIOLATION',
          sectionsFound: pedagogicalValidation.sectionsFound,
          sectionsRequired: pedagogicalValidation.sectionsRequired,
          missingSections: pedagogicalValidation.missingSections,
          score: pedagogicalValidation.score,
          shouldRegenerate: true,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    
    const actualWordCount = finalContent.split(/\s+/).filter((w: string) => w.length > 0).length;

    const updateData: any = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
      academic_mode: academicMode,
      citation_style: academicMode ? citationStyle : null,
    };

    if (academicMode && researchResult) {
      updateData.chapter_references = researchResult.references;
      updateData.research_metadata = researchResult.metadata;
    }

    const { error: updateError } = await supabase
      .from("chapters")
      .update(updateData)
      .eq("id", chapterId);

    if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber} saved (${actualWordCount} words)`);

    return new Response(JSON.stringify({
      success: true,
      wordCount: actualWordCount,
      provider: 'Lovable AI',
      academicMode,
      sourceCount: researchResult?.references.length || 0,
      contract6: {
        valid: contract6Validation.valid,
        violations: contract6Validation.violations.length,
        bookType: effectiveBookType,
      },
      pedagogicalSchema: {
        valid: pedagogicalValidation.valid,
        sectionsFound: pedagogicalValidation.sectionsFound,
        sectionsRequired: pedagogicalValidation.sectionsRequired,
        score: pedagogicalValidation.score,
        missingSections: pedagogicalValidation.missingSections,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    
  } catch (error) {
    console.error("[GENERATE-CHAPTER] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      code: 'GENERATION_ERROR',
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
