// Test doubles for the website's auth layer.
import type { CompanyProfileResponse, JobDetail, JobSummary, UserRole } from '@healthhyr/shared';
import { vi } from 'vitest';
import { ApiError, type ApiClient } from '../../src/lib/api/client';
import { createAuthService } from '../../src/lib/auth/service';
import type { AuthBackend, AuthService, AuthState, BackendResult } from '../../src/lib/auth/types';

export const USER_ID = '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10';
export const JOB_ID = '7b1e2c3d-4a5f-4b6c-8d7e-9f0a1b2c3d4e';

export const ok: BackendResult = { ok: true };
export const backendError = (code: string, message = 'raw provider message', status?: number): BackendResult => ({
  ok: false,
  error: { code, message, ...(status !== undefined && { status }) },
});

type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> & T[K] };

export interface FakeBackend extends Mocked<AuthBackend> {
  /** Simulates the provider reporting a session change (another tab, expiry, sign-out). */
  emit: (change: 'signed_in' | 'signed_out') => void;
}

/**
 * A sign-in provider that does nothing and succeeds. Override the pieces a test cares about.
 * Every method, overridden or not, is a spy, so a test can check what was called and with what.
 */
export function makeBackend(overrides: Partial<AuthBackend> = {}): FakeBackend {
  let listener: ((change: 'signed_in' | 'signed_out') => void) | undefined;
  const defaults = {
    accessToken: async () => null,
    refresh: async () => 'refreshed-token',
    signIn: async () => ok,
    signUp: async () => ({ ok: true as const, sessionStarted: false }),
    confirmSignUp: async () => ok,
    resendSignUpCode: async () => ok,
    requestPasswordReset: async () => ok,
    verifyRecoveryCode: async () => ok,
    updatePassword: async () => ok,
    signOut: async () => {},
    onSessionChange: (next: (change: 'signed_in' | 'signed_out') => void) => {
      listener = next;
      return () => {};
    },
  };
  const merged = { ...defaults, ...overrides } as Record<string, (...args: never[]) => unknown>;
  const spies = Object.fromEntries(Object.entries(merged).map(([name, fn]) => [name, vi.fn(fn)]));
  return { ...spies, emit: (change: 'signed_in' | 'signed_out') => listener?.(change) } as unknown as FakeBackend;
}

export interface FakeApi extends ApiClient {
  getMe: ReturnType<typeof vi.fn> & ApiClient['getMe'];
  getMyCompany: ReturnType<typeof vi.fn> & ApiClient['getMyCompany'];
  saveMyCompany: ReturnType<typeof vi.fn> & ApiClient['saveMyCompany'];
  listJobs: ReturnType<typeof vi.fn> & ApiClient['listJobs'];
  getJob: ReturnType<typeof vi.fn> & ApiClient['getJob'];
  createJob: ReturnType<typeof vi.fn> & ApiClient['createJob'];
  updateJob: ReturnType<typeof vi.fn> & ApiClient['updateJob'];
  deleteJob: ReturnType<typeof vi.fn> & ApiClient['deleteJob'];
  closeJob: ReturnType<typeof vi.fn> & ApiClient['closeJob'];
  reopenJob: ReturnType<typeof vi.fn> & ApiClient['reopenJob'];
  cancelCheckout: ReturnType<typeof vi.fn> & ApiClient['cancelCheckout'];
}

/** A company profile as the API returns it. */
export const makeCompany = (fields: Partial<CompanyProfileResponse> = {}): CompanyProfileResponse => ({
  companyName: 'My company',
  description: null,
  website: null,
  logoUrl: null,
  industry: null,
  companySize: null,
  city: null,
  state: null,
  isListed: false,
  slug: null,
  ...fields,
});

/** A job as the API returns it in full. */
export const makeJob = (fields: Partial<JobDetail> = {}): JobDetail => ({
  id: JOB_ID,
  title: 'Home health aide',
  status: 'draft',
  careRole: 'hha',
  employmentType: 'part_time',
  city: 'Austin',
  state: 'TX',
  publishedAt: null,
  expiresAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  description: 'Support clients with daily living activities in their homes across the county, including meals.',
  zip: null,
  payMin: null,
  payMax: null,
  payPeriod: null,
  easyApply: true,
  missingFields: [],
  ...fields,
});

/** A job as the API returns it in a list. */
export const makeSummary = (fields: Partial<JobSummary> = {}): JobSummary => {
  const { description: _d, zip: _z, payMin: _a, payMax: _b, payPeriod: _c, easyApply: _e, missingFields: _m, ...summary } = makeJob(fields);
  return summary;
};

type Answer<T, A extends unknown[] = []> = T | ApiError | ((...args: A) => T);

/** What a fake API method answers: a value, an ApiError to throw, or a function. */
async function answer<T, A extends unknown[]>(value: Answer<T, A>, args: A): Promise<T> {
  if (value instanceof ApiError) throw value;
  return typeof value === 'function' ? (value as (...a: A) => T)(...args) : value;
}

export interface JobsStub {
  list?: Answer<JobSummary[]>;
  get?: Answer<JobDetail, [string]>;
  create?: Answer<JobDetail, [Record<string, unknown>]>;
  update?: Answer<JobDetail, [string, Record<string, unknown>]>;
  remove?: ApiError;
  close?: Answer<JobDetail, [string]>;
  reopen?: Answer<JobDetail, [string]>;
  cancel?: Answer<JobDetail, [string]>;
}

/**
 * An API that answers GET /api/v1/me with the given role. By default, saving a company returns what
 * was sent (as the API would, with the listing decided like the database trigger does), and the job
 * methods answer from `jobs`, or with sensible defaults.
 */
export function makeApi(
  role: UserRole | ApiError = 'seeker',
  company: { load?: CompanyProfileResponse | ApiError; save?: CompanyProfileResponse | ApiError | ((input: Record<string, unknown>) => CompanyProfileResponse) } = {},
  jobs: JobsStub = {},
): FakeApi {
  const getMe = vi.fn(async () => {
    if (role instanceof ApiError) throw role;
    return { id: USER_ID, role };
  });
  const getMyCompany = vi.fn(async () => {
    if (company.load instanceof ApiError) throw company.load;
    return company.load ?? makeCompany();
  });
  const saveMyCompany = vi.fn(async (input: Record<string, unknown>) => {
    const save = company.save;
    if (save instanceof ApiError) throw save;
    if (typeof save === 'function') return save(input);
    if (save) return save;
    const name = String(input.companyName ?? '');
    const listed = name.trim() !== '' && name !== 'My company';
    return makeCompany({
      companyName: name,
      description: (input.description as string | null | undefined) ?? null,
      website: (input.website as string | null | undefined) ?? null,
      industry: (input.industry as string | null | undefined) ?? null,
      companySize: (input.companySize as string | null | undefined) ?? null,
      city: (input.city as string | null | undefined) ?? null,
      state: (input.state as string | null | undefined) ?? null,
      isListed: listed,
      slug: listed ? 'sunrise-home-care-3f0c9a' : null,
    });
  });

  const listJobs = vi.fn(async () => answer(jobs.list ?? [], []));
  const getJob = vi.fn(async (id: string) => answer(jobs.get ?? makeJob({ id }), [id]));
  const createJob = vi.fn(async (input: Record<string, unknown>) => answer(jobs.create ?? makeJob({ title: String(input.title ?? '') }), [input]));
  const updateJob = vi.fn(async (id: string, input: Record<string, unknown>) =>
    answer(jobs.update ?? makeJob({ id, title: String(input.title ?? ''), description: String(input.description ?? '') }), [id, input]),
  );
  const deleteJob = vi.fn(async () => {
    if (jobs.remove) throw jobs.remove;
  });
  const closeJob = vi.fn(async (id: string) => answer(jobs.close ?? makeJob({ id, status: 'closed' }), [id]));
  const reopenJob = vi.fn(async (id: string) => answer(jobs.reopen ?? makeJob({ id, status: 'draft' }), [id]));
  const cancelCheckout = vi.fn(async (id: string) => answer(jobs.cancel ?? makeJob({ id, status: 'draft' }), [id]));

  return { getMe, getMyCompany, saveMyCompany, listJobs, getJob, createJob, updateJob, deleteJob, closeJob, reopenJob, cancelCheckout } as unknown as FakeApi;
}

/** The real auth service wired to fake backend and API: the whole sign-in logic, no network. */
export function makeRealAuth(options: { role?: UserRole | ApiError; backend?: Partial<AuthBackend> } = {}) {
  const backend = makeBackend(options.backend);
  const api = makeApi(options.role ?? 'seeker');
  const service = createAuthService({ backend, api });
  return { service, backend, api };
}

/** A fake auth service whose state a test sets by hand. For testing guards and screens. */
export function makeFakeService(initial: Partial<AuthState> = {}) {
  let state: AuthState = { status: 'signedOut', user: null, message: null, ...initial };
  const listeners = new Set<() => void>();
  const set = (next: Partial<AuthState>) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };
  const service = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    signIn: vi.fn(async () => ({ ok: true as const })),
    signUp: vi.fn(async () => ({ ok: true as const, next: 'confirm_email' as const })),
    confirmSignUp: vi.fn(async () => ({ ok: true as const })),
    resendSignUpCode: vi.fn(async () => ({ ok: true as const })),
    requestPasswordReset: vi.fn(async () => ({ ok: true as const })),
    resetPassword: vi.fn(async () => ({ ok: true as const })),
    signOut: vi.fn(async () => {
      set({ status: 'signedOut', user: null });
    }),
  };
  return { service: service as unknown as AuthService & typeof service, set };
}

export const signedIn = (role: UserRole): Partial<AuthState> => ({ status: 'signedIn', user: { id: USER_ID, role }, message: null });
