import { describe, expect, it } from 'vitest';
import {
  CARE_ROLES,
  CARE_ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  JOB_FIELD_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  PAY_PERIODS,
  PAY_PERIOD_LABELS,
  hasNoControlCharacters,
  hasNoOddControlCharacters,
  jobDetailSchema,
  jobInputSchema,
  jobSummarySchema,
  multiLine,
  singleLine,
} from '../src';

const VALID = {
  title: 'Home health aide',
  description: 'Support clients with daily living activities in their homes.',
  careRole: 'hha',
  employmentType: 'part_time',
  city: 'Austin',
  state: 'TX',
};

describe('jobInputSchema', () => {
  it('accepts the required fields; everything optional becomes null and easy apply defaults to on', () => {
    expect(jobInputSchema.parse(VALID)).toEqual({ ...VALID, zip: null, payMin: null, payMax: null, payPeriod: null, easyApply: true });
  });

  it('trims text and turns empty optional boxes into null', () => {
    const parsed = jobInputSchema.parse({ ...VALID, title: '  Aide  ', zip: '', payMin: '', payMax: '  ', payPeriod: '' });
    expect(parsed).toMatchObject({ title: 'Aide', zip: null, payMin: null, payMax: null, payPeriod: null });
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(121) }, 'title'],
    [{ description: '' }, 'description'],
    [{ description: 'x'.repeat(10001) }, 'description'],
    [{ careRole: 'nope' }, 'careRole'],
    [{ employmentType: 'nope' }, 'employmentType'],
    [{ city: '' }, 'city'],
    [{ state: 'x'.repeat(51) }, 'state'],
    [{ zip: '12' }, 'zip'],
    [{ payMin: -1 }, 'payMin'],
    [{ payMin: 100_000_000 }, 'payMin'],
    [{ payMin: 20, payMax: 10 }, 'payMax'],
    [{ payPeriod: 'year-ish' }, 'payPeriod'],
    [{ easyApply: 'yes' }, 'easyApply'],
  ])('refuses %j (field %s)', (change, field) => {
    const result = jobInputSchema.safeParse({ ...VALID, ...change });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => String(issue.path[0]))).toContain(field);
  });

  it.each(['status', 'paymentId', 'payment_id', 'publishedAt', 'published_at', 'expiresAt', 'expires_at', 'employerId', 'employer_id', 'id', 'createdAt', 'anything'])(
    'refuses %s, because the server decides it',
    (key) => {
      expect(jobInputSchema.safeParse({ ...VALID, [key]: 'x' }).success).toBe(false);
    },
  );

  it('accepts text exactly at its limits, and allows line breaks only in the description', () => {
    expect(jobInputSchema.safeParse({ ...VALID, title: 'x'.repeat(120), description: 'y'.repeat(10000), city: 'c'.repeat(100), state: 's'.repeat(50) }).success).toBe(true);
    expect(jobInputSchema.parse({ ...VALID, description: 'a\nb\tc' }).description).toBe('a\nb\tc');
    expect(jobInputSchema.safeParse({ ...VALID, title: 'a\nb' }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...VALID, city: 'a\tb' }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...VALID, description: 'a\u0001b' }).success).toBe(false);
  });
});

describe('text helpers mirror the database constraints', () => {
  it('single-line text allows no control characters at all', () => {
    for (const bad of ['\u0001', '\u0007', '\u001b', '\u007f', '\n', '\t', '\r']) expect(hasNoControlCharacters(`a${bad}b`)).toBe(false);
    expect(hasNoControlCharacters('Plain text, with punctuation: é ñ 日本')).toBe(true);
  });

  it('multi-line text allows tab, line feed and carriage return only', () => {
    for (const ok of ['\t', '\n', '\r']) expect(hasNoOddControlCharacters(`a${ok}b`)).toBe(true);
    for (const bad of ['\u0001', '\u0008', '\u000b', '\u000c', '\u001b', '\u007f']) expect(hasNoOddControlCharacters(`a${bad}b`)).toBe(false);
  });

  it('singleLine and multiLine enforce their maximum length and trim', () => {
    expect(singleLine(5).safeParse('  abc  ').data).toBe('abc');
    expect(singleLine(5).safeParse('abcdef').success).toBe(false);
    expect(multiLine(5).safeParse('abcdef').success).toBe(false);
  });
});

describe('labels', () => {
  it('every role, employment type, pay period and job status has a label, and nothing else does', () => {
    expect(Object.keys(CARE_ROLE_LABELS).sort()).toEqual([...CARE_ROLES].sort());
    expect(Object.keys(EMPLOYMENT_TYPE_LABELS).sort()).toEqual([...EMPLOYMENT_TYPES].sort());
    expect(Object.keys(PAY_PERIOD_LABELS).sort()).toEqual([...PAY_PERIODS].sort());
    expect(Object.keys(JOB_STATUS_LABELS).sort()).toEqual([...JOB_STATUSES].sort());
  });

  it('every field job_missing_fields() can return has a plain-words label', () => {
    for (const name of ['title', 'description', 'care_role', 'employment_type', 'city', 'state', 'pay_period']) {
      expect(JOB_FIELD_LABELS[name], name).toBeTruthy();
    }
  });

  it('labels contain no "verified" style claims', () => {
    const all = [CARE_ROLE_LABELS, EMPLOYMENT_TYPE_LABELS, PAY_PERIOD_LABELS, JOB_STATUS_LABELS, JOB_FIELD_LABELS].flatMap((labels) => Object.values(labels));
    for (const label of all) expect(label).not.toMatch(/verified|background|guarantee/i);
  });
});

describe('job response schemas', () => {
  const summary = {
    id: '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10',
    title: 'Aide',
    status: 'draft',
    careRole: 'hha',
    employmentType: 'part_time',
    city: 'Austin',
    state: 'TX',
    publishedAt: null,
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('a summary has no description, owner or payment, and strips extra fields', () => {
    const parsed = jobSummarySchema.parse({ ...summary, employer_id: 'x', payment_id: 'y', description: 'z' });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(summary).sort());
  });

  it('a detail adds the content and what is missing, and still never the owner or payment', () => {
    const parsed = jobDetailSchema.parse({ ...summary, description: 'd', zip: null, payMin: null, payMax: null, payPeriod: null, easyApply: true, missingFields: ['title'], employerId: 'x', paymentId: 'y' });
    expect(parsed.missingFields).toEqual(['title']);
    expect(JSON.stringify(parsed)).not.toMatch(/employerId|paymentId/);
  });

  it('refuses a status that does not exist', () => {
    expect(jobSummarySchema.safeParse({ ...summary, status: 'archived' }).success).toBe(false);
  });
});
