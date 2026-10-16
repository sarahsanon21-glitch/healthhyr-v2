// Words people see for the values stored in the database. One place, so the website and the app
// say the same thing, and a test fails when an enum gains a value without a label.
import type { CareRole, EmploymentType, JobStatus, PayPeriod } from './enums';

export const CARE_ROLE_LABELS: Record<CareRole, string> = {
  pca: 'Personal care aide (PCA)',
  hha: 'Home health aide (HHA)',
  cna: 'Certified nursing assistant (CNA)',
  rn: 'Registered nurse (RN)',
  lpn: 'Licensed practical nurse (LPN)',
  caregiver: 'Caregiver',
  other: 'Other',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  per_diem: 'Per diem',
  contract: 'Contract',
  live_in: 'Live-in',
};

export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = {
  hour: 'per hour',
  day: 'per day',
  week: 'per week',
  month: 'per month',
  year: 'per year',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  pending_payment: 'Waiting for payment',
  published: 'Published',
  expired: 'Expired',
  closed: 'Closed',
};

/** What each part of a job is called when something is missing (names as job_missing_fields() returns them). */
export const JOB_FIELD_LABELS: Record<string, string> = {
  title: 'a job title of at least 5 characters',
  description: 'a description of at least 50 characters',
  care_role: 'a role',
  employment_type: 'an employment type',
  city: 'a city',
  state: 'a state',
  pay_period: 'a pay period for the pay you entered',
};
