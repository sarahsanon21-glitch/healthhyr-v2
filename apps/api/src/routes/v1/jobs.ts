import { Router, type Request } from 'express';
import { z } from 'zod';
import { jobInputSchema, missingJobFields, type JobDetail, type JobInput, type JobSummary } from '@healthhyr/shared';
import { HttpError, notFound, unauthorized } from '../../errors';
import { requireRole } from '../../middleware/requireRole';
import type { JobTransitions } from '../../services/jobTransitions';

// Database columns, written out so nothing else is ever selected or returned. Never employer_id or
// payment_id: the employer knows who they are, and a payment is not part of the job's content.
const SUMMARY = 'id, title, status, care_role, employment_type, city, state, published_at, expires_at, created_at, updated_at';
const DETAIL = `${SUMMARY}, description, zip, pay_min, pay_max, pay_period, easy_apply`;

const LIST_LIMIT = 100;

interface JobRow {
  id: string;
  title: string;
  status: JobSummary['status'];
  care_role: JobSummary['careRole'];
  employment_type: JobSummary['employmentType'];
  city: string;
  state: string;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  description?: string;
  zip?: string | null;
  pay_min?: number | string | null;
  pay_max?: number | string | null;
  pay_period?: JobDetail['payPeriod'];
  easy_apply?: boolean;
}

const toSummary = (row: JobRow): JobSummary => ({
  id: row.id,
  title: row.title,
  status: row.status,
  careRole: row.care_role,
  employmentType: row.employment_type,
  city: row.city,
  state: row.state,
  publishedAt: row.published_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const number = (value: number | string | null | undefined): number | null => (value === null || value === undefined ? null : Number(value));

function toDetail(row: JobRow): JobDetail {
  const detail = {
    ...toSummary(row),
    description: row.description ?? '',
    zip: row.zip ?? null,
    payMin: number(row.pay_min),
    payMax: number(row.pay_max),
    payPeriod: row.pay_period ?? null,
    easyApply: row.easy_apply ?? true,
  };
  return { ...detail, missingFields: missingJobFields(detail) };
}

const jobId = (value: unknown): string => {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw notFound();
  return parsed.data;
};

const LOCKED = () => new HttpError(409, 'job_locked', 'Cancel checkout before editing this job.');

interface DbError {
  code?: string;
  message?: string;
}

/** The database's own rules, if one is ever hit despite the checks above, become a friendly answer. */
function refuse(error: DbError, action: string): never {
  if (error.code === '23514') throw new HttpError(400, 'validation_error', 'One of the values is not allowed.');
  if (/cancel checkout/i.test(error.message ?? '')) throw LOCKED();
  throw new Error(`Could not ${action}`, { cause: error });
}

/** The columns an employer may write, from the validated input. Never status, payment, dates or owner. */
const columns = (input: JobInput) => ({
  title: input.title,
  description: input.description,
  care_role: input.careRole,
  employment_type: input.employmentType,
  city: input.city,
  state: input.state,
  zip: input.zip,
  pay_min: input.payMin,
  pay_max: input.payMax,
  pay_period: input.payPeriod,
  easy_apply: input.easyApply,
});

/**
 * An employer's jobs. Employers only.
 *
 * Creating, editing, listing and deleting use the per-request client that carries the employer's own
 * token, so row-level security and the database guard decide what is allowed, and every query also
 * filters by the employer's own id from the verified token. Closing, reopening and cancelling
 * checkout are server-only database functions, so they go through `transitions`, which checks
 * ownership in code.
 */
export function jobsRouter(transitions: JobTransitions): Router {
  /** The employer's own job, in full. 404 if it does not exist or is not theirs. */
  async function loadOwn(req: Request, id: string): Promise<JobDetail> {
    if (!req.auth) throw unauthorized();
    const { data, error } = await req.auth.db.from('jobs').select(DETAIL).eq('id', id).eq('employer_id', req.auth.userId).maybeSingle();
    if (error) throw new Error('Could not load the job', { cause: error });
    if (!data) throw notFound();
    return toDetail(data as unknown as JobRow);
  }

  return Router()
    .use('/employer/jobs', requireRole('employer'))

    .get('/employer/jobs', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const { data, error } = await req.auth.db
        .from('jobs')
        .select(SUMMARY)
        .eq('employer_id', req.auth.userId)
        .order('updated_at', { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error('Could not list jobs', { cause: error });
      res.json({ jobs: ((data ?? []) as unknown as JobRow[]).map(toSummary) });
    })

    .post('/employer/jobs', async (req, res) => {
      if (!req.auth) throw unauthorized();
      // Strict: status, payment, dates, the owner and unknown fields are refused. New jobs are drafts.
      const input = jobInputSchema.parse(req.body);
      const { data, error } = await req.auth.db
        .from('jobs')
        .insert({ employer_id: req.auth.userId, ...columns(input) })
        .select(DETAIL)
        .maybeSingle();
      if (error) refuse(error, 'create the job');
      if (!data) throw new Error('The job was not created');
      res.status(201).json(toDetail(data as unknown as JobRow));
    })

    .get('/employer/jobs/:id', async (req, res) => {
      res.json(await loadOwn(req, jobId(req.params.id)));
    })

    .put('/employer/jobs/:id', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const id = jobId(req.params.id);
      const input = jobInputSchema.parse(req.body);

      // Required fields are locked while the job waits for payment. The database refuses the change
      // too; asking first gives a clear answer without relying on an error message.
      const current = await loadOwn(req, id);
      if (current.status === 'pending_payment') throw LOCKED();

      const { data, error } = await req.auth.db
        .from('jobs')
        .update(columns(input))
        .eq('id', id)
        .eq('employer_id', req.auth.userId)
        .select(DETAIL)
        .maybeSingle();
      if (error) refuse(error, 'save the job');
      if (!data) throw notFound();
      res.json(toDetail(data as unknown as JobRow));
    })

    .delete('/employer/jobs/:id', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const id = jobId(req.params.id);
      const current = await loadOwn(req, id);
      if (current.status !== 'draft') {
        throw new HttpError(409, 'job_not_deletable', 'Only a draft can be deleted. Close a published job instead.');
      }
      const { data, error } = await req.auth.db.from('jobs').delete().eq('id', id).eq('employer_id', req.auth.userId).select('id');
      if (error) throw new Error('Could not delete the job', { cause: error });
      // A draft that has payment history (a cancelled checkout) is kept: payment history is never deleted.
      if (!data || data.length === 0) {
        throw new HttpError(409, 'job_not_deletable', 'This job has payment history, so it cannot be deleted.');
      }
      res.status(204).end();
    })

    .post('/employer/jobs/:id/close', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const id = jobId(req.params.id);
      await transitions.close(req.auth.userId, id);
      res.json(await loadOwn(req, id));
    })

    .post('/employer/jobs/:id/reopen', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const id = jobId(req.params.id);
      await transitions.reopen(req.auth.userId, id);
      res.json(await loadOwn(req, id));
    })

    // Today this returns the job to a draft in the database. When checkout exists (step 14), the
    // open Stripe session is expired first, in the same step of the flow.
    .post('/employer/jobs/:id/cancel-checkout', async (req, res) => {
      if (!req.auth) throw unauthorized();
      const id = jobId(req.params.id);
      await transitions.cancelCheckout(req.auth.userId, id);
      res.json(await loadOwn(req, id));
    });
}
