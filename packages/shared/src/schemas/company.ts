import { z } from 'zod';

/** Company sizes an employer can choose from. */
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** Lowercase words joined by single hyphens. The employer_profiles trigger produces slugs of this shape. */
export const COMPANY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMPANY_SLUG_MAX_LENGTH = 160;

/**
 * The ONLY fields a public company page may show. The public API route copies exactly these and
 * nothing else (never the id, the slug's owner, the listing flag or any other column), and a test
 * fails if any other field appears.
 */
export const PUBLIC_COMPANY_FIELDS = [
  'companyName',
  'description',
  'website',
  'logoUrl',
  'industry',
  'companySize',
  'city',
  'state',
] as const;

// An empty box means "nothing", so it is stored as null rather than an empty string.
const emptyToNull = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? null : value);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Use ${max} characters or fewer.`).nullable()).default(null);

/**
 * What an employer may change on their own company profile. Strict: any other field is refused, so
 * a client cannot send `is_listed`, `slug`, `id` or anything else the server decides. The logo is
 * not editable yet (uploads arrive with step 18).
 */
export const companyProfileInputSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Enter your company name.').max(120, 'Use 120 characters or fewer.'),
    description: optionalText(5000),
    website: z
      .preprocess(
        emptyToNull,
        z
          .url({ protocol: /^https?$/, error: 'Enter a web address that starts with https://' })
          .max(2048, 'That web address is too long.')
          .nullable(),
      )
      .default(null),
    industry: optionalText(100),
    companySize: z.preprocess(emptyToNull, z.enum(COMPANY_SIZES, { error: 'Choose a size from the list.' }).nullable()).default(null),
    city: optionalText(100),
    state: optionalText(50),
  })
  .strict();

export type CompanyProfileInput = z.infer<typeof companyProfileInputSchema>;

/** What the public company page receives. Unknown fields are dropped, never passed on. */
export const publicCompanySchema = z.object({
  companyName: z.string(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  industry: z.string().nullable(),
  companySize: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});

export type PublicCompany = z.infer<typeof publicCompanySchema>;

/** An employer's own view of their company profile (adds whether the page is public, and its address). */
export const companyProfileResponseSchema = publicCompanySchema.extend({
  isListed: z.boolean(),
  slug: z.string().nullable(),
});

export type CompanyProfileResponse = z.infer<typeof companyProfileResponseSchema>;
