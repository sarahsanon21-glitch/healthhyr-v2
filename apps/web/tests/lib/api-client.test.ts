import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, createPublicApiClient } from '../../src/lib/api/client';

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

const COMPANY = {
  companyName: 'Sunrise Home Care',
  description: null,
  website: null,
  logoUrl: null,
  industry: null,
  companySize: null,
  city: 'Fresno',
  state: null,
  isListed: true,
  slug: 'sunrise-home-care-3f0c9a',
};

describe('the employer company profile', () => {
  it('reads it with GET /api/v1/employer/company and the person’s token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(COMPANY));
    expect(await client(fetchImpl as unknown as typeof fetch).getMyCompany()).toEqual(COMPANY);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/employer/company');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-access-token');
  });

  it('saves it with PUT and a JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(COMPANY));
    await client(fetchImpl as unknown as typeof fetch).saveMyCompany({ companyName: 'Sunrise Home Care', city: 'Fresno' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/employer/company');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ companyName: 'Sunrise Home Care', city: 'Fresno' });
    expect(init.credentials).toBe('omit');
  });

  it('does not call the server without a token', async () => {
    const fetchImpl = vi.fn();
    await expect(client(fetchImpl as unknown as typeof fetch, null).saveMyCompany({ companyName: 'X' })).rejects.toMatchObject({ code: 'no_session' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps which fields the server found fault with, capped and checked', async () => {
    const body = {
      error: {
        code: 'validation_error',
        message: 'Some fields are not valid.',
        issues: [{ path: 'website', message: 'Enter a web address that starts with https://' }, { path: 5, message: 'ignored' }, 'junk'],
      },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body, 400));
    const error = (await client(fetchImpl as unknown as typeof fetch).saveMyCompany({ companyName: 'X' }).catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 400, code: 'validation_error' });
    expect(error.issues).toEqual([{ path: 'website', message: 'Enter a web address that starts with https://' }]);
  });

  it('refuses an answer that is not a company profile', async () => {
    for (const body of [{}, { companyName: 5 }, null, [COMPANY]]) {
      const fetchImpl = vi.fn(async () => jsonResponse(body));
      await expect(client(fetchImpl as unknown as typeof fetch).getMyCompany()).rejects.toMatchObject({ status: 502, code: 'bad_response' });
    }
  });
});

describe('the public API client (no sign-in)', () => {
  const PUBLIC = { companyName: 'Sunrise Home Care', description: null, website: null, logoUrl: null, industry: null, companySize: null, city: 'Fresno', state: 'CA' };
  const publicClient = (fetchImpl: typeof fetch) => createPublicApiClient({ baseUrl: 'https://api.example.test/', fetchImpl });

  it('asks GET /api/v1/public/companies/:slug and sends no token and no cookies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PUBLIC));
    expect(await publicClient(fetchImpl as unknown as typeof fetch).getCompany('sunrise-home-care-3f0c9a')).toEqual(PUBLIC);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/public/companies/sunrise-home-care-3f0c9a');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });

  it('drops any field that is not in the public allowlist', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...PUBLIC, id: ID, slug: 'x', isListed: true, owner_email: 'a@b.c' }));
    const company = await publicClient(fetchImpl as unknown as typeof fetch).getCompany('sunrise-home-care-3f0c9a');
    expect(Object.keys(company!).sort()).toEqual(['city', 'companyName', 'companySize', 'description', 'industry', 'logoUrl', 'state', 'website']);
  });

  it('a 404 is "no such page", not an error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'not_found', message: 'Not found.' } }, 404));
    expect(await publicClient(fetchImpl as unknown as typeof fetch).getCompany('no-such-company-abc123')).toBeNull();
  });

  it('other failures are still errors (the API being down is not "not found")', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED');
    });
    await expect(publicClient(down as unknown as typeof fetch).getCompany('sunrise-home-care-3f0c9a')).rejects.toMatchObject({ status: 0, code: 'network' });
    const broken = vi.fn(async () => jsonResponse({ error: { code: 'internal_error', message: 'x' } }, 500));
    await expect(publicClient(broken as unknown as typeof fetch).getCompany('sunrise-home-care-3f0c9a')).rejects.toMatchObject({ status: 500 });
  });

  it.each(['', 'UPPER', 'has space', '../etc', 'a/b', 'a--b', 'x'.repeat(161)])('does not even ask the server for the address %j', async (slug) => {
    const fetchImpl = vi.fn();
    expect(await publicClient(fetchImpl as unknown as typeof fetch).getCompany(slug)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an answer that is not a company', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ nope: true }));
    await expect(publicClient(fetchImpl as unknown as typeof fetch).getCompany('sunrise-home-care-3f0c9a')).rejects.toMatchObject({ status: 502, code: 'bad_response' });
  });
});
