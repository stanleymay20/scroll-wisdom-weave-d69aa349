/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

const targetVus = Math.max(1, Number.parseInt(__ENV.TARGET_VUS || '100', 10));
const holdDuration = __ENV.HOLD_DURATION || '2m';
const rampTarget = (ratio) => Math.max(1, Math.ceil(targetVus * ratio));

export const options = {
  scenarios: {
    university_read_paths: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: rampTarget(0.1) },
        { duration: '45s', target: rampTarget(0.25) },
        { duration: '45s', target: rampTarget(0.5) },
        { duration: '60s', target: targetVus },
        { duration: holdDuration, target: targetVus },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.99'],
  },
};

function required(name) {
  const value = __ENV[name];
  if (!value) throw new Error(`${name} is required for the ScrollUniversity staging load profile.`);
  return value.replace(/\/$/, '');
}

export function setup() {
  return {
    supabaseUrl: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    jwt: required('UNIVERSITY_JWT'),
  };
}

export default function runUniversityReadProfile(config) {
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.jwt}`,
    Accept: 'application/json',
  };

  const base = `${config.supabaseUrl}/rest/v1`;
  const responses = http.batch([
    ['GET', `${base}/university_course_offerings?select=id,course_id,term_id,enrolment_status&limit=50`, null, { headers, tags: { surface: 'offerings' } }],
    ['GET', `${base}/university_assignments?select=id,offering_id,title,due_at,published&published=eq.true&limit=50`, null, { headers, tags: { surface: 'assignments' } }],
    ['GET', `${base}/university_announcements?select=id,title,published_at&limit=25`, null, { headers, tags: { surface: 'announcements' } }],
    ['GET', `${base}/university_learner_progress_v?select=offering_id,course_code,current_percentage,attendance_percentage,assignments_outstanding&limit=50`, null, { headers, tags: { surface: 'progress' } }],
    ['GET', `${base}/university_attendance_summary_v?select=offering_id,sessions_total,sessions_attended,attendance_percentage&limit=50`, null, { headers, tags: { surface: 'attendance' } }],
  ]);

  responses.forEach((response) => {
    check(response, {
      'university request succeeds': (res) => res.status >= 200 && res.status < 300,
      'university request stays below 3s': (res) => res.timings.duration < 3000,
    });
  });

  sleep(0.25 + Math.random() * 0.75);
}
