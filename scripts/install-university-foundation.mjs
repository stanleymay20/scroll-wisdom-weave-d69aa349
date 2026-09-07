import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve('content/university/foundation-core-v1');
const apply = process.argv.includes('--apply');
const organizationId = process.env.SCROLL_UNIVERSITY_ORG_ID || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const actorId = process.env.SCROLL_UNIVERSITY_INSTALLER_USER_ID || null;

const programmeManifest = JSON.parse(await readFile(path.join(root, 'programme.json'), 'utf8'));
const packs = [];
for (const descriptor of programmeManifest.courses) {
  packs.push(JSON.parse(await readFile(path.join(root, descriptor.pack), 'utf8')));
}

const encoded = new TextEncoder().encode(JSON.stringify({ programmeManifest, packs }));
const digest = await crypto.subtle.digest('SHA-256', encoded);
const contentHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const summary = {
  programme: programmeManifest.programme.code,
  courses: packs.length,
  credits: packs.reduce((sum, pack) => sum + Number(pack.course.credits || 0), 0),
  modules: packs.reduce((sum, pack) => sum + pack.modules.length, 0),
  lessons: packs.reduce((sum, pack) => sum + pack.modules.reduce((inner, module) => inner + module.lessons.length, 0), 0),
  resources: packs.reduce((sum, pack) => sum + pack.resources.length, 0),
  assessments: packs.reduce((sum, pack) => sum + pack.assessments.length, 0),
  content_hash: contentHash,
};

if (!apply) {
  console.log('ScrollUniversity foundation installer dry run. No database writes performed.');
  console.table(summary);
  console.log('Run the repository content validator first, then use --apply with SCROLL_UNIVERSITY_ORG_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a trusted operator environment.');
  process.exit(0);
}

if (!organizationId || !supabaseUrl || !serviceRoleKey) {
  throw new Error('Apply mode requires SCROLL_UNIVERSITY_ORG_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const must = async (promise, label) => {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const one = (data, label) => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error(`${label}: no row id returned`);
  return row;
};

const existingRelease = await must(
  db.from('university_course_pack_releases')
    .select('id,content_hash')
    .eq('organization_id', organizationId)
    .eq('pack_code', programmeManifest.programme.code)
    .eq('version', '1.0.0')
    .maybeSingle(),
  'check existing release',
);

if (existingRelease?.content_hash === contentHash) {
  console.log(`Foundation pack ${programmeManifest.programme.code} v1.0.0 is already installed with hash ${contentHash}.`);
  process.exit(0);
}
if (existingRelease && existingRelease.content_hash !== contentHash) {
  throw new Error('A different payload already uses pack version 1.0.0. Increment the pack version instead of mutating a released curriculum.');
}

const school = one(await must(
  db.from('university_schools').upsert({
    organization_id: organizationId,
    code: 'FND',
    name: 'Foundation Studies',
    school_type: 'school',
    description: 'Common academic, digital, quantitative, AI, communication and innovation foundation.',
    active: true,
  }, { onConflict: 'organization_id,code' }).select('id'),
  'upsert foundation school',
), 'foundation school');

const programme = one(await must(
  db.from('university_programmes').upsert({
    organization_id: organizationId,
    school_id: school.id,
    code: programmeManifest.programme.code,
    name: programmeManifest.programme.name,
    qualification_level: programmeManifest.programme.qualification_level,
    duration_terms: 1,
    total_credits: programmeManifest.programme.credits,
    description: programmeManifest.programme.purpose,
    admissions_requirements: 'Institution-defined. Foundation Core itself does not confer admission eligibility.',
    status: 'active',
  }, { onConflict: 'organization_id,code' }).select('id'),
  'upsert foundation programme',
), 'foundation programme');

const courseIds = new Map();
const courseOutcomeIds = new Map();

for (const [courseIndex, pack] of packs.entries()) {
  const c = pack.course;
  const course = one(await must(
    db.from('university_courses').upsert({
      organization_id: organizationId,
      school_id: school.id,
      code: c.code,
      title: c.title,
      description: c.description,
      credits: c.credits,
      level: c.level,
      contact_hours: 35,
      independent_hours: c.planned_hours - 35,
      delivery_mode: c.delivery_mode,
      status: 'active',
    }, { onConflict: 'organization_id,code' }).select('id'),
    `upsert course ${c.code}`,
  ), `course ${c.code}`);
  courseIds.set(c.code, course.id);

  await must(
    db.from('university_programme_courses').upsert({
      organization_id: organizationId,
      programme_id: programme.id,
      course_id: course.id,
      year_number: 1,
      term_number: 1,
      is_required: true,
      credits_override: c.credits,
      sequence: courseIndex + 1,
    }, { onConflict: 'programme_id,course_id' }),
    `map course ${c.code} to programme`,
  );

  const outcomeIds = new Map();
  for (const outcome of c.outcomes) {
    const existing = await must(
      db.from('university_learning_outcomes')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('course_id', course.id)
        .eq('code', outcome.code)
        .maybeSingle(),
      `find outcome ${outcome.code}`,
    );

    let outcomeId = existing?.id;
    if (outcomeId) {
      await must(
        db.from('university_learning_outcomes').update({
          description: outcome.text,
          bloom_level: outcome.bloom,
          competency_domain: 'foundation-core',
          active: true,
        }).eq('id', outcomeId),
        `update outcome ${outcome.code}`,
      );
    } else {
      const inserted = one(await must(
        db.from('university_learning_outcomes').insert({
          organization_id: organizationId,
          course_id: course.id,
          code: outcome.code,
          description: outcome.text,
          bloom_level: outcome.bloom,
          competency_domain: 'foundation-core',
          active: true,
        }).select('id'),
        `insert outcome ${outcome.code}`,
      ), `outcome ${outcome.code}`);
      outcomeId = inserted.id;
    }
    outcomeIds.set(outcome.code, outcomeId);
  }
  courseOutcomeIds.set(c.code, outcomeIds);

  const moduleIds = new Map();
  for (const [moduleIndex, module] of pack.modules.entries()) {
    const moduleRow = one(await must(
      db.from('university_modules').upsert({
        organization_id: organizationId,
        course_id: course.id,
        code: module.code,
        title: module.title,
        description: `Foundation Core module ${module.code}: ${module.title}`,
        sequence: moduleIndex + 1,
        estimated_learning_hours: module.estimated_hours,
        active: true,
      }, { onConflict: 'course_id,sequence' }).select('id'),
      `upsert module ${c.code}/${module.code}`,
    ), `module ${c.code}/${module.code}`);
    moduleIds.set(module.code, moduleRow.id);

    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      await must(
        db.from('university_lessons').upsert({
          organization_id: organizationId,
          module_id: moduleRow.id,
          title: lesson.title,
          sequence: lessonIndex + 1,
          lesson_type: 'reading',
          content: {
            objectives: lesson.objectives,
            teaching_material: lesson.teaching_material,
            activity: lesson.activity,
            self_check: lesson.self_check,
            source_pack: `${programmeManifest.programme.code}@1.0.0`,
          },
          required: true,
          estimated_minutes: lesson.minutes,
        }, { onConflict: 'module_id,sequence' }),
        `upsert lesson ${c.code}/${module.code}/${lesson.title}`,
      );
    }
  }

  for (const [resourceIndex, resource] of pack.resources.entries()) {
    await must(
      db.from('university_course_resources').upsert({
        organization_id: organizationId,
        course_id: course.id,
        module_id: null,
        title: resource.title,
        resource_type: resource.url.includes('data') ? 'dataset' : 'reading',
        url: resource.url,
        citation: `${resource.publisher}. ${resource.title}.`,
        provenance: resource.provenance,
        license_note: resource.license,
        required: resourceIndex < 2,
        sequence: resourceIndex + 1,
        metadata: { publisher: resource.publisher, source_pack: `${programmeManifest.programme.code}@1.0.0` },
      }, { onConflict: 'course_id,title,sequence' }),
      `upsert resource ${c.code}/${resource.title}`,
    );
  }

  for (const assessment of pack.assessments) {
    const template = one(await must(
      db.from('university_assessment_templates').upsert({
        organization_id: organizationId,
        course_id: course.id,
        module_id: null,
        code: assessment.id,
        title: assessment.title,
        assignment_type: assessment.title.toLowerCase().includes('presentation') ? 'presentation' : assessment.title.toLowerCase().includes('project') || assessment.title.toLowerCase().includes('capstone') ? 'project' : 'assignment',
        instructions: assessment.instructions,
        max_points: 100,
        weight_percent: assessment.weight,
        rubric: assessment.rubric,
        release_policy: { source_pack: `${programmeManifest.programme.code}@1.0.0` },
        active: true,
      }, { onConflict: 'course_id,code' }).select('id'),
      `upsert assessment template ${c.code}/${assessment.id}`,
    ), `assessment ${c.code}/${assessment.id}`);

    for (const outcomeCode of assessment.outcomes) {
      const learningOutcomeId = outcomeIds.get(outcomeCode);
      if (!learningOutcomeId) throw new Error(`Unknown outcome ${c.code}/${outcomeCode}`);
      await must(
        db.from('university_assessment_template_outcomes').upsert({
          organization_id: organizationId,
          assessment_template_id: template.id,
          learning_outcome_id: learningOutcomeId,
          contribution_weight: 1,
        }, { onConflict: 'assessment_template_id,learning_outcome_id' }),
        `map assessment ${c.code}/${assessment.id} to ${outcomeCode}`,
      );
    }
  }
}

await must(
  db.from('university_course_pack_releases').insert({
    organization_id: organizationId,
    pack_code: programmeManifest.programme.code,
    version: '1.0.0',
    programme_code: programmeManifest.programme.code,
    content_hash: contentHash,
    source_ref: process.env.GITHUB_SHA || null,
    qa_status: programmeManifest.quality,
    installed_by: actorId,
    metadata: summary,
  }),
  'record course-pack release',
);

console.log('ScrollUniversity foundation curriculum installed successfully.');
console.table(summary);
