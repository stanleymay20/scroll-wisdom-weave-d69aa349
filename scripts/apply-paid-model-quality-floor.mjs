import { readFileSync, writeFileSync } from "node:fs";

const target = "supabase/functions/generate-chapter/index.ts";
let source = readFileSync(target, "utf8");

function occurrences(haystack, needle) {
  if (!needle) throw new Error("Empty needle");
  return haystack.split(needle).length - 1;
}

function replaceExact(label, before, after) {
  const count = occurrences(source, before);
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  source = source.replace(before, after);
}

function replaceSection(label, startMarker, endMarker, replacement) {
  const startCount = occurrences(source, startMarker);
  const endCount = occurrences(source, endMarker);
  if (startCount !== 1) throw new Error(`${label}: start marker count=${startCount}`);
  if (endCount !== 1) throw new Error(`${label}: end marker count=${endCount}`);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${label}: end marker not found after start`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

function replaceAfter(label, marker, before, after) {
  const markerCount = occurrences(source, marker);
  if (markerCount !== 1) throw new Error(`${label}: marker count=${markerCount}`);
  const markerIndex = source.indexOf(marker);
  const beforeIndex = source.indexOf(before, markerIndex + marker.length);
  if (beforeIndex < 0) throw new Error(`${label}: replacement anchor not found after marker`);
  source = source.slice(0, beforeIndex) + after + source.slice(beforeIndex + before.length);
}

replaceExact(
  "shared model-floor import",
  'import { BILLING_PLAN_LIMITS, billingPlanFor } from "../_shared/billing-plans.ts";\n',
  'import { BILLING_PLAN_LIMITS, billingPlanFor } from "../_shared/billing-plans.ts";\n' +
  'import {\n' +
  '  buildMaterialModelProvenance,\n' +
  '  floorSafeModelChain,\n' +
  '  mergeGenerationOutline,\n' +
  '  routeFloorModel,\n' +
  '  type GenerationRoute,\n' +
  '  type MaterialModelStageRecord,\n' +
  '} from "../_shared/generation-model-floor.ts";\n',
);

replaceExact(
  "remove duplicated local model routing",
  `const getModelForPlan = (plan: string): string => {
  switch (plan) {
    case "prophet_tier":
    case "premium":
    case "student":
      return "google/gemini-2.5-flash";
    case "free":
    default:
      return "google/gemini-2.5-flash-lite";
  }
};

// Publication-quality (Chief Editor) rewrite routing — server-owned, derived from the
// authenticated user's active subscription tier. Deliberately has a higher floor than
// normal generation so final polishing is never performed by Flash Lite.
const getRewriteModelForPlan = (plan: string): string => {
  switch (plan) {
    case "prophet_tier":
    case "premium":
      return "google/gemini-2.5-pro";
    case "student":
    case "free":
    default:
      return "google/gemini-2.5-flash";
  }
};

`,
  "",
);

replaceSection(
  "server-owned route floor selection",
  "    // Routine drafting uses the cost-efficient model. Chief Editor rewrites keep\n",
  "    // ===========================================\n    // INPUT NORMALIZATION — Defensive layer for multi-path orchestration\n",
  `    // Routine drafting and Chief Editor rewrites use a server-owned material-model floor.
    // Retries and any manuscript-mutating refinement pass must stay at or above this floor.
    const generationRoute: GenerationRoute = isChiefEditorRewrite ? "chief_editor" : "routine";
    const baseModel = routeFloorModel(userPlan, "routine");
    const generationModel = routeFloorModel(userPlan, generationRoute);
    const materialModelStages: MaterialModelStageRecord[] = [];
    const maxWordCount = BILLING_PLAN_LIMITS[userPlan].maxWordsPerChapter;
    console.log(\`[GENERATE-CHAPTER] Plan: \${userPlan} | Route: \${generationRoute} | Model floor: \${generationModel}\${isChiefEditorRewrite && generationModel !== baseModel ? \` (base \${baseModel})\` : ''} | Admin: \${isAdmin}\`);

`,
);

replaceExact(
  "load existing generation outline",
  "    let existingContent: string | null = null;\n    \n    if (chapterId) {",
  "    let existingContent: string | null = null;\n    let existingGenerationOutline: unknown = null;\n    \n    if (chapterId) {",
);
replaceExact(
  "select existing generation outline",
  '.select("content, is_generated")',
  '.select("content, is_generated, generation_outline")',
);
replaceExact(
  "capture existing generation outline",
  "      existingContent = existingChapter?.content ?? null;\n      const wasGenerated = existingChapter?.is_generated || false;",
  "      existingContent = existingChapter?.content ?? null;\n      existingGenerationOutline = existingChapter?.generation_outline ?? null;\n      const wasGenerated = existingChapter?.is_generated || false;",
);

replaceSection(
  "floor-safe transient retry loop",
  "    // Retry logic for transient gateway errors (502, 503, 504) and rate limits (429)\n",
  "    // Retry up to 2 more times if the AI returns an empty/malformed response\n",
  `    // Retry transient provider failures without crossing the server-owned route floor.
    // No lower-quality fallback is qualified for manuscript generation.
    const modelChain = floorSafeModelChain(userPlan, generationRoute);
    const MAX_RETRIES = 4;
    let response: Response | null = null;
    let lastErr = "";
    let lastStatus = 0;
    let successfulGenerationModel: string | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const activeModel = modelChain[0];

      if (attempt > 0) {
        const delay = lastStatus === 429 ? 5000 * attempt : 2000 * attempt;
        console.log(\`[GENERATE-CHAPTER] Retry attempt \${attempt + 1} on route floor \${activeModel} after \${delay}ms...\`);
        await new Promise(r => setTimeout(r, delay));
      }

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${LOVABLE_API_KEY}\`,
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
      if (response.ok) {
        successfulGenerationModel = activeModel;
        break;
      }

      lastStatus = response.status;
      const errText = await response.text();
      lastErr = errText.slice(0, 300);
      console.error(\`[GENERATE-CHAPTER] AI gateway error (attempt \${attempt + 1}, model \${activeModel}):\`, response.status, lastErr);

      if (response.status === 402) {
        await refundTextReservation();
        return new Response(
          JSON.stringify({ error: "Payment required, please add AI credits to continue.", code: "ai_credits_exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.status === 429) {
        console.log(\`[GENERATE-CHAPTER] Rate limited (429); retrying the same qualified route floor \${activeModel}\`);
        continue;
      }

      if ([502, 503, 504].includes(response.status)) {
        continue;
      }

      throw new Error(\`AI generation failed (\${response.status}): \${lastErr}\`);
    }

    if (!response || !response.ok) {
      await refundTextReservation();
      const terminalStatus = lastStatus === 429 ? 429 : 503;
      return new Response(JSON.stringify({
        error: terminalStatus === 429
          ? "AI provider is temporarily rate limited. Please retry shortly."
          : "AI provider is temporarily unavailable. Please retry shortly.",
        code: terminalStatus === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_UNAVAILABLE",
        retryable: true,
        modelFloor: generationModel,
      }), {
        status: terminalStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

`,
);

replaceExact(
  "empty-response retry stays on floor",
  "        const retryModel = modelChain[Math.min(currentModelIdx, modelChain.length - 1)];",
  "        const retryModel = modelChain[0];",
);
replaceExact(
  "empty-response retry records successful model",
  `        if (!response.ok) {
          console.error(\`[GENERATE-CHAPTER] Empty-retry AI call failed:\`, response.status);
          continue;
        }`,
  `        if (!response.ok) {
          lastStatus = response.status;
          console.error(\`[GENERATE-CHAPTER] Empty-retry AI call failed:\`, response.status);
          continue;
        }
        successfulGenerationModel = retryModel;`,
);
replaceExact(
  "empty-response failure is explicit",
  `    if (!chapterContent) {
      throw new Error("AI returned empty response after multiple retries — please try again");
    }`,
  `    if (!chapterContent) {
      await refundTextReservation();
      return new Response(JSON.stringify({
        error: "AI returned no usable chapter content after multiple attempts. Please retry shortly.",
        code: "AI_EMPTY_RESPONSE",
        retryable: true,
        modelFloor: generationModel,
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    materialModelStages.push({ stage: "generation", model: successfulGenerationModel ?? generationModel });`,
);

replaceAfter(
  "stress-test uses route floor",
  "    // PHASE 3.5: INTELLECTUAL STRESS-TEST PASS\n",
  '            model: "google/gemini-2.5-flash-lite",',
  "            model: generationModel,",
);
replaceAfter(
  "accepted stress-test records provenance",
  "    // PHASE 3.5: INTELLECTUAL STRESS-TEST PASS\n",
  "            finalContent = stressedContent;",
  "            finalContent = stressedContent;\n            materialModelStages.push({ stage: \"stress_test\", model: generationModel });",
);
replaceExact(
  "compression comment reflects floor",
  "    // Flash-lite pass for rhythm variation and compression\n",
  "    // Route-floor pass for rhythm variation and compression\n",
);
replaceAfter(
  "compression uses route floor",
  "    // PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS\n",
  '            model: "google/gemini-2.5-flash-lite",',
  "            model: generationModel,",
);
replaceAfter(
  "accepted compression records provenance",
  "    // PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS\n",
  "            finalContent = compressed;",
  "            finalContent = compressed;\n            materialModelStages.push({ stage: \"compression\", model: generationModel });",
);

replaceExact(
  "comic provenance before fenced save",
  `      comicMetadata.generatedAt = new Date().toISOString();

      await saveGeneratedChapter({`,
  `      comicMetadata.generatedAt = new Date().toISOString();
      materialModelStages.push({ stage: "generation", model: generationModel });
      const materialModelProvenance = buildMaterialModelProvenance({
        plan: userPlan,
        route: generationRoute,
        routeFloorModel: generationModel,
        acceptedStages: materialModelStages,
      });

      await saveGeneratedChapter({`,
);
replaceAfter(
  "comic provenance persisted",
  "      comicMetadata.generatedAt = new Date().toISOString();\n",
  "          comic_metadata: comicMetadata,\n",
  "          comic_metadata: comicMetadata,\n          generation_outline: mergeGenerationOutline(existingGenerationOutline, materialModelProvenance),\n",
);
replaceAfter(
  "comic provenance returned",
  "        provider: 'Lovable AI (Comic)',\n",
  "        panelCount: panels.length,\n",
  "        materialModelProvenance,\n        panelCount: panels.length,\n",
);

replaceExact(
  "workbook provenance before fenced save",
  `      const finalContent = frontMatter + workbookContent;
      const actualWordCount = finalContent.split(/\\s+/).filter((w: string) => w.length > 0).length;

      await saveGeneratedChapter({`,
  `      const finalContent = frontMatter + workbookContent;
      const actualWordCount = finalContent.split(/\\s+/).filter((w: string) => w.length > 0).length;
      materialModelStages.push({ stage: "generation", model: generationModel });
      const materialModelProvenance = buildMaterialModelProvenance({
        plan: userPlan,
        route: generationRoute,
        routeFloorModel: generationModel,
        acceptedStages: materialModelStages,
      });

      await saveGeneratedChapter({`,
);
replaceAfter(
  "workbook provenance persisted",
  "      const finalContent = frontMatter + workbookContent;\n",
  "          updated_at: new Date().toISOString(),\n        });",
  "          updated_at: new Date().toISOString(),\n          generation_outline: mergeGenerationOutline(existingGenerationOutline, materialModelProvenance),\n        });",
);
replaceAfter(
  "workbook provenance returned",
  "        provider: 'Lovable AI (Workbook)',\n",
  "        validation: {\n",
  "        materialModelProvenance,\n        validation: {\n",
);

replaceExact(
  "standard provenance before fenced save",
  `    const updateData: any = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
      academic_mode: academicMode,
      citation_style: academicMode ? citationStyle : null,
    };`,
  `    const materialModelProvenance = buildMaterialModelProvenance({
      plan: userPlan,
      route: generationRoute,
      routeFloorModel: generationModel,
      acceptedStages: materialModelStages,
    });
    const updateData: any = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
      academic_mode: academicMode,
      citation_style: academicMode ? citationStyle : null,
      generation_outline: mergeGenerationOutline(existingGenerationOutline, materialModelProvenance),
    };`,
);
replaceExact(
  "standard provenance returned",
  "      provider: 'Lovable AI',\n      academicMode,",
  "      provider: 'Lovable AI',\n      materialModelProvenance,\n      academicMode,",
);

const forbidden = [
  "currentModelIdx++",
  "modelChain[Math.min(currentModelIdx",
  "const getModelForPlan =",
  "const getRewriteModelForPlan =",
];
for (const needle of forbidden) {
  if (source.includes(needle)) throw new Error(`Forbidden post-patch residue: ${needle}`);
}

const stressStart = source.indexOf("    // PHASE 3.5: INTELLECTUAL STRESS-TEST PASS");
const compressionStart = source.indexOf("    // PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS");
const postGenerationStart = source.indexOf("    // POST-GENERATION CODE QUALITY FIXER");
if (stressStart < 0 || compressionStart < 0 || postGenerationStart < 0) throw new Error("Refinement markers missing after patch");
if (source.slice(stressStart, compressionStart).includes('model: "google/gemini-2.5-flash-lite"')) {
  throw new Error("Stress-test still contains Flash Lite hard-code");
}
if (source.slice(compressionStart, postGenerationStart).includes('model: "google/gemini-2.5-flash-lite"')) {
  throw new Error("Compression still contains Flash Lite hard-code");
}
if (occurrences(source, "generation_outline: mergeGenerationOutline(existingGenerationOutline, materialModelProvenance)") < 3) {
  throw new Error("Expected provenance persistence in comic, workbook, and standard paths");
}
if (occurrences(source, "materialModelProvenance,") < 3) {
  throw new Error("Expected provenance in comic, workbook, and standard responses");
}

writeFileSync(target, source);
console.log("Paid generation model-floor handler patch applied deterministically.");
