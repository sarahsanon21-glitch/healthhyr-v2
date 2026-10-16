// The server-only job transitions: ownership is checked in code, the SQL function is called with the
// caller's own employer id, and the database's refusals become friendly answers. The real functions
// run in tests/integration/jobs.test.ts; here a stand-in service client records what it is asked.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors';
import { createJobTransitions } from '../src/services/jobTransitions';

const EMPLOYER = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';

interface Calls {
  lookups: Array<[string, unknown][]>;
  rpcs: Array<{ fn: string; args: unknown }>;
}

function fakeService(options: { owns?: boolean; lookupError?: object; rpc?: { data?: unknown; error?: { code?: string; message?: string } } } = {}) {
  const calls: Calls = { lookups: [], rpcs: [] };
  const client = {
    from: (table: string) => {
      expect(table).toBe('jobs');
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => {
          calls.lookups.push(filters);
          if (options.lookupError) return { data: null, error: options.lookupError };
          return { data: options.owns === false ? null : { id: JOB }, error: null };
        },
      };
      return builder;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.rpcs.push({ fn, args });
      return { data: options.rpc?.data ?? null, error: options.rpc?.error ?? null };
    },
  };
  return { service: client as unknown as SupabaseClient, calls };
}

const fails = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error);

describe('ownership is checked in code before the server-only function runs', () => {
  it.each([
    ['close', 'close_job'],
    ['reopen', 'reopen_job'],
    ['cancelCheckout', 'cancel_checkout'],
  ] as const)('%s looks the job up by its id AND the employer, then calls %s with the same employer id', async (action, fn) => {
    const { service, calls } = fakeService({ rpc: { data: 'published' } });
    await createJobTransitions(service)[action](EMPLOYER, JOB);
    expect(calls.lookups).toEqual([
      [
        ['id', JOB],
        ['employer_id', EMPLOYER],
      ],
    ]);
    expect(calls.rpcs).toEqual([{ fn, args: { p_job: JOB, p_employer: EMPLOYER } }]);
  });

  it.each(['close', 'reopen', 'cancelCheckout'] as const)('%s on a job that is not the caller’s is a 404 and the function is never called', async (action) => {
    const { service, calls } = fakeService({ owns: false });
    const error = await fails(createJobTransitions(service)[action](EMPLOYER, JOB));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 404, code: 'not_found' });
    expect(calls.rpcs).toEqual([]);
  });

  it('a failed lookup is an unexpected error, never an answer that lets the call through', async () => {
    const { service, calls } = fakeService({ lookupError: { message: 'connection reset', code: '08006' } });
    const error = await fails(createJobTransitions(service).close(EMPLOYER, JOB));
    expect(error).not.toBeInstanceOf(HttpError);
    expect(calls.rpcs).toEqual([]);
  });
});

describe('the database’s refusals become friendly answers', () => {
  it.each([
    ['close', 'HY004', 'close_refused:job_wrong_status', 409, 'job_not_published'],
    ['reopen', 'HY004', 'reopen_refused:job_wrong_status', 409, 'job_not_reopenable'],
    ['reopen', 'HY004', 'reopen_refused:job_not_found', 404, 'not_found'],
    ['cancelCheckout', 'HY003', 'cancel_refused:payment_succeeded', 409, 'payment_succeeded'],
    ['cancelCheckout', 'HY003', 'cancel_refused:job_not_pending_payment', 409, 'not_waiting_for_payment'],
  ] as const)('%s: %s %s', async (action, sqlstate, text, status, code) => {
    const { service } = fakeService({ rpc: { error: { code: sqlstate, message: text } } });
    const error = await fails(createJobTransitions(service)[action](EMPLOYER, JOB));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status, code });
    expect(JSON.stringify({ message: (error as Error).message })).not.toContain('refused');
  });

  it('an unknown reason, or any other database error, is an unexpected error (a generic 500 for the caller)', async () => {
    for (const rpcError of [
      { code: 'HY004', message: 'close_refused:something_new' },
      { code: '42501', message: 'permission denied for function close_job' },
      { code: 'P0001', message: 'server only' },
    ]) {
      const { service } = fakeService({ rpc: { error: rpcError } });
      const error = await fails(createJobTransitions(service).close(EMPLOYER, JOB));
      expect(error).not.toBeInstanceOf(HttpError);
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe('reopen', () => {
  it.each(['published', 'draft'] as const)('returns what the database did: %s', async (outcome) => {
    const { service } = fakeService({ rpc: { data: outcome } });
    expect(await createJobTransitions(service).reopen(EMPLOYER, JOB)).toBe(outcome);
  });

  it.each([null, 'closed', 'expired', 5, {}])('refuses an answer it does not understand (%j)', async (data) => {
    const { service } = fakeService({ rpc: { data } });
    await expect(createJobTransitions(service).reopen(EMPLOYER, JOB)).rejects.toThrow('unexpected');
  });
});
