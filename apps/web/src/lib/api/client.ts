// A small client for the HealthHyr API (the Express server). It only ever sends the person's own
// access token. It never sends cookies, and it never shows a server error message it did not expect.
import {
  COMPANY_SLUG_MAX_LENGTH,
  COMPANY_SLUG_PATTERN,
  companyProfileResponseSchema,
  meResponseSchema,
  publicCompanySchema,
  type CompanyProfileInput,
  type CompanyProfileResponse,
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

/** Sends one request and returns the parsed JSON, or throws an ApiError with a safe message. */
async function send(
  fetchImpl: typeof fetch,
  url: string,
  init: { method: 'GET' | 'PUT'; token?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
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

  async function request(path: string, method: 'GET' | 'PUT', body?: unknown): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, 'no_session', 'You are not signed in.');
    return (await send(fetchImpl, `${root}${path}`, { method, token, ...(body !== undefined && { body }) })).body;
  }

  return {
    async getMe() {
      const parsed = meResponseSchema.safeParse(await request('/me', 'GET'));
      if (!parsed.success) throw BAD_RESPONSE();
      return parsed.data;
    },

    async getMyCompany() {
      const parsed = companyProfileResponseSchema.safeParse(await request('/employer/company', 'GET'));
      if (!parsed.success) throw BAD_RESPONSE();
      return parsed.data;
    },

    async saveMyCompany(input) {
      const parsed = companyProfileResponseSchema.safeParse(await request('/employer/company', 'PUT', input));
      if (!parsed.success) throw BAD_RESPONSE();
      return parsed.data;
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
