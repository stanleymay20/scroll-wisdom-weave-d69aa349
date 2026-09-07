export type UniversityRole =
  | 'chancellor'
  | 'registrar'
  | 'dean'
  | 'programme_lead'
  | 'lecturer'
  | 'teaching_assistant'
  | 'advisor'
  | 'student'
  | 'auditor';

export type TeachingRole =
  | 'lead_lecturer'
  | 'lecturer'
  | 'teaching_assistant'
  | 'grader'
  | 'observer';

export interface UniversityPerson {
  id: string;
  organization_id: string;
  user_id: string;
  university_role: UniversityRole;
  display_name: string | null;
  student_number: string | null;
  staff_number: string | null;
  status: 'invited' | 'active' | 'suspended' | 'alumni' | 'inactive';
}

export interface UniversityCourse {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  credits: number;
  delivery_mode: 'online' | 'in_person' | 'hybrid' | 'self_paced';
  status: 'draft' | 'active' | 'retired' | 'archived';
}

export interface UniversityProgramme {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  qualification_level: string;
  status: string;
}

export interface UniversityTerm {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  academic_year: string;
  starts_on: string;
  ends_on: string;
  status: string;
}

export interface UniversityCohort {
  id: string;
  organization_id: string;
  programme_id: string | null;
  code: string;
  name: string;
  status: string;
}

export interface UniversityOffering {
  id: string;
  organization_id: string;
  course_id: string;
  term_id: string;
  cohort_id: string | null;
  section_code: string;
  capacity: number | null;
  enrolment_status: string;
}

export interface UniversityAssignment {
  id: string;
  organization_id: string;
  offering_id: string;
  title: string;
  instructions: string;
  assignment_type: string;
  due_at: string | null;
  max_points: number;
  published: boolean;
}

export interface UniversityEnrolment {
  id: string;
  organization_id: string;
  offering_id: string;
  user_id: string;
  status: string;
  final_percentage: number | null;
  final_grade: string | null;
  credits_earned: number | null;
}

export interface UniversityGradebookRow {
  organization_id: string;
  offering_id: string;
  course_code: string;
  course_title: string;
  section_code: string;
  user_id: string;
  display_name: string | null;
  student_number: string | null;
  grade_item_id: string;
  grade_item_name: string;
  category: string;
  max_points: number;
  weight_percent: number;
  points: number | null;
  percentage: number | null;
  grade_label: string | null;
  status: string;
}

export interface RosterCsvRow {
  email: string;
  displayName: string;
  role: UniversityRole;
  studentNumber?: string;
  staffNumber?: string;
}

export interface RosterCsvParseResult {
  rows: RosterCsvRow[];
  errors: string[];
}

export const UNIVERSITY_STAFF_ROLES: UniversityRole[] = [
  'chancellor',
  'registrar',
  'dean',
  'programme_lead',
  'lecturer',
  'teaching_assistant',
  'advisor',
  'auditor',
];

export const UNIVERSITY_ACADEMIC_ADMIN_ROLES: UniversityRole[] = [
  'chancellor',
  'registrar',
  'dean',
  'programme_lead',
];

export function isUniversityStaff(role: UniversityRole | null | undefined): boolean {
  return !!role && UNIVERSITY_STAFF_ROLES.includes(role);
}

export function isUniversityAcademicAdmin(role: UniversityRole | null | undefined): boolean {
  return !!role && UNIVERSITY_ACADEMIC_ADMIN_ROLES.includes(role);
}

export function formatUniversityRole(role: string): string {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

const VALID_ROLES = new Set<UniversityRole>([
  'chancellor', 'registrar', 'dean', 'programme_lead', 'lecturer',
  'teaching_assistant', 'advisor', 'student', 'auditor',
]);

/**
 * Parse a registrar roster CSV without silently accepting malformed records.
 * Required columns: email, display_name, role.
 * Optional: student_number, staff_number.
 */
export function parseUniversityRosterCsv(csv: string): RosterCsvParseResult {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must contain a header and at least one data row.'] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const emailIndex = indexOf('email');
  const nameIndex = indexOf('display_name', 'name', 'full_name');
  const roleIndex = indexOf('role', 'university_role');
  const studentIndex = indexOf('student_number', 'student_id');
  const staffIndex = indexOf('staff_number', 'staff_id');

  const errors: string[] = [];
  if (emailIndex < 0) errors.push('Missing required column: email.');
  if (nameIndex < 0) errors.push('Missing required column: display_name.');
  if (roleIndex < 0) errors.push('Missing required column: role.');
  if (errors.length) return { rows: [], errors };

  const rows: RosterCsvRow[] = [];
  const seenEmails = new Set<string>();

  lines.slice(1).forEach((line, offset) => {
    const lineNumber = offset + 2;
    const values = splitCsvLine(line);
    const email = (values[emailIndex] || '').trim().toLowerCase();
    const displayName = (values[nameIndex] || '').trim();
    const roleValue = (values[roleIndex] || '').trim().toLowerCase().replace(/[ -]+/g, '_') as UniversityRole;

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.push(`Row ${lineNumber}: invalid email.`);
      return;
    }
    if (!displayName) {
      errors.push(`Row ${lineNumber}: display_name is required.`);
      return;
    }
    if (!VALID_ROLES.has(roleValue)) {
      errors.push(`Row ${lineNumber}: unsupported role "${values[roleIndex] || ''}".`);
      return;
    }
    if (seenEmails.has(email)) {
      errors.push(`Row ${lineNumber}: duplicate email ${email}.`);
      return;
    }
    seenEmails.add(email);

    rows.push({
      email,
      displayName,
      role: roleValue,
      studentNumber: studentIndex >= 0 ? (values[studentIndex] || '').trim() || undefined : undefined,
      staffNumber: staffIndex >= 0 ? (values[staffIndex] || '').trim() || undefined : undefined,
    });
  });

  return { rows, errors };
}

export interface WeightedGradeInput {
  percentage: number | null;
  weightPercent: number;
  published?: boolean;
}

/** Compute a normalized weighted percentage from the grade items that count. */
export function computeWeightedGrade(items: WeightedGradeInput[]): number | null {
  const counted = items.filter(
    (item) => item.percentage !== null && Number.isFinite(item.percentage) && item.weightPercent > 0 && item.published !== false,
  );
  const totalWeight = counted.reduce((sum, item) => sum + item.weightPercent, 0);
  if (totalWeight <= 0) return null;
  const weighted = counted.reduce((sum, item) => sum + Number(item.percentage) * item.weightPercent, 0) / totalWeight;
  return Math.round(weighted * 100) / 100;
}

export interface GradingBand {
  label: string;
  min: number;
}

export function gradeBandForPercentage(percentage: number | null, bands: GradingBand[]): string | null {
  if (percentage === null || !Number.isFinite(percentage)) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((band) => percentage >= band.min)?.label ?? null;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
