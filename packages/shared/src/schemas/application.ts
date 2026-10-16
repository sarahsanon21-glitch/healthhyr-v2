import { z } from 'zod';
import { EMPLOYER_APPLICATION_STATUSES } from '../enums';

export const applyToJobSchema = z.object({
  jobId: z.uuid(),
  easyApply: z.boolean().default(false),
  coverNote: z.string().trim().max(2000).optional(),
});

/** Employers may only set these. Seekers may only withdraw, which is a separate action. */
export const employerApplicationStatusSchema = z.object({
  status: z.enum(EMPLOYER_APPLICATION_STATUSES),
});

export type ApplyToJobInput = z.infer<typeof applyToJobSchema>;
export type EmployerApplicationStatusInput = z.infer<typeof employerApplicationStatusSchema>;
