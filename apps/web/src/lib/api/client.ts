// A small client for the HealthHyr API (the Express server). It only ever sends the person's own
// access token. It never sends cookies, and it never shows a server error message it did not expect.
import { meResponseSchema, type MeResponse } from '@healthhyr/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  /** Who am I? The role in the answer comes from the database, not from the browser. */
  getMe(): Promise<MeResponse>;
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

export function createApiClient({ baseUrl, getAccessToken, fetchImpl = fetch }: ApiClientOptions): ApiClient {
  async function request(path: string): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, 'no_session', 'You are not signed in.');

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${API_PREFIX}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
      const error = (body as { error?: { code?: unknown; message?: unknown; requestId?: unknown } } | undefined)?.error;
      throw new ApiError(
        response.status,
        cap(error?.code, 64) ?? 'unknown',
        cap(error?.message, 200) ?? 'The request failed.',
        cap(error?.requestId, 64),
      );
    }
    return body;
  }

  return {
    async getMe() {
      const parsed = meResponseSchema.safeParse(await request('/me'));
      if (!parsed.success) throw new ApiError(502, 'bad_response', 'The server sent an answer we do not understand.');
      return parsed.data;
    },
  };
}
