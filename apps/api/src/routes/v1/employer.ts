import { Router } from 'express';
import { companyProfileInputSchema, type CompanyProfileResponse } from '@healthhyr/shared';
import { HttpError, notFound, unauthorized } from '../../errors';
import { requireRole } from '../../middleware/requireRole';

// Database columns, written out so nothing else is ever selected or returned.
const COLUMNS = 'company_name, description, website, logo_url, industry, company_size, city, state, is_listed, slug';

interface CompanyRow {
  company_name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
  is_listed: boolean;
  slug: string | null;
}

function toResponse(row: CompanyRow): CompanyProfileResponse {
  return {
    companyName: row.company_name,
    description: row.description,
    website: row.website,
    logoUrl: row.logo_url,
    industry: row.industry,
    companySize: row.company_size,
    city: row.city,
    state: row.state,
    isListed: row.is_listed,
    slug: row.slug,
  };
}

/**
 * The employer's own company profile. Employers only.
 *
 * Two layers keep an employer to their own row. The database (row-level security, through the
 * per-request client that carries their token) refuses any other row. And the code below filters by
 * the caller's own id from the verified token, never an id from the request, so it also holds if a
 * policy were ever loosened.
 */
export const employerRouter = Router()
  .use('/employer', requireRole('employer'))

  .get('/employer/company', async (req, res) => {
    if (!req.auth) throw unauthorized();
    const { data, error } = await req.auth.db.from('employer_profiles').select(COLUMNS).eq('id', req.auth.userId).maybeSingle();
    if (error) throw new Error('Could not load the company profile', { cause: error });
    if (!data) throw notFound();
    res.json(toResponse(data as unknown as CompanyRow));
  })

  .put('/employer/company', async (req, res) => {
    if (!req.auth) throw unauthorized();
    // Strict: `is_listed`, `slug`, `id`, the logo and anything else the server decides are refused.
    const input = companyProfileInputSchema.parse(req.body);

    const { data, error } = await req.auth.db
      .from('employer_profiles')
      .update({
        company_name: input.companyName,
        description: input.description,
        website: input.website,
        industry: input.industry,
        company_size: input.companySize,
        city: input.city,
        state: input.state,
      })
      .eq('id', req.auth.userId)
      .select(COLUMNS)
      .maybeSingle();

    if (error) {
      // The shared schema mirrors the database's CHECK constraints, so this is not expected. If the
      // database refuses a value anyway, the person gets a friendly answer, not the database's words.
      if (error.code === '23514') throw new HttpError(400, 'validation_error', 'One of the values is not allowed.');
      throw new Error('Could not save the company profile', { cause: error });
    }
    // No row means the database refused the change (or there is no profile): nothing was saved.
    if (!data) throw notFound();
    res.json(toResponse(data as unknown as CompanyRow));
  });
