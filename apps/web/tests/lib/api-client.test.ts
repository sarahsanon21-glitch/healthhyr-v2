import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../src/lib/api/client';

const ID = '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function client(fetchImpl: typeof fetch, token: string | null = 'the-access-token') {
  return createApiClient({ baseUrl: 'https://api.example.test/', getAccessToken: async () => token, fetchImpl });
}

describe('getMe', () => {
  it('calls GET /api/v1/me with the person’s own token and no cookies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: ID, role: 'employer' }));
    expect(await client(fetchImpl as unknown as typeof fetch).getMe()).toEqual({ id: ID, role: 'employer' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/me');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-access-token');
  });

  it('does not call the server at all when there is no token', async () => {
    const fetchImpl = vi.fn();
    await expect(client(fetchImpl as unknown as typeof fetch, null).getMe()).rejects.toMatchObject({ status: 401, code: 'no_session' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns the API’s error body into an ApiError with its code, message and request id', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'no_profile', message: 'Your account is not set up yet.', requestId: 'req-123' } }, 403));
    const error = await client(fetchImpl as unknown as typeof fetch).getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'no_profile', message: 'Your account is not set up yet.', requestId: 'req-123' });
  });

  it('caps what it takes from an error body, and ignores values of the wrong type', async () => {
    const huge = 'x'.repeat(5000);
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: huge, message: huge, requestId: 42 } }, 500));
    const error = (await client(fetchImpl as unknown as typeof fetch).getMe().catch((e: unknown) => e)) as ApiError;
    expect(error.code.length).toBe(64);
    expect(error.message.length).toBe(200);
    expect(error.requestId).toBeUndefined();
  });

  it('copes with an error that is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = (await client(fetchImpl as unknown as typeof fetch).getMe().catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 502, code: 'unknown', message: 'The request failed.' });
  });

  it('a network failure is status 0, code network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.1:4000');
    });
    const error = (await client(fetchImpl as unknown as typeof fetch).getMe().catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: 'network' });
    expect(error.message).not.toContain('ECONNREFUSED');
  });

  it('refuses an answer whose role is not one of the known roles', async () => {
    for (const body of [{ id: ID, role: 'superuser' }, { id: ID }, { id: 'nope', role: 'seeker' }, null, 'seeker']) {
      const fetchImpl = vi.fn(async () => jsonResponse(body));
      await expect(client(fetchImpl as unknown as typeof fetch).getMe()).rejects.toMatchObject({ status: 502, code: 'bad_response' });
    }
  });

  it('never puts the token in an error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'invalid_token', message: 'bad' } }, 401));
    const error = (await client(fetchImpl as unknown as typeof fetch).getMe().catch((e: unknown) => e)) as ApiError;
    expect(JSON.stringify({ message: error.message, code: error.code, stack: error.stack })).not.toContain('the-access-token');
  });
});
