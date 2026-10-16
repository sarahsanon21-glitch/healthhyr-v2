import { describe, expect, it } from 'vitest';
import { BANNED_CLAIMS, BANNED_PRO_CLAIMS, PRICING_COPY, VISIBILITY_SWITCH_COPY } from '../src/copy';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('visibility switch copy', () => {
  it('is the approved text, word for word', () => {
    expect(VISIBILITY_SWITCH_COPY.description).toBe(
      'Hiring Pro is not live yet. If you turn this on, employers with Hiring Pro will be able to find your profile once it launches. Your phone, resume and home address are never shown. You can turn this off at any time.',
    );
  });
});

describe('pricing copy', () => {
  it('shows the approved prices', () => {
    expect(PRICING_COPY.payPerPost.price).toBe('$2.50');
    expect(PRICING_COPY.hiringPro.price).toBe('$39.99');
    expect(PRICING_COPY.hiringPro.badge).toBe('Coming soon');
  });

  it('lists the planned Hiring Pro features, labeled "Planned for launch"', () => {
    expect(PRICING_COPY.hiringPro.plannedLabel).toBe('Planned for launch');
    expect(PRICING_COPY.hiringPro.plannedFeatures).toEqual([
      'Opt-in candidate directory search',
      'Filters by role, certifications, availability, preferred shifts and city/state',
      'Up to 30 new job postings per billing period, each active 30 days',
      'Invite candidates to apply',
    ]);
  });

  it('carries the disclaimer', () => {
    expect(PRICING_COPY.disclaimer).toBe('Features do not guarantee applications or hires.');
  });

  it('makes no distance, team or analytics claims for Hiring Pro', () => {
    for (const text of strings(PRICING_COPY.hiringPro)) {
      for (const { name, pattern } of BANNED_PRO_CLAIMS) expect(text, name).not.toMatch(pattern);
    }
  });

  it('has no "16 posts" comparison line while Hiring Pro is not buyable', () => {
    for (const text of strings(PRICING_COPY)) expect(text).not.toMatch(/\b16 posts\b/i);
  });
});

describe('banned claims', () => {
  it('appear nowhere in approved copy', () => {
    for (const text of [...strings(PRICING_COPY), ...strings(VISIBILITY_SWITCH_COPY)]) {
      for (const { name, pattern } of BANNED_CLAIMS) expect(text, name).not.toMatch(pattern);
    }
  });

  it('actually catch the phrases they target', () => {
    expect('Verified employers').toMatch(BANNED_CLAIMS[0]!.pattern);
    expect('Background checked').toMatch(BANNED_CLAIMS[1]!.pattern);
    expect('16 posts = $40').toMatch(BANNED_CLAIMS[2]!.pattern);
  });
});
