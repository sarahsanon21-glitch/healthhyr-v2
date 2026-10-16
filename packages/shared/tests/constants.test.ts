import { describe, expect, it } from 'vitest';
import {
  CONTACT_EMAIL,
  DEFAULT_COMPANY_NAME,
  HIRING_PRO,
  PAY_PER_POST,
  formatUsd,
  isListedCompanyName,
} from '../src/constants';

describe('prices (CLAUDE.md)', () => {
  it('Pay Per Post is $2.50 for 30 days', () => {
    expect(PAY_PER_POST.amountCents).toBe(250);
    expect(PAY_PER_POST.durationDays).toBe(30);
    expect(formatUsd(PAY_PER_POST.amountCents)).toBe('$2.50');
  });

  it('Hiring Pro is $39.99/month and coming soon', () => {
    expect(HIRING_PRO.amountCents).toBe(3999);
    expect(HIRING_PRO.interval).toBe('month');
    expect(HIRING_PRO.comingSoon).toBe(true);
    expect(formatUsd(HIRING_PRO.amountCents)).toBe('$39.99');
  });
});

describe('company listing rule', () => {
  it('treats the default name, blanks and null as not listed', () => {
    expect(isListedCompanyName(DEFAULT_COMPANY_NAME)).toBe(false);
    expect(isListedCompanyName('')).toBe(false);
    expect(isListedCompanyName('   ')).toBe(false);
    expect(isListedCompanyName(null)).toBe(false);
    expect(isListedCompanyName(undefined)).toBe(false);
  });

  it('lists any other non-blank name', () => {
    expect(isListedCompanyName('Sunrise Home Care')).toBe(true);
  });
});

describe('contact', () => {
  it('uses the support address', () => {
    expect(CONTACT_EMAIL).toBe('support@healthhyr.com');
  });
});
