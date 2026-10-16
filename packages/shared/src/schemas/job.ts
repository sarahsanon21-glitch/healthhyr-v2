import { z } from 'zod';
import { JOB_LIMITS } from '../constants';
import { CARE_ROLES, EMPLOYMENT_TYPES, JOB_STATUSES, PAY_PERIODS } from '../enums';
import { emptyToNull, multiLine, singleLine } from './text';

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

type PayRange = { payMin?: number | null | undefined; payMax?: number | null | undefined };

const payRangeOk = (job: PayRange) =>
  job.payMin == null || job.payMax == null || job.payMax >= job.payMin;

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

const optionalNumber = z.preprocess(emptyToNull, money.nullable()).default(null);

/**
 * What the API accepts when an employer creates a job or saves changes to one. Strict: `status`,
 * `paymentId`, `publishedAt`, `expiresAt`, `employerId` and anything else the server decides are
 * refused. Empty boxes become null. The limits mirror the CHECK constraints in migration 0002.
 * (Completeness for publishing is checked separately: a draft may be unfinished.)
 */
export const jobInputSchema = z
  .object({
    title: singleLine(JOB_LIMITS.titleMax).refine((v) => v.length > 0, 'Enter a job title.'),
    description: multiLine(JOB_LIMITS.descriptionMax).refine((v) => v.length > 0, 'Describe the job.'),
    careRole: z.enum(CARE_ROLES, { error: 'Choose a role.' }),
    employmentType: z.enum(EMPLOYMENT_TYPES, { error: 'Choose an employment type.' }),
    city: singleLine(100).refine((v) => v.length > 0, 'Enter a city.'),
    state: singleLine(50).refine((v) => v.length > 0, 'Enter a state.'),
    zip: z.preprocess(emptyToNull, z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code').nullable()).default(null),
    payMin: optionalNumber,
    payMax: optionalNumber,
    payPeriod: z.preprocess(emptyToNull, z.enum(PAY_PERIODS, { error: 'Choose a pay period.' }).nullable()).default(null),
    easyApply: z.boolean().default(true),
  })
  .strict()
  .refine(payRangeOk, payRangeIssue);

/** What the API returns for a validated body. */
export type JobInput = z.infer<typeof jobInputSchema>;
/** What a client may send (optional fields may be left out or empty). */
export type JobInputBody = z.input<typeof jobInputSchema>;

/** Field names exactly as job_missing_fields() returns them. */
export type JobField = 'title' | 'description' | 'care_role' | 'employment_type' | 'city' | 'state' | 'pay_period';

/** One job in a list (the employer dashboard). */
export const jobSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(JOB_STATUSES),
  careRole: z.enum(CARE_ROLES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  city: z.string(),
  state: z.string(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** One job in full, with what is still missing before it could be published. */
export const jobDetailSchema = jobSummarySchema.extend({
  description: z.string(),
  zip: z.string().nullable(),
  payMin: z.number().nullable(),
  payMax: z.number().nullable(),
  payPeriod: z.enum(PAY_PERIODS).nullable(),
  easyApply: z.boolean(),
  /** Names as job_missing_fields() returns them. Empty when the job is complete. */
  missingFields: z.array(z.string()),
});

export const jobListSchema = z.object({ jobs: z.array(jobSummarySchema) });

export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;

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
