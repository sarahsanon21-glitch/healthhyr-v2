import { z } from 'zod';
import { JOB_LIMITS } from '../constants';
import { CARE_ROLES, EMPLOYMENT_TYPES, PAY_PERIODS } from '../enums';

const money = z.number().nonnegative().max(99_999_999.99);

const jobFields = {
  title: z.string().trim().min(1).max(JOB_LIMITS.titleMax),
  description: z.string().trim().min(1).max(JOB_LIMITS.descriptionMax),
  careRole: z.enum(CARE_ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(50),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code')
    .optional(),
  payMin: money.optional(),
  payMax: money.optional(),
  payPeriod: z.enum(PAY_PERIODS).optional(),
  easyApply: z.boolean().default(true),
};

type PayRange = { payMin?: number | undefined; payMax?: number | undefined };

const payRangeOk = (job: PayRange) =>
  job.payMin === undefined || job.payMax === undefined || job.payMax >= job.payMin;

const payRangeIssue = { message: 'Maximum pay must be at least the minimum', path: ['payMax'] };

/** What an employer can save as a draft: every NOT NULL column filled in, nothing more. */
export const jobDraftSchema = z.object(jobFields).refine(payRangeOk, payRangeIssue);

/** What must be true before a job can be paid for and published. */
export const jobPublishableSchema = z
  .object({
    ...jobFields,
    title: jobFields.title.min(JOB_LIMITS.titleMin),
    description: jobFields.description.min(JOB_LIMITS.descriptionMin),
  })
  .refine(payRangeOk, payRangeIssue)
  .refine((job) => (job.payMin === undefined && job.payMax === undefined) || job.payPeriod !== undefined, {
    message: 'Choose a pay period',
    path: ['payPeriod'],
  });

export type JobDraftInput = z.infer<typeof jobDraftSchema>;
export type JobPublishableInput = z.infer<typeof jobPublishableSchema>;

/** Field names exactly as job_missing_fields() returns them. */
export type JobField = 'title' | 'description' | 'care_role' | 'employment_type' | 'city' | 'state' | 'pay_period';

export interface JobCompletenessInput {
  title?: string | null;
  description?: string | null;
  careRole?: string | null;
  employmentType?: string | null;
  city?: string | null;
  state?: string | null;
  payMin?: number | null;
  payMax?: number | null;
  payPeriod?: string | null;
}

/** Client-side mirror of job_missing_fields(). The database function stays the source of truth. */
export function missingJobFields(job: JobCompletenessInput): JobField[] {
  const missing: JobField[] = [];
  if ((job.title ?? '').trim().length < JOB_LIMITS.titleMin) missing.push('title');
  if ((job.description ?? '').trim().length < JOB_LIMITS.descriptionMin) missing.push('description');
  if (!job.careRole) missing.push('care_role');
  if (!job.employmentType) missing.push('employment_type');
  if ((job.city ?? '').trim().length === 0) missing.push('city');
  if ((job.state ?? '').trim().length === 0) missing.push('state');
  if ((job.payMin != null || job.payMax != null) && !job.payPeriod) missing.push('pay_period');
  return missing;
}
