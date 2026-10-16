// User-facing copy that must not drift. Approved wording lives here, and tests pin it.
import { HIRING_PRO, PAY_PER_POST, formatUsd } from './constants';

export const VISIBILITY_SWITCH_COPY = {
  label: 'Let employers with Hiring Pro find my profile',
  description:
    'Hiring Pro is not live yet. If you turn this on, employers with Hiring Pro will be able to find your profile once it launches. Your phone, resume and home address are never shown. You can turn this off at any time.',
} as const;

export const PRICING_COPY = {
  payPerPost: {
    name: PAY_PER_POST.name,
    price: formatUsd(PAY_PER_POST.amountCents),
    priceNote: 'per job posting',
    features: [
      'One job posting',
      `Live for ${PAY_PER_POST.durationDays} days`,
      'Edit it for free while it is live',
      'Republishing needs a new payment',
    ],
  },
  hiringPro: {
    name: HIRING_PRO.name,
    price: formatUsd(HIRING_PRO.amountCents),
    priceNote: 'per month',
    badge: 'Coming soon',
    plannedLabel: 'Planned for launch',
    plannedFeatures: [
      'Opt-in candidate directory search',
      'Filters by role, certifications, availability, preferred shifts and city/state',
      `Up to ${HIRING_PRO.newJobsPerPeriod} new job postings per billing period, each active ${HIRING_PRO.jobDurationDays} days`,
      'Invite candidates to apply',
    ],
  },
  disclaimer: 'Features do not guarantee applications or hires.',
} as const;

/** Claims the site must never make. Used by copy tests and the final banned-phrase scan. */
export const BANNED_CLAIMS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'verified', pattern: /\bverified\b/i },
  { name: 'background check', pattern: /background[- ]check/i },
  { name: 'unproven pricing math', pattern: /\b16 posts\b/i },
];

/** Hiring Pro claims that are not part of the plan. */
export const BANNED_PRO_CLAIMS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'distance', pattern: /\bdistance\b/i },
  { name: 'team', pattern: /\bteam\b/i },
  { name: 'analytics', pattern: /\banalytics\b/i },
];
