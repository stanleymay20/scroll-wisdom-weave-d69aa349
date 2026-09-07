import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;

export interface UniversityLessonContent {
  id: string;
  organization_id: string;
  module_id: string;
  title: string;
  sequence: number;
  lesson_type: string;
  content: Record<string, unknown>;
  required: boolean;
  estimated_minutes: number;
}

export interface UniversityCourseResource {
  id: string;
  organization_id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  resource_type: string;
  url: string | null;
  citation: string | null;
  provenance: string;
  license_note: string;
  required: boolean;
  sequence: number;
  metadata: Record<string, unknown>;
}

export interface UniversityAssessmentTemplate {
  id: string;
  organization_id: string;
  course_id: string;
  module_id: string | null;
  code: string;
  title: string;
  assignment_type: string;
  instructions: string;
  max_points: number;
  weight_percent: number;
  rubric: Record<string, number>;
  active: boolean;
}

export interface UniversityAssessmentTemplateOutcome {
  assessment_template_id: string;
  learning_outcome_id: string;
  contribution_weight: number;
}

export function useUniversityCourseContent(activeOrgId: string | null) {
  const [lessons, setLessons] = useState<UniversityLessonContent[]>([]);
  const [resources, setResources] = useState<UniversityCourseResource[]>([]);
  const [assessmentTemplates, setAssessmentTemplates] = useState<UniversityAssessmentTemplate[]>([]);
  const [assessmentOutcomes, setAssessmentOutcomes] = useState<UniversityAssessmentTemplateOutcome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrgId) {
      setLessons([]);
      setResources([]);
      setAssessmentTemplates([]);
      setAssessmentOutcomes([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [lessonRes, resourceRes, assessmentRes, mappingRes] = await Promise.all([
        db.from('university_lessons').select('*').eq('organization_id', activeOrgId).order('module_id').order('sequence'),
        db.from('university_course_resources').select('*').eq('organization_id', activeOrgId).order('course_id').order('sequence'),
        db.from('university_assessment_templates').select('*').eq('organization_id', activeOrgId).eq('active', true).order('course_id').order('code'),
        db.from('university_assessment_template_outcomes').select('assessment_template_id,learning_outcome_id,contribution_weight').eq('organization_id', activeOrgId),
      ]);
      const firstError = [lessonRes, resourceRes, assessmentRes, mappingRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setLessons((lessonRes.data || []) as UniversityLessonContent[]);
      setResources((resourceRes.data || []) as UniversityCourseResource[]);
      setAssessmentTemplates((assessmentRes.data || []) as UniversityAssessmentTemplate[]);
      setAssessmentOutcomes((mappingRes.data || []) as UniversityAssessmentTemplateOutcome[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load university course content.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const lessonsByModule = useMemo(() => {
    const map = new Map<string, UniversityLessonContent[]>();
    for (const lesson of lessons) {
      const current = map.get(lesson.module_id) || [];
      current.push(lesson);
      map.set(lesson.module_id, current);
    }
    return map;
  }, [lessons]);

  const resourcesByCourse = useMemo(() => {
    const map = new Map<string, UniversityCourseResource[]>();
    for (const resource of resources) {
      const current = map.get(resource.course_id) || [];
      current.push(resource);
      map.set(resource.course_id, current);
    }
    return map;
  }, [resources]);

  const assessmentsByCourse = useMemo(() => {
    const map = new Map<string, UniversityAssessmentTemplate[]>();
    for (const assessment of assessmentTemplates) {
      const current = map.get(assessment.course_id) || [];
      current.push(assessment);
      map.set(assessment.course_id, current);
    }
    return map;
  }, [assessmentTemplates]);

  return {
    lessons,
    resources,
    assessmentTemplates,
    assessmentOutcomes,
    lessonsByModule,
    resourcesByCourse,
    assessmentsByCourse,
    loading,
    error,
    refresh,
  };
}
