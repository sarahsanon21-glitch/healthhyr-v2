import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_SLUG_MAX_LENGTH, COMPANY_SLUG_PATTERN, type PublicCompany } from '@healthhyr/shared';
import { notFound } from '../../errors';

// Database columns, written out so nothing else is ever selected. Never the id.
const COLUMNS = 'company_name, description, website, logo_url, industry, company_size, city, state';

/**
 * The database lets an employer write the website column directly, so the value is not trusted:
 * only a real http or https address is passed on, anything else (javascript:, data:, text) is
 * dropped.
 */
function webAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Routes anyone can call, signed in or not. Mounted before authentication, so there is no
 * `req.auth` here. They use the anon client, so row-level security decides what is visible.
 *
 * Every response is built field by field from an explicit allowlist. A column added to the table
 * later does not appear here until someone adds it on purpose, and a test fails if any other
 * field shows up.
 */
export function publicRouter(anon: SupabaseClient): Router {
  return Router().get('/companies/:slug', async (req, res) => {
    const slug = req.params.slug;
    if (typeof slug !== 'string' || slug.length > COMPANY_SLUG_MAX_LENGTH || !COMPANY_SLUG_PATTERN.test(slug)) throw notFound();

    // `is_listed` is asked for explicitly as well as being enforced by row-level security, so a
    // company still on the default name answers exactly like a company that does not exist.
    const { data, error } = await anon.from('employer_profiles').select(COLUMNS).eq('slug', slug).eq('is_listed', true).maybeSingle();
    if (error) throw new Error('Could not load the company page', { cause: error });
    if (!data) throw notFound();

    const row = data as Record<string, string | null>;
    const company: PublicCompany = {
      companyName: row.company_name as string,
      description: row.description ?? null,
      website: webAddress(row.website),
      logoUrl: row.logo_url ?? null,
      industry: row.industry ?? null,
      companySize: row.company_size ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
    };
    res.json(company);
  });
}
