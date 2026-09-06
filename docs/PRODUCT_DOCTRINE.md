# ScrollLibrary Product Doctrine

## Product category

ScrollLibrary is not primarily an AI book generator. It is an **AI publishing operating system**.

The core promise is:

> **ChatGPT helps you write. ScrollLibrary gets the book all the way to publication.**

General-purpose language models are valuable reasoning and writing engines. ScrollLibrary must remain valuable even when users already have excellent access to OpenAI, Anthropic, Google, or future models.

The product therefore owns the workflow, state, evidence, assets, rules, quality gates, production process, and publishing outcome around those models.

## The moat test

Every meaningful feature should answer:

> **Why can’t the user simply do this in ChatGPT?**

If the answer is “they can with one or two ordinary prompts,” the feature is not a durable moat by itself.

If reproducing the result would require many prompts, multiple tools, specialist publishing knowledge, manual verification, state tracking, production QA, and repeated reconciliation, it belongs at the center of ScrollLibrary.

## Target user outcome

A user should be able to begin with an instruction such as:

> Create a serious 250-page book explaining personal finance to young African professionals.

ScrollLibrary should progressively own the full lifecycle:

Idea
→ Research dossier
→ Book architecture
→ Full manuscript
→ Source ledger
→ Fact verification
→ Chief Editor review
→ Targeted automatic rewriting
→ Cross-chapter consistency
→ Citation audit
→ Images and figures
→ Rights/copyright checks
→ Cover
→ Typesetting
→ PDF/ePub
→ Render inspection
→ Metadata/ISBN preparation
→ Publishing package
→ Distribution

The intended result is not merely “AI returned text.” It is a publication candidate with an auditable readiness state, for example:

- Editorial: PASS
- Evidence: PASS
- References: PASS
- Structural consistency: PASS
- Production: PASS
- Author decisions required: N

A numerical readiness score may summarize evidence, but must never replace explicit blockers or gate results.

## Four intelligence layers

### 1. LLM intelligence

Writing, reasoning, rewriting, extraction, summarization, classification, and other model capabilities.

Models are interchangeable engines. Provider/model selection must not define the product category or become a client-controlled integrity decision.

### 2. Publishing intelligence

Research, evidence grounding, editorial review, consistency analysis, citation/reference verification, figures, rights, typesetting, rendered-output QA, metadata, and publication packaging.

### 3. Workflow intelligence

Persistent state for every book and every decision. The system should remember what happened without depending on a chat transcript.

### 4. Market intelligence

With appropriate consent and privacy controls, learn from aggregate publishing/reading outcomes such as completion, comprehension, reader drop-off, ratings, retention, sales/conversion, chapter density, illustration usefulness, and title performance.

Private author work must not be indiscriminately used for model training or analytics.

## Persistent book intelligence

A book is a structured object, not a blob of generated prose.

The canonical product model should progressively connect:

- Book
- Chapters and sections
- Claims
- Sources
- Citations and references
- Figures and tables
- Images/assets
- Terminology and definitions
- Characters/entities where relevant
- Versions
- Editorial findings and decisions
- Evidence-verification results
- Rights/licensing state
- Production/render results
- Publication formats
- Metadata/distribution state
- Reader analytics where permitted

This graph should enable dependency-aware behavior. Examples:

- If Chapter 12 contradicts Chapter 3, identify the conflict.
- If a statistic becomes outdated, identify every dependent claim and paragraph.
- If a source is retracted, identify affected claims, citations, and chapters.
- If an author changes a definition, identify every occurrence requiring review.
- If a figure or table changes, identify references and captions that depend on it.

## Publication readiness is a trust state

“Ready” is not a cosmetic client-side flag.

Publication readiness must be **fail-closed and server-attested** from persisted, independently checkable gate evidence.

A browser/user must not be able to manufacture readiness by editing:

- generation job status,
- publication-quality metadata,
- editorial scores,
- QA status,
- evidence verdicts,
- certification records, or
- production/render results.

Where a user may legitimately edit workflow state, trusted certification state must remain separate and service-authoritative.

A generated book must not be publishable merely because all chapters contain text. Completion means the required publication-quality pipeline passed.

## Required quality model

The long-term certification model is:

**Editorial PASS**
+
**Evidence PASS when required**
+
**References/Citations PASS when required**
+
**Structural/Consistency PASS**
+
**Production/Rendered PASS**
+
**Rights/Asset PASS where applicable**
=
**Publication-ready candidate**

If a required gate is unavailable, failed, stale, or unverifiable, readiness is false.

## Truth and factual accuracy

ScrollLibrary must not promise “100% factually correct.” No open-domain AI or human editorial workflow can defensibly guarantee absolute truth.

The stronger product promise is:

> **No material factual claim should be accepted as verified without traceable evidence or an explicit uncertainty label. A manuscript is not marked publication-ready until the required editorial, evidence, structural, and production gates pass.**

The system should distinguish at least:

- verified/supportable claim,
- disputed claim,
- inference,
- opinion/interpretation,
- uncertain claim,
- unsupported claim,
- stale/outdated evidence.

## Research and evidence rules

For evidence-requiring books:

1. Research must produce traceable source records.
2. Claims and citations should be linked to those records wherever practical.
3. Verification results must be persisted rather than existing only in transient UI memory.
4. Editorial rewrites that materially change claims must invalidate or re-run dependent evidence checks.
5. A retracted/invalidated source must invalidate dependent verification state.
6. Missing evidence must block certification or force explicit uncertainty/narrowing of the claim.

## Editorial rules

The Chief Editor is an independent gate, not a decorative rewrite button.

It should:

- audit structure, pedagogy, argument quality, repetition, coherence, evidence use, and style;
- produce specific findings and blockers;
- rewrite only what evidence/findings justify;
- preserve previous versions;
- re-audit after repairs;
- persist provenance for the audit and repair;
- never allow a client-selected model or score to become certification authority.

## Production rules

Textual correctness is insufficient. Publication certification ultimately requires rendered-output inspection.

Production QA should cover, at minimum:

- blank or duplicate pages,
- clipped/overflowing text,
- broken tables,
- figure overflow,
- low-resolution assets,
- missing/incorrect captions,
- orphan headings,
- widow/orphan typography,
- page-break problems,
- margins,
- headers/footers,
- table-of-contents page numbers,
- bibliography formatting,
- missing images/assets,
- PDF/ePub generation failures.

Until this gate exists and is verified, product copy must not imply that rendered-output production has passed automatically.

## Model/provider strategy

ScrollLibrary should be able to use multiple intelligence providers over time.

Provider choice may optimize quality, latency, capability, geography, or cost, but the moat is the stateful publishing system around the model:

- research ledger,
- editorial constitution,
- verification engine,
- book dependency graph,
- production pipeline,
- rights/assets,
- publication state,
- reading/market feedback loop.

The user may eventually choose an engine; they should not have to reconstruct the publishing process around it.

## Import strategy

ChatGPT, Claude, Gemini, Word, Google Docs, and other authoring tools should be treated as potential inputs rather than enemies.

A user should be able to import an existing manuscript and ask ScrollLibrary to take responsibility for the publication workflow from that point onward.

The platform’s value is therefore not dependent on owning first-draft generation.

## Market-intelligence rules

Market intelligence is a later layer, not a shortcut around publishing quality.

When implemented, it should use consented/appropriately aggregated data and clearly separate:

- private manuscript content,
- operational telemetry,
- anonymized/aggregate performance analytics,
- public published content,
- model-training permissions.

It should generate actionable publishing guidance rather than vanity analytics. Example:

> Readers in this category often drop off around Chapter 5. This Chapter 5 has unusually high conceptual density and no worked example; consider splitting Section 5.3 and adding an applied example.

## Product language

Preferred positioning:

- **ScrollLibrary — the AI publishing operating system.**
- **From idea to verified publication.**
- **ChatGPT helps you write. ScrollLibrary gets the book all the way to publication.**

Avoid making “AI book generator” the primary category claim.

Do not advertise a gate as complete until the implementation and environment evidence show it is actually enforced.

## Engineering decision rule

When evaluating new work, prioritize in this order:

1. Trustworthy publication state and server-authoritative gates.
2. Persistent book intelligence and dependency tracking.
3. Autonomous research/editorial/evidence repair loops.
4. Production/rendered-output correctness.
5. Publishing/package/distribution workflow.
6. Import/interoperability across external authoring/model tools.
7. Reader and market intelligence with privacy controls.
8. Convenience features that merely replicate general-purpose chat behavior.

A feature that improves prose but does not improve verified state, workflow ownership, production quality, or publishing outcomes is useful—but it is not the moat.

## Current implementation honesty

As of the September 2026 controlled production-readiness work, ScrollLibrary has significant pieces of the editorial/evidence/QA workflow, but it is **not yet fully publication-grade**.

In particular, rendered-output certification, complete end-to-end production evidence, hardened server attestation of all readiness signals, safe Live schema convergence, and comprehensive E2E coverage remain required before the full product promise can be considered proven.
