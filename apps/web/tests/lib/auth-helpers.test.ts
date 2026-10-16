import { describe, expect, it } from 'vitest';
import { mapAuthError } from '../../src/lib/auth/errors';
import { homeForRole, safeNextPath, signInUrl } from '../../src/lib/auth/redirects';

describe('mapAuthError', () => {
  const cases: Array<[string, { code?: string; status?: number }, string]> = [
    ['wrong credentials', { code: 'invalid_credentials' }, 'invalid_credentials'],
    ['unconfirmed email', { code: 'email_not_confirmed' }, 'email_not_confirmed'],
    ['expired code', { code: 'otp_expired' }, 'invalid_code'],
    ['invalid code', { code: 'invalid_otp' }, 'invalid_code'],
    ['email rate limit', { code: 'over_email_send_rate_limit' }, 'rate_limited'],
    ['request rate limit', { code: 'over_request_rate_limit' }, 'rate_limited'],
    ['HTTP 429 with no code', { status: 429 }, 'rate_limited'],
    ['weak password', { code: 'weak_password' }, 'weak_password'],
    ['same password', { code: 'same_password' }, 'same_password'],
    ['existing user', { code: 'user_already_exists' }, 'cannot_create'],
    ['existing email', { code: 'email_exists' }, 'cannot_create'],
    ['sign-ups off', { code: 'signup_disabled' }, 'signups_disabled'],
    ['network failure', { code: 'network' }, 'network'],
    ['status 0', { status: 0 }, 'network'],
    ['anything else', { code: 'something_new' }, 'unknown'],
    ['nothing at all', {}, 'unknown'],
  ];

  it.each(cases)('%s', (_name, error, expected) => {
    expect(mapAuthError({ message: 'x', ...error }).code).toBe(expected);
  });

  it('never repeats the provider’s own wording', () => {
    for (const [, error] of cases) {
      const mapped = mapAuthError({ message: 'RAW-PROVIDER-WORDING User already registered', ...error });
      expect(mapped.message).not.toContain('RAW-PROVIDER-WORDING');
      expect(mapped.message.toLowerCase()).not.toContain('already registered');
    }
  });

  it('does not tell a visitor whether an address has an account', () => {
    expect(mapAuthError({ code: 'user_already_exists', message: 'x' }).message).toBe(
      'We could not create that account. If you already have one, sign in instead.',
    );
    expect(mapAuthError({ code: 'invalid_credentials', message: 'x' }).message).toBe('Email or password is incorrect.');
  });
});

describe('homeForRole', () => {
  it('sends each role to its own area', () => {
    expect(homeForRole('employer')).toBe('/dashboard');
    expect(homeForRole('seeker')).toBe('/profile');
    expect(homeForRole('admin')).toBe('/admin');
  });
});

describe('safeNextPath', () => {
  it.each(['/dashboard', '/jobs?role=cna&page=2', '/companies/sunrise-care-abc123', '/profile#education', '/a/b/c'])(
    'keeps the safe path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ['nothing', null],
    ['empty', ''],
    ['a relative path', 'dashboard'],
    ['another site', 'https://evil.example.test/login'],
    ['a protocol-relative address', '//evil.example.test'],
    ['a protocol-relative address after a slash and a backslash', '/\\evil.example.test'],
    ['a javascript address', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,hi'],
    ['a tab inside the address', '/\t/evil.example.test'],
    ['a newline', '/ok\nhttps://evil.example.test'],
    ['a carriage return', '/ok\rSet-Cookie: x'],
    ['a very long address', `/${'a'.repeat(600)}`],
    ['the sign-in page itself', '/sign-in'],
    ['the sign-up page with a query', '/sign-up?role=employer'],
    ['the reset page', '/forgot-password'],
  ])('ignores %s', (_name, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('signInUrl carries the page the visitor wanted, safely encoded', () => {
    expect(signInUrl('/dashboard')).toBe('/sign-in?next=%2Fdashboard');
    expect(signInUrl('/jobs?page=2')).toBe('/sign-in?next=%2Fjobs%3Fpage%3D2');
    expect(signInUrl('//evil.example.test')).toBe('/sign-in');
    expect(signInUrl('/sign-in')).toBe('/sign-in');
  });
});
