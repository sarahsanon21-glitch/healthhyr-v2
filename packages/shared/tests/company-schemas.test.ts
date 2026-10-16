import { describe, expect, it } from 'vitest';
import {
  COMPANY_SIZES,
  COMPANY_SLUG_PATTERN,
  PUBLIC_COMPANY_FIELDS,
  companyProfileInputSchema,
  companyProfileResponseSchema,
  publicCompanySchema,
} from '../src';

describe('the public company allowlist', () => {
  it('is exactly the eight fields the page may show, and never the id or the listing flag', () => {
    expect([...PUBLIC_COMPANY_FIELDS]).toEqual(['companyName', 'description', 'website', 'logoUrl', 'industry', 'companySize', 'city', 'state']);
    for (const never of ['id', 'slug', 'isListed', 'employerId', 'email', 'stripeCustomerId']) {
      expect(PUBLIC_COMPANY_FIELDS).not.toContain(never);
    }
  });

  it('the public schema has exactly those keys and strips anything else', () => {
    expect(Object.keys(publicCompanySchema.shape).sort()).toEqual([...PUBLIC_COMPANY_FIELDS].sort());
    const parsed = publicCompanySchema.parse({
      companyName: 'A',
      description: null,
      website: null,
      logoUrl: null,
      industry: null,
      companySize: null,
      city: null,
      state: null,
      id: 'x',
      slug: 'y',
      isListed: true,
    });
    expect(Object.keys(parsed).sort()).toEqual([...PUBLIC_COMPANY_FIELDS].sort());
  });

  it('an employer’s own view adds only the listing flag and the address', () => {
    expect(Object.keys(companyProfileResponseSchema.shape).sort()).toEqual([...PUBLIC_COMPANY_FIELDS, 'isListed', 'slug'].sort());
  });
});

describe('company profile input', () => {
  it('accepts a full profile and normalizes it', () => {
    const parsed = companyProfileInputSchema.parse({
      companyName: '  Sunrise  ',
      description: ' Care. ',
      website: 'https://sunrise.example.org',
      industry: 'Home health',
      companySize: '11-50',
      city: 'Fresno',
      state: 'CA',
    });
    expect(parsed).toEqual({
      companyName: 'Sunrise',
      description: 'Care.',
      website: 'https://sunrise.example.org',
      industry: 'Home health',
      companySize: '11-50',
      city: 'Fresno',
      state: 'CA',
    });
  });

  it('only the name is required; everything else becomes null', () => {
    expect(companyProfileInputSchema.parse({ companyName: 'Sunrise' })).toEqual({
      companyName: 'Sunrise',
      description: null,
      website: null,
      industry: null,
      companySize: null,
      city: null,
      state: null,
    });
  });

  it('empty and blank text becomes null', () => {
    const parsed = companyProfileInputSchema.parse({ companyName: 'S', description: '  ', website: '', industry: '', companySize: '', city: '', state: ' ' });
    expect(Object.values(parsed).filter((v) => v === null)).toHaveLength(6);
  });

  it.each([{}, { companyName: '' }, { companyName: '   ' }, { companyName: 'x'.repeat(121) }, { companyName: 5 }])('refuses a bad name: %j', (input) => {
    expect(companyProfileInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://x.org', 'example.org', 'https://', 'http//x.org', `https://${'a'.repeat(2050)}.org`])(
    'refuses the website %j',
    (website) => {
      expect(companyProfileInputSchema.safeParse({ companyName: 'S', website }).success).toBe(false);
    },
  );

  it.each(['http://example.org', 'https://example.org/path?x=1'])('accepts the website %s', (website) => {
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', website }).success).toBe(true);
  });

  it('accepts exactly the listed sizes', () => {
    for (const size of COMPANY_SIZES) expect(companyProfileInputSchema.safeParse({ companyName: 'S', companySize: size }).success).toBe(true);
    for (const size of ['12', 'small', '1-5', '10000']) expect(companyProfileInputSchema.safeParse({ companyName: 'S', companySize: size }).success).toBe(false);
  });

  it('enforces the text limits', () => {
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', description: 'x'.repeat(5000) }).success).toBe(true);
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', description: 'x'.repeat(5001) }).success).toBe(false);
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', industry: 'x'.repeat(101) }).success).toBe(false);
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', city: 'x'.repeat(101) }).success).toBe(false);
    expect(companyProfileInputSchema.safeParse({ companyName: 'S', state: 'x'.repeat(51) }).success).toBe(false);
  });

  it.each(['id', 'slug', 'isListed', 'is_listed', 'logoUrl', 'logo_url', 'employerId', 'role', 'createdAt', 'anything'])(
    'refuses the field %s, because the server decides it',
    (key) => {
      const result = companyProfileInputSchema.safeParse({ companyName: 'S', [key]: 'x' });
      expect(result.success).toBe(false);
    },
  );
});

describe('company slugs', () => {
  it.each(['sunrise-home-care-3f0c9a', 'a', 'a1-b2', 'x-123456'])('accepts %s', (slug) => {
    expect(COMPANY_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['', 'UPPER', 'a b', 'a_b', 'a--b', '-a', 'a-', '../x', 'a/b', 'a.b', 'é'])('refuses %j', (slug) => {
    expect(COMPANY_SLUG_PATTERN.test(slug)).toBe(false);
  });
});
