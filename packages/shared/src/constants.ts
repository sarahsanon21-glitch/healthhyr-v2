export const PAY_PER_POST = {
  name: 'Pay Per Post',
  amountCents: 250,
  currency: 'usd',
  durationDays: 30,
} as const;

export const HIRING_PRO = {
  name: 'Hiring Pro',
  amountCents: 3999,
  currency: 'usd',
  interval: 'month',
  /** Shown as "Coming soon" at launch. No checkout until this flips. */
  comingSoon: true,
  /** Planned features, not enforced until Hiring Pro is buyable. */
  newJobsPerPeriod: 30,
  jobDurationDays: 30,
} as const;

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const DEFAULT_COMPANY_NAME = 'My company';

/** Mirrors the employer_profiles listing trigger: a company page is public only once renamed. */
export function isListedCompanyName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 && name !== DEFAULT_COMPANY_NAME;
}

export const CONTACT_EMAIL = 'support@healthhyr.com';

/** Mirrors job_missing_fields() in the schema. */
export const JOB_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 50,
  descriptionMax: 10_000,
} as const;

export const MESSAGE_LIMITS = { bodyMax: 4000 } as const;

export const CONTACT_LIMITS = { nameMax: 120, messageMin: 10, messageMax: 4000, emailMax: 254 } as const;

export const WEBHOOK_MAX_ATTEMPTS = 5;
export const CHECKOUT_SESSION_MINUTES = 30;
export const RESUME_SIGNED_URL_SECONDS = 60;
