// Job state changes that no user may perform directly: close, reopen and cancel checkout.
//
// The database exposes them only as server-only functions (executable by the service role). An
// employer's own token cannot call them, and cannot set `status`, `payment_id`, `published_at` or
// `expires_at` by writing to the table either. So these run here, with the service-role client that
// server.ts builds and hands in.
//
// The service role bypasses row-level security, so ownership is checked IN CODE first: the job must
// belong to the employer (their id comes from the verified token, never from the request), and the
// SQL function is given the same employer id and checks it again.
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, notFound } from '../errors';

export type ReopenOutcome = 'published' | 'draft';

export interface JobTransitions {
  /** published -> closed (no refund). */
  close(employerId: string, jobId: string): Promise<void>;
  /**
   * closed with an end date in the future -> published, no payment, same end date;
   * expired, or closed past its end date -> draft, which needs a new payment.
   */
  reopen(employerId: string, jobId: string): Promise<ReopenOutcome>;
  /** pending_payment -> draft, and the open payment is cancelled. Refused once the payment has gone through. */
  cancelCheckout(employerId: string, jobId: string): Promise<void>;
}

interface DbError {
  code?: string;
  message?: string;
}

/** The reason is the text after the first colon in the function's error message. */
const reasonOf = (error: DbError): string => (error.message ?? '').split(':')[1]?.trim() ?? '';

const REFUSED: Record<string, Record<string, HttpError>> = {
  close_job: {
    job_wrong_status: new HttpError(409, 'job_not_published', 'Only a published job can be closed.'),
  },
  reopen_job: {
    job_not_found: notFound(),
    job_wrong_status: new HttpError(409, 'job_not_reopenable', 'Only a closed or expired job can be reopened.'),
  },
  cancel_checkout: {
    payment_succeeded: new HttpError(409, 'payment_succeeded', 'This payment has already gone through, so checkout cannot be cancelled.'),
    job_not_pending_payment: new HttpError(409, 'not_waiting_for_payment', 'This job is not waiting for payment.'),
  },
};

export function createJobTransitions(service: SupabaseClient): JobTransitions {
  /** Ownership, checked in code because the service role skips row-level security. */
  async function requireOwnJob(employerId: string, jobId: string): Promise<void> {
    const { data, error } = await service.from('jobs').select('id').eq('id', jobId).eq('employer_id', employerId).maybeSingle();
    if (error) throw new Error('Could not check the job', { cause: error });
    if (!data) throw notFound();
  }

  async function call(fn: 'close_job' | 'reopen_job' | 'cancel_checkout', employerId: string, jobId: string): Promise<unknown> {
    await requireOwnJob(employerId, jobId);
    const { data, error } = await service.rpc(fn, { p_job: jobId, p_employer: employerId });
    if (error) {
      // HY003 (cancel) and HY004 (close, reopen) are refusals we expect callers to cause.
      if (error.code === 'HY003' || error.code === 'HY004') {
        const mapped = REFUSED[fn]?.[reasonOf(error)];
        if (mapped) throw mapped;
      }
      throw new Error(`Job transition ${fn} failed`, { cause: error });
    }
    return data;
  }

  return {
    async close(employerId, jobId) {
      await call('close_job', employerId, jobId);
    },

    async reopen(employerId, jobId) {
      const outcome = await call('reopen_job', employerId, jobId);
      if (outcome !== 'published' && outcome !== 'draft') throw new Error('reopen_job returned an unexpected value');
      return outcome;
    },

    async cancelCheckout(employerId, jobId) {
      await call('cancel_checkout', employerId, jobId);
    },
  };
}
