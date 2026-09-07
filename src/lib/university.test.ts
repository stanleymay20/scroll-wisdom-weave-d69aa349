import { describe, expect, it } from 'vitest';
import {
  computeWeightedGrade,
  gradeBandForPercentage,
  parseUniversityRosterCsv,
  rowsToCsv,
} from './university';

describe('parseUniversityRosterCsv', () => {
  it('parses a valid registrar roster', () => {
    const result = parseUniversityRosterCsv([
      'email,display_name,role,student_number,staff_number',
      'ada@example.com,Ada Student,student,ST-001,',
      'grace@example.com,Grace Lecturer,lecturer,,SF-010',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      email: 'ada@example.com',
      displayName: 'Ada Student',
      role: 'student',
      studentNumber: 'ST-001',
    });
    expect(result.rows[1]).toMatchObject({ role: 'lecturer', staffNumber: 'SF-010' });
  });

  it('rejects invalid and duplicate records instead of silently provisioning them', () => {
    const result = parseUniversityRosterCsv([
      'email,display_name,role',
      'bad-email,No Email,student',
      'valid@example.com,Valid,unknown-role',
      'duplicate@example.com,One,student',
      'duplicate@example.com,Two,student',
    ].join('\n'));

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(3);
  });

  it('supports quoted commas and role aliases with spaces', () => {
    const result = parseUniversityRosterCsv([
      'email,display_name,role',
      'lead@example.com,"Osei, Ama",programme lead',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      displayName: 'Osei, Ama',
      role: 'programme_lead',
    });
  });
});

describe('computeWeightedGrade', () => {
  it('normalizes against counted weight', () => {
    expect(computeWeightedGrade([
      { percentage: 80, weightPercent: 40 },
      { percentage: 60, weightPercent: 20 },
      { percentage: null, weightPercent: 40 },
    ])).toBe(73.33);
  });

  it('ignores unpublished items and returns null without weight', () => {
    expect(computeWeightedGrade([{ percentage: 95, weightPercent: 100, published: false }])).toBeNull();
    expect(computeWeightedGrade([])).toBeNull();
  });
});

describe('gradeBandForPercentage', () => {
  const bands = [
    { label: 'F', min: 0 },
    { label: 'A', min: 70 },
    { label: 'B', min: 60 },
    { label: 'C', min: 50 },
  ];

  it('uses the highest matching threshold', () => {
    expect(gradeBandForPercentage(76, bands)).toBe('A');
    expect(gradeBandForPercentage(63, bands)).toBe('B');
    expect(gradeBandForPercentage(null, bands)).toBeNull();
  });
});

describe('rowsToCsv', () => {
  it('escapes commas and quotes', () => {
    expect(rowsToCsv([{ name: 'Osei, Ama', note: 'She said "yes"' }]))
      .toBe('name,note\n"Osei, Ama","She said ""yes"""');
  });
});
