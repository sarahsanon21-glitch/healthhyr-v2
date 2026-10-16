import { describe, expect, it } from 'vitest';
import {
  applyToJobSchema,
  contactMessageSchema,
  employerApplicationStatusSchema,
  employerProfileSchema,
  jobDraftSchema,
  jobPublishableSchema,
  missingJobFields,
  seekerExperienceSchema,
  seekerPrivateSchema,
  seekerProfileSchema,
  sendMessageSchema,
} from '../src/schemas';

const validJob = {
  title: 'Home health aide',
  description: 'Support clients with daily living activities in their homes across the county.',
  careRole: 'hha',
  employmentType: 'part_time',
  city: 'Austin',
  state: 'TX',
} as const;

const uuid = '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10';

describe('jobs', () => {
  it('accepts a complete job and defaults easy apply on', () => {
    const parsed = jobPublishableSchema.parse(validJob);
    expect(parsed.easyApply).toBe(true);
  });

  it('allows a short draft but not a short publishable job', () => {
    const short = { ...validJob, title: 'Aide', description: 'Short.' };
    expect(jobDraftSchema.safeParse(short).success).toBe(true);
    const result = jobPublishableSchema.safeParse(short);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual(['description', 'title']);
    }
  });

  it('requires a pay period when pay is given', () => {
    expect(jobPublishableSchema.safeParse({ ...validJob, payMin: 18 }).success).toBe(false);
    expect(jobPublishableSchema.safeParse({ ...validJob, payMin: 18, payPeriod: 'hour' }).success).toBe(true);
  });

  it('rejects a maximum below the minimum', () => {
    expect(jobDraftSchema.safeParse({ ...validJob, payMin: 20, payMax: 15, payPeriod: 'hour' }).success).toBe(false);
  });

  it('rejects unknown roles and malformed ZIP codes', () => {
    expect(jobDraftSchema.safeParse({ ...validJob, careRole: 'surgeon' }).success).toBe(false);
    expect(jobDraftSchema.safeParse({ ...validJob, zip: '1234' }).success).toBe(false);
    expect(jobDraftSchema.safeParse({ ...validJob, zip: '78701' }).success).toBe(true);
  });

  it('missingJobFields mirrors the database function', () => {
    expect(missingJobFields({})).toEqual([
      'title',
      'description',
      'care_role',
      'employment_type',
      'city',
      'state',
    ]);
    expect(missingJobFields({ ...validJob })).toEqual([]);
    expect(missingJobFields({ ...validJob, payMax: 30 })).toEqual(['pay_period']);
    expect(missingJobFields({ ...validJob, title: 'Aide' })).toEqual(['title']);
  });
});

describe('applications', () => {
  it('lets employers set only the five review statuses', () => {
    for (const status of ['viewed', 'shortlisted', 'interview', 'hired', 'rejected']) {
      expect(employerApplicationStatusSchema.safeParse({ status }).success).toBe(true);
    }
    for (const status of ['submitted', 'withdrawn', 'archived']) {
      expect(employerApplicationStatusSchema.safeParse({ status }).success).toBe(false);
    }
  });

  it('requires a valid job id to apply', () => {
    expect(applyToJobSchema.safeParse({ jobId: 'nope' }).success).toBe(false);
    expect(applyToJobSchema.parse({ jobId: uuid }).easyApply).toBe(false);
  });
});

describe('seeker profile', () => {
  it('defaults visibility to off', () => {
    expect(seekerProfileSchema.parse({ displayName: 'Sam' }).isVisible).toBe(false);
  });

  it('rejects duplicate shift preferences', () => {
    expect(seekerProfileSchema.safeParse({ displayName: 'Sam', shiftPreferences: ['day', 'day'] }).success).toBe(false);
    expect(seekerProfileSchema.safeParse({ displayName: 'Sam', shiftPreferences: ['day', 'overnight'] }).success).toBe(true);
  });

  it('keeps contact details out of the public profile schema', () => {
    const keys = Object.keys(seekerProfileSchema.shape);
    for (const forbidden of ['phone', 'zip', 'resumeUrl', 'email', 'address']) expect(keys).not.toContain(forbidden);
  });

  it('validates private contact details', () => {
    expect(seekerPrivateSchema.safeParse({ phone: '(512) 555-0100', zip: '78701' }).success).toBe(true);
    expect(seekerPrivateSchema.safeParse({ phone: 'call me' }).success).toBe(false);
    expect(seekerPrivateSchema.safeParse({ zip: 'abcde' }).success).toBe(false);
  });

  it('requires experience to end on or after it starts', () => {
    const base = { title: 'PCA', employer: 'Acme Care', startDate: '2022-01-01' };
    expect(seekerExperienceSchema.safeParse({ ...base, endDate: '2023-01-01' }).success).toBe(true);
    expect(seekerExperienceSchema.safeParse({ ...base, endDate: '2021-12-31' }).success).toBe(false);
  });
});

describe('employer profile', () => {
  it('accepts http(s) websites only', () => {
    expect(employerProfileSchema.safeParse({ companyName: 'Sunrise', website: 'https://example.com' }).success).toBe(true);
    expect(employerProfileSchema.safeParse({ companyName: 'Sunrise', website: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('messages and contact', () => {
  it('bounds message length', () => {
    expect(sendMessageSchema.safeParse({ recipientId: uuid, body: 'Hello' }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ recipientId: uuid, body: '   ' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ recipientId: uuid, body: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('validates the contact form and defaults the honeypot to empty', () => {
    const form = { name: 'Sam', email: 'sam@example.com', topic: 'billing', message: 'I have a question about billing.' };
    expect(contactMessageSchema.parse(form).hp).toBe('');
    expect(contactMessageSchema.safeParse({ ...form, email: 'not-an-email' }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...form, topic: 'sales' }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...form, message: 'short' }).success).toBe(false);
  });
});
