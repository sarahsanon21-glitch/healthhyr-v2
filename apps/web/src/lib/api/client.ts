// A small client for the HealthHyr API (the Express server). It only ever sends the person's own
// access token. It never sends cookies, and it never shows a server error message it did not expect.
import {
  COMPANY_SLUG_MAX_LENGTH,
  COMPANY_SLUG_PATTERN,
  companyProfileResponseSchema,
  jobDetailSchema,
  jobListSchema,
  meResponseSchema,
  publicCompanySchema,
  type CompanyProfileInput,
  type CompanyProfileResponse,
  type JobDetail,
  type JobInputBody,
  type JobSummary,
  type MeResponse,
  type PublicCompany,
} from '@healthhyr/shared';

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    /** Which fields the server found fault with (for a 400 validation_error). */
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  /** Who am I? The role in the answer comes from the database, not from the browser. */
  getMe(): Promise<MeResponse>;
  /** The signed-in employer's own company profile. */
  getMyCompany(): Promise<CompanyProfileResponse>;
  /** Saves the employer's company profile (replaces every editable field). */
  saveMyCompany(input: Partial<CompanyProfileInput> & { companyName: string }): Promise<CompanyProfileResponse>;

  /** The employer's own jobs, newest change first. */
  listJobs(): Promise<JobSummary[]>;
  /** One of the employer's jobs, in full. */
  getJob(id: string): Promise<JobDetail>;
  /** Creates a draft. */
  createJob(input: JobInputBody): Promise<JobDetail>;
  /** Saves changes to a job (replaces every editable field). Refused while the job waits for payment. */
  updateJob(id: string, input: JobInputBody): Promise<JobDetail>;
  /** Deletes a draft. */
  deleteJob(id: string): Promise<void>;
  /** Closes a published job. */
  closeJob(id: string): Promise<JobDetail>;
  /** Reopens a closed or expired job. The answer shows whether it is live again or a draft that needs a new payment. */
  reopenJob(id: string): Promise<JobDetail>;
  /** Cancels checkout for a job that is waiting for payment, returning it to a draft. */
  cancelCheckout(id: string): Promise<JobDetail>;
}

export interface ApiClientOptions {
  /** For example https://api.healthhyr.com. The /api/v1 prefix is added here. */
  baseUrl: string;
  /** Returns the current access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const API_PREFIX = '/api/v1';
const cap = (value: unknown, max: number): string | undefined => (typeof value === 'string' ? value.slice(0, max) : undefined);

const BAD_RESPONSE = () => new ApiError(502, 'bad_response', 'The server sent an answer we do not understand.');

function readIssues(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    const path = cap((item as { path?: unknown } | null)?.path, 100);
    const message = cap((item as { message?: unknown } | null)?.message, 200);
    return path !== undefined && message !== undefined ? [{ path, message }] : [];
  });
}

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

/** Sends one request and returns the parsed JSON, or throws an ApiError with a safe message. */
async function send(fetchImpl: typeof fetch, url: string, init: { method: Method; token?: string; body?: unknown }): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method,
      headers: {
        Accept: 'application/json',
        ...(init.token && { Authorization: `Bearer ${init.token}` }),
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach HealthHyr.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown; requestId?: unknown; issues?: unknown } } | undefined)?.error;
    throw new ApiError(
      response.status,
      cap(error?.code, 64) ?? 'unknown',
      cap(error?.message, 200) ?? 'The request failed.',
      cap(error?.requestId, 64),
      readIssues(error?.issues),
    );
  }
  return { status: response.status, body };
}

export function createApiClient({ baseUrl, getAccessToken, fetchImpl = fetch }: ApiClientOptions): ApiClient {
  const root = `${baseUrl.replace(/\/$/, '')}${API_PREFIX}`;

  async function request(path: string, method: Method, body?: unknown): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, 'no_session', 'You are not signed in.');
    return (await send(fetchImpl, `${root}${path}`, { method, token, ...(body !== undefined && { body }) })).body;
  }

  /** Reads an answer with a schema, so a surprising server answer is an error and not a broken screen. */
  const parse = <T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw BAD_RESPONSE();
    return parsed.data;
  };

  /** A job id goes into the address, so only a plain id is allowed. */
  const jobPath = (id: string, suffix = ''): string => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'not_found', 'Not found.');
    return `/employer/jobs/${id}${suffix}`;
  };

  return {
    async getMe() {
      return parse(meResponseSchema, await request('/me', 'GET'));
    },

    async getMyCompany() {
      return parse(companyProfileResponseSchema, await request('/employer/company', 'GET'));
    },

    async saveMyCompany(input) {
      return parse(companyProfileResponseSchema, await request('/employer/company', 'PUT', input));
    },

    async listJobs() {
      return parse(jobListSchema, await request('/employer/jobs', 'GET')).jobs;
    },

    async getJob(id) {
      return parse(jobDetailSchema, await request(jobPath(id), 'GET'));
    },

    async createJob(input) {
      return parse(jobDetailSchema, await request('/employer/jobs', 'POST', input));
    },

    async updateJob(id, input) {
      return parse(jobDetailSchema, await request(jobPath(id), 'PUT', input));
    },

    async deleteJob(id) {
      await request(jobPath(id), 'DELETE');
    },

    async closeJob(id) {
      return parse(jobDetailSchema, await request(jobPath(id, '/close'), 'POST'));
    },

    async reopenJob(id) {
      return parse(jobDetailSchema, await request(jobPath(id, '/reopen'), 'POST'));
    },

    async cancelCheckout(id) {
      return parse(jobDetailSchema, await request(jobPath(id, '/cancel-checkout'), 'POST'));
    },
  };
}

/** For pages anyone can open, signed in or not. It never sends a token. */
export interface PublicApiClient {
  /** A listed company's public page data, or null when there is no such page (including "not public yet"). */
  getCompany(slug: string): Promise<PublicCompany | null>;
}

export function createPublicApiClient({ baseUrl, fetchImpl = fetch }: { baseUrl: string; fetchImpl?: typeof fetch }): PublicApiClient {
  const root = `${baseUrl.replace(/\/$/, '')}${API_PREFIX}`;

  return {
    async getCompany(slug) {
      // Anything that could not be a slug cannot be a page, so no request is made.
      if (slug.length > COMPANY_SLUG_MAX_LENGTH || !COMPANY_SLUG_PATTERN.test(slug)) return null;
      try {
        const { body } = await send(fetchImpl, `${root}/public/companies/${slug}`, { method: 'GET' });
        const parsed = publicCompanySchema.safeParse(body);
        if (!parsed.success) throw BAD_RESPONSE();
        return parsed.data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}
