// Mirrors the Postgres enums in the schema. A test compares them with the SQL.

export const USER_ROLES = ['seeker', 'employer', 'admin'] as const;
export const CARE_ROLES = ['pca', 'hha', 'cna', 'rn', 'lpn', 'caregiver', 'other'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'per_diem', 'contract', 'live_in'] as const;
export const PAY_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export const SHIFT_PREFS = ['day', 'evening', 'overnight', 'weekend'] as const;
export const JOB_STATUSES = ['draft', 'pending_payment', 'published', 'expired', 'closed'] as const;
export const APPLICATION_STATUSES = [
  'submitted',
  'viewed',
  'shortlisted',
  'interview',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'canceled', 'needs_review', 'refunded'] as const;
export const SUBSCRIPTION_STATUSES = ['incomplete', 'active', 'past_due', 'canceled'] as const;
export const LANGUAGE_LEVELS = ['basic', 'conversational', 'fluent', 'native'] as const;
export const CONTACT_STATUSES = ['new', 'handled'] as const;

/** Mirrors the CHECK constraint on contact_messages.topic. */
export const CONTACT_TOPICS = ['general', 'employer_support', 'seeker_support', 'billing'] as const;

/** Statuses an employer may set on an application. Seekers may only set 'withdrawn'. */
export const EMPLOYER_APPLICATION_STATUSES = ['viewed', 'shortlisted', 'interview', 'hired', 'rejected'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type CareRole = (typeof CARE_ROLES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type PayPeriod = (typeof PAY_PERIODS)[number];
export type ShiftPref = (typeof SHIFT_PREFS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
