import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('content/university/foundation-core-v1');
const programme = JSON.parse(await readFile(path.join(root, 'programme.json'), 'utf8'));
const workload = JSON.parse(await readFile(path.join(root, 'workload-and-practice.json'), 'utf8'));
const failures = [];
const INTERNAL_CREDIT_SYSTEM = 'ScrollUniversity workload units (ECTS workload benchmark only; not ECTS credit)';

const fail = (message) => failures.push(message);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

if (!programme?.programme?.code) fail('programme code is required');
if (!Array.isArray(programme?.courses) || programme.courses.length === 0) fail('programme must contain courses');
if (!workload?.courses || typeof workload.courses !== 'object') fail('workload-and-practice course map is required');
if (programme?.programme?.credit_award_status !== 'workload_planning_only_not_awarded_or_transferable_academic_credit') {
  fail('programme must explicitly state that workload units are not awarded or transferable academic credit');
}
if (!nonEmpty(programme?.programme?.credit_disclaimer) || !programme.programme.credit_disclaimer.includes('does not award ECTS')) {
  fail('programme must carry an explicit no-ECTS-award disclaimer');
}
if (!nonEmpty(programme?.programme?.credit_system) || !programme.programme.credit_system.toLowerCase().includes('workload')) {
  fail('programme credit_system must identify internal workload planning rather than awarded academic credit');
}
if (workload?.credit_system !== INTERNAL_CREDIT_SYSTEM) {
  fail(`workload-and-practice credit_system must be exactly "${INTERNAL_CREDIT_SYSTEM}"`);
}

let programmeWorkloadUnits = 0;
let programmeHours = 0;

for (const descriptor of programme.courses || []) {
  programmeWorkloadUnits += Number(descriptor.credits || 0);
  programmeHours += Number(descriptor.planned_hours || 0);
  if (!descriptor.pack) {
    fail(`${descriptor.code || 'unknown course'}: pack path is required`);
    continue;
  }

  let pack;
  try {
    pack = JSON.parse(await readFile(path.join(root, descriptor.pack), 'utf8'));
  } catch (error) {
    fail(`${descriptor.code}: course pack missing or invalid JSON (${error.message})`);
    continue;
  }

  const course = pack.course || {};
  const prefix = course.code || descriptor.code || descriptor.pack;
  const workloadUnits = Number(course.credits || 0);
  const hours = Number(course.planned_hours || 0);

  if (course.code !== descriptor.code) fail(`${prefix}: descriptor/course code mismatch`);
  if (course.credit_system !== INTERNAL_CREDIT_SYSTEM) {
    fail(`${prefix}: credit_system must be exactly "${INTERNAL_CREDIT_SYSTEM}"`);
  }
  if (workloadUnits <= 0) fail(`${prefix}: internal workload units must be > 0`);
  if (hours < workloadUnits * 25 || hours > workloadUnits * 30) {
    fail(`${prefix}: planned hours ${hours} must be between ${workloadUnits * 25} and ${workloadUnits * 30} for ${workloadUnits} workload units`);
  }

  const workloadPlan = workload.courses?.[prefix];
  if (!workloadPlan) {
    fail(`${prefix}: explicit workload/practice plan is required`);
  } else {
    const totalHours = Number(workloadPlan.total_hours || 0);
    const breakdown = workloadPlan.breakdown || {};
    const breakdownHours = Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0);
    if (totalHours !== hours) fail(`${prefix}: workload total ${totalHours} must equal planned hours ${hours}`);
    if (breakdownHours !== hours) fail(`${prefix}: workload breakdown ${breakdownHours} must equal planned hours ${hours}`);
    if (Object.keys(breakdown).length < 5) fail(`${prefix}: workload must show at least 5 distinct learning activity categories`);
    if (Object.values(breakdown).some((value) => Number(value) <= 0)) fail(`${prefix}: every workload category must have positive hours`);
    if (!Array.isArray(workloadPlan.practice_bank) || workloadPlan.practice_bank.length < 6) {
      fail(`${prefix}: at least 6 substantial independent/guided practice tasks are required`);
    } else if (workloadPlan.practice_bank.some((task) => !nonEmpty(task) || task.length < 45)) {
      fail(`${prefix}: practice tasks must be substantive and actionable`);
    }
  }

  const outcomes = course.outcomes || [];
  if (outcomes.length < 4) fail(`${prefix}: at least 4 learning outcomes required`);
  const outcomeCodes = new Set(outcomes.map((outcome) => outcome.code));
  for (const outcome of outcomes) {
    if (!nonEmpty(outcome.code) || !nonEmpty(outcome.text) || !nonEmpty(outcome.bloom)) {
      fail(`${prefix}: every learning outcome requires code, Bloom level and text`);
    }
  }

  const modules = pack.modules || [];
  if (modules.length < 5) fail(`${prefix}: at least 5 modules required`);
  let moduleHours = 0;
  for (const module of modules) {
    moduleHours += Number(module.estimated_hours || 0);
    if (!nonEmpty(module.code) || !nonEmpty(module.title)) fail(`${prefix}: every module requires code and title`);
    if (!Array.isArray(module.lessons) || module.lessons.length < 2) fail(`${prefix}/${module.code}: at least 2 lessons required`);
    for (const lesson of module.lessons || []) {
      if (!nonEmpty(lesson.title)) fail(`${prefix}/${module.code}: lesson title required`);
      if (!Array.isArray(lesson.objectives) || lesson.objectives.length < 2) fail(`${prefix}/${module.code}/${lesson.title}: at least 2 lesson objectives required`);
      if (!nonEmpty(lesson.teaching_material) || lesson.teaching_material.length < 220) fail(`${prefix}/${module.code}/${lesson.title}: substantive teaching material required (>=220 chars)`);
      if (!nonEmpty(lesson.activity)) fail(`${prefix}/${module.code}/${lesson.title}: learner activity required`);
      if (!Array.isArray(lesson.self_check) || lesson.self_check.length < 2) fail(`${prefix}/${module.code}/${lesson.title}: at least 2 self-check items required`);
      for (const check of lesson.self_check || []) {
        if (!nonEmpty(check.q) || !nonEmpty(check.a)) fail(`${prefix}/${module.code}/${lesson.title}: self-check question and answer required`);
      }
    }
  }
  if (moduleHours !== hours) fail(`${prefix}: module estimated hours (${moduleHours}) must equal planned hours (${hours})`);

  const assessments = pack.assessments || [];
  if (assessments.length < 2) fail(`${prefix}: at least 2 summative assessments required`);
  const totalWeight = assessments.reduce((sum, assessment) => sum + Number(assessment.weight || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.001) fail(`${prefix}: assessment weights must total 100 (found ${totalWeight})`);
  for (const assessment of assessments) {
    if (!nonEmpty(assessment.title) || !nonEmpty(assessment.instructions)) fail(`${prefix}: every assessment requires title and instructions`);
    if (!assessment.rubric || Object.keys(assessment.rubric).length < 2) fail(`${prefix}/${assessment.title}: rubric required`);
    const rubricWeight = Object.values(assessment.rubric || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    if (Math.abs(rubricWeight - 100) > 0.001) fail(`${prefix}/${assessment.title}: rubric weights must total 100 (found ${rubricWeight})`);
    if (!Array.isArray(assessment.outcomes) || assessment.outcomes.length === 0) fail(`${prefix}/${assessment.title}: outcome mapping required`);
    for (const code of assessment.outcomes || []) {
      if (!outcomeCodes.has(code)) fail(`${prefix}/${assessment.title}: unknown mapped outcome ${code}`);
    }
  }

  const assessedOutcomes = new Set(assessments.flatMap((assessment) => assessment.outcomes || []));
  for (const code of outcomeCodes) {
    if (!assessedOutcomes.has(code)) fail(`${prefix}: learning outcome ${code} is not assessed`);
  }

  const resources = pack.resources || [];
  if (resources.length < 5) fail(`${prefix}: at least 5 verified resources/references required`);
  for (const resource of resources) {
    if (!nonEmpty(resource.title) || !nonEmpty(resource.publisher) || !nonEmpty(resource.url) || !nonEmpty(resource.provenance) || !nonEmpty(resource.license)) {
      fail(`${prefix}: every external resource requires title, publisher, URL, provenance and license/usage note`);
    }
    try {
      const parsedUrl = new URL(resource.url);
      if (!['https:', 'http:'].includes(parsedUrl.protocol)) fail(`${prefix}/${resource.title}: resource URL must use http(s)`);
    } catch {
      fail(`${prefix}/${resource.title}: resource URL is invalid`);
    }
  }

  const accessibility = pack.accessibility || {};
  for (const required of ['text_first', 'captions_required_for_video', 'transcripts_required_for_audio', 'visual_alt_text_required']) {
    if (accessibility[required] !== true) fail(`${prefix}: accessibility flag ${required} must be true`);
  }

  const qa = pack.qa || {};
  for (const required of ['structural', 'subject_review', 'citation_review', 'pedagogy_review', 'accessibility_review', 'copyright_review', 'version']) {
    if (!nonEmpty(qa[required])) fail(`${prefix}: QA field ${required} is required`);
  }
}

const descriptorCodes = new Set((programme.courses || []).map((course) => course.code));
for (const workloadCode of Object.keys(workload.courses || {})) {
  if (!descriptorCodes.has(workloadCode)) fail(`${workloadCode}: workload plan has no matching programme course`);
}

if (Number(programme.programme?.credits || 0) !== programmeWorkloadUnits) {
  fail(`programme workload units ${programme.programme?.credits} do not equal course workload units ${programmeWorkloadUnits}`);
}
if (Number(programme.programme?.planned_hours || 0) !== programmeHours) {
  fail(`programme planned hours ${programme.programme?.planned_hours} do not equal course planned hours ${programmeHours}`);
}

if (failures.length) {
  console.error('ScrollUniversity content validation failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`ScrollUniversity content validation passed: ${programme.courses.length} course pack(s), ${programmeWorkloadUnits} internal workload units, ${programmeHours} planned learner hours, explicit workload and practice evidence present.`);
