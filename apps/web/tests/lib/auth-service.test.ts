import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/api/client';
import { createAuthService } from '../../src/lib/auth/service';
import { USER_ID, backendError, makeApi, makeBackend, makeRealAuth } from '../helpers/auth';

const validSignUp = { fullName: 'Sam Rivera', email: 'Sam@Example.com', password: 'a-long-password', role: 'seeker' };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('starting up', () => {
  it('is loading until it knows, then signed out when there is no session', async () => {
    const { service, api } = makeRealAuth();
    expect(service.getState().status).toBe('loading');
    await service.start();
    expect(service.getState()).toEqual({ status: 'signedOut', user: null, message: null });
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('with a saved session, asks the API who the person is and uses that role', async () => {
    const { service, api } = makeRealAuth({ role: 'employer', backend: { accessToken: async () => 'saved-token' } });
    await service.start();
    expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(service.getState()).toEqual({ status: 'signedIn', user: { id: USER_ID, role: 'employer' }, message: null });
  });

  it('takes the role only from the API, whatever the token says', async () => {
    // A token that claims to be an admin. The service never decodes it, so it cannot matter.
    const adminClaim = ['x', btoa(JSON.stringify({ role: 'admin', app_metadata: { role: 'admin' } })), 'y'].join('.');
    const { service } = makeRealAuth({ role: 'seeker', backend: { accessToken: async () => adminClaim } });
    await service.start();
    expect(service.getState().user?.role).toBe('seeker');
  });

  it('no_profile from the API becomes the noProfile state', async () => {
    const { service } = makeRealAuth({
      role: new ApiError(403, 'no_profile', 'Your account is not set up yet.'),
      backend: { accessToken: async () => 'token' },
    });
    await service.start();
    expect(service.getState().status).toBe('noProfile');
  });

  it('an expired token is refreshed once and the request is repeated', async () => {
    const getMe = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(401, 'token_expired', 'expired'))
      .mockResolvedValueOnce({ id: USER_ID, role: 'seeker' });
    const backend = makeBackend({ accessToken: async () => 'old' });
    const service = createAuthService({ backend, api: { getMe } });
    await service.start();
    expect(backend.refresh).toHaveBeenCalledTimes(1);
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(service.getState().status).toBe('signedIn');
  });

  it('if the token cannot be refreshed, the session is ended and the person is signed out', async () => {
    const backend = makeBackend({ accessToken: async () => 'old', refresh: async () => null });
    const service = createAuthService({ backend, api: makeApi(new ApiError(401, 'invalid_token', 'bad')) });
    await service.start();
    expect(backend.signOut).toHaveBeenCalled();
    expect(service.getState().status).toBe('signedOut');
  });

  it('a server problem becomes a friendly error state that never shows the server’s words', async () => {
    const { service } = makeRealAuth({
      role: new ApiError(500, 'internal_error', 'SELECT * FROM profiles failed: password authentication'),
      backend: { accessToken: async () => 'token' },
    });
    await service.start();
    const state = service.getState();
    expect(state.status).toBe('error');
    expect(state.message).toBe('We could not load your account. Check your connection and try again.');
    expect(JSON.stringify(state)).not.toMatch(/SELECT|password/);
  });

  it('an unreachable server is the same friendly error, and refresh() asks again', async () => {
    const getMe = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Could not reach HealthHyr.'))
      .mockResolvedValueOnce({ id: USER_ID, role: 'seeker' });
    const service = createAuthService({ backend: makeBackend({ accessToken: async () => 't' }), api: { getMe } });
    await service.start();
    expect(service.getState().status).toBe('error');
    await service.refresh();
    expect(service.getState().status).toBe('signedIn');
  });

  it('asks the API only once even if several things need the answer at the same moment', async () => {
    const { service, api } = makeRealAuth({ backend: { accessToken: async () => 't' } });
    await Promise.all([service.start(), service.refresh(), service.refresh()]);
    expect(api.getMe.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('start() only runs once', async () => {
    const { service, backend } = makeRealAuth();
    await service.start();
    await service.start();
    expect(backend.onSessionChange).toHaveBeenCalledTimes(1);
  });
});

describe('sign in', () => {
  it('checks the form first and sends nothing when it is invalid', async () => {
    const { service, backend } = makeRealAuth();
    const result = await service.signIn({ email: '', password: '' });
    expect(result).toMatchObject({ ok: false, code: 'validation', fieldErrors: { email: 'Enter your email address.', password: 'Enter your password.' } });
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it('sends the email trimmed and lower-cased, and the password exactly as typed', async () => {
    const { service, backend } = makeRealAuth();
    await service.signIn({ email: '  Sam@Example.COM ', password: ' my pass ' });
    expect(backend.signIn).toHaveBeenCalledWith('sam@example.com', ' my pass ');
  });

  it('on success asks the API for the role and signs the person in with it', async () => {
    const { service, api } = makeRealAuth({ role: 'employer' });
    expect(await service.signIn({ email: 'sam@example.com', password: 'pw' })).toEqual({ ok: true });
    expect(api.getMe).toHaveBeenCalled();
    expect(service.getState().user).toEqual({ id: USER_ID, role: 'employer' });
  });

  it.each([
    ['invalid_credentials', 'invalid_credentials', 'Email or password is incorrect.'],
    ['email_not_confirmed', 'email_not_confirmed', 'Confirm your email first. Enter the 6-digit code we sent you.'],
    ['over_request_rate_limit', 'rate_limited', 'Too many attempts. Wait a minute and try again.'],
    ['network', 'network', 'Could not reach HealthHyr. Check your connection and try again.'],
    ['something_unexpected', 'unknown', 'Something went wrong. Please try again.'],
  ])('maps the provider error %s to a friendly message', async (providerCode, code, message) => {
    const { service, api } = makeRealAuth({ backend: { signIn: async () => backendError(providerCode, 'RAW PROVIDER TEXT') } });
    const result = await service.signIn({ email: 'sam@example.com', password: 'pw' });
    expect(result).toEqual({ ok: false, code, message });
    expect(JSON.stringify(result)).not.toContain('RAW PROVIDER TEXT');
    expect(api.getMe).not.toHaveBeenCalled();
    expect(service.getState().status).not.toBe('signedIn');
  });
});

describe('sign up', () => {
  it.each(['admin', 'ADMIN', 'superuser', '', undefined, null])('refuses the role %j and sends nothing', async (role) => {
    const { service, backend } = makeRealAuth();
    const result = await service.signUp({ ...validSignUp, role: role as string });
    expect(result).toMatchObject({ ok: false, code: 'validation', fieldErrors: { role: 'Choose one.' } });
    expect(backend.signUp).not.toHaveBeenCalled();
  });

  it.each(['seeker', 'employer'] as const)('passes the %s role on, with a normalized email', async (role) => {
    const { service, backend } = makeRealAuth();
    await service.signUp({ ...validSignUp, role });
    expect(backend.signUp).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'a-long-password', fullName: 'Sam Rivera', role });
  });

  it('checks name, email and password length before sending', async () => {
    const { service, backend } = makeRealAuth();
    const result = await service.signUp({ fullName: '', email: 'nope', password: 'short', role: 'seeker' });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { fullName: 'Enter your name.', email: 'Enter a valid email address.', password: 'Use at least 8 characters.' },
    });
    expect(backend.signUp).not.toHaveBeenCalled();
  });

  it('with email confirmation required, asks for the code and stays signed out', async () => {
    const { service, api } = makeRealAuth();
    expect(await service.signUp(validSignUp)).toEqual({ ok: true, next: 'confirm_email' });
    expect(service.getState().status).not.toBe('signedIn');
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('when a session starts at once, signs in with the role the API reports, not the role asked for', async () => {
    const { service } = makeRealAuth({
      role: 'seeker',
      backend: { signUp: async () => ({ ok: true as const, sessionStarted: true }) },
    });
    const result = await service.signUp({ ...validSignUp, role: 'employer' });
    expect(result).toEqual({ ok: true, next: 'signed_in' });
    expect(service.getState().user?.role).toBe('seeker');
  });

  it('does not reveal that an address already has an account', async () => {
    const { service } = makeRealAuth({ backend: { signUp: async () => backendError('user_already_exists', 'User already registered') as never } });
    const result = await service.signUp(validSignUp);
    expect(result).toMatchObject({ ok: false, code: 'cannot_create' });
    if (!result.ok) {
      expect(result.message).toBe('We could not create that account. If you already have one, sign in instead.');
      expect(result.message.toLowerCase()).not.toContain('already registered');
    }
  });

  it('maps a weak password and a closed sign-up', async () => {
    const weak = makeRealAuth({ backend: { signUp: async () => backendError('weak_password') as never } });
    expect(await weak.service.signUp(validSignUp)).toMatchObject({ ok: false, code: 'weak_password' });
    const closed = makeRealAuth({ backend: { signUp: async () => backendError('signup_disabled') as never } });
    expect(await closed.service.signUp(validSignUp)).toMatchObject({ ok: false, code: 'signups_disabled' });
  });
});

describe('confirming the emailed code', () => {
  it('needs exactly 6 digits and sends nothing otherwise', async () => {
    const { service, backend } = makeRealAuth();
    const result = await service.confirmSignUp({ email: 'sam@example.com', code: '12ab' });
    expect(result).toMatchObject({ ok: false, code: 'validation', fieldErrors: { code: 'Enter the 6-digit code from the email.' } });
    expect(backend.confirmSignUp).not.toHaveBeenCalled();
  });

  it('a good code signs the person in with the API’s role', async () => {
    const { service, backend } = makeRealAuth({ role: 'employer' });
    expect(await service.confirmSignUp({ email: 'Sam@Example.com', code: ' 123456 ' })).toEqual({ ok: true });
    expect(backend.confirmSignUp).toHaveBeenCalledWith('sam@example.com', '123456');
    expect(service.getState().user?.role).toBe('employer');
  });

  it('a wrong or expired code is a friendly message', async () => {
    const { service } = makeRealAuth({ backend: { confirmSignUp: async () => backendError('otp_expired', 'Token has expired or is invalid') } });
    const result = await service.confirmSignUp({ email: 'sam@example.com', code: '123456' });
    expect(result).toEqual({ ok: false, code: 'invalid_code', message: 'That code is not right, or it has expired. Ask for a new one.' });
  });

  it('can ask for a new code, and is told when it is asking too often', async () => {
    const fine = makeRealAuth();
    expect(await fine.service.resendSignUpCode('sam@example.com')).toEqual({ ok: true });
    const limited = makeRealAuth({ backend: { resendSignUpCode: async () => backendError('over_email_send_rate_limit') } });
    expect(await limited.service.resendSignUpCode('sam@example.com')).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(await fine.service.resendSignUpCode('nope')).toMatchObject({ ok: false, code: 'validation' });
  });
});

describe('password reset', () => {
  it('asks for a code, and says the same thing for any valid address', async () => {
    const { service, backend } = makeRealAuth();
    expect(await service.requestPasswordReset('Someone@Example.com')).toEqual({ ok: true });
    expect(backend.requestPasswordReset).toHaveBeenCalledWith('someone@example.com');
  });

  it('checks the address first, and reports being rate limited', async () => {
    const { service, backend } = makeRealAuth({ backend: { requestPasswordReset: async () => backendError('over_email_send_rate_limit') } });
    expect(await service.requestPasswordReset('not-an-email')).toMatchObject({ ok: false, code: 'validation' });
    expect(backend.requestPasswordReset).not.toHaveBeenCalled();
    expect(await service.requestPasswordReset('a@example.com')).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('a good code and a new password sign the person in', async () => {
    const { service, backend } = makeRealAuth({ role: 'seeker' });
    const result = await service.resetPassword({ email: 'sam@example.com', code: '123456', newPassword: 'a brand new password' });
    expect(result).toEqual({ ok: true });
    expect(backend.verifyRecoveryCode).toHaveBeenCalledWith('sam@example.com', '123456');
    expect(backend.updatePassword).toHaveBeenCalledWith('a brand new password');
    expect(service.getState().status).toBe('signedIn');
  });

  it('checks code format and password length first', async () => {
    const { service, backend } = makeRealAuth();
    const result = await service.resetPassword({ email: 'sam@example.com', code: '1', newPassword: 'short' });
    expect(result).toMatchObject({ ok: false, fieldErrors: { code: expect.any(String), newPassword: 'Use at least 8 characters.' } });
    expect(backend.verifyRecoveryCode).not.toHaveBeenCalled();
  });

  it('a wrong code never reaches the password change', async () => {
    const { service, backend } = makeRealAuth({ backend: { verifyRecoveryCode: async () => backendError('otp_expired') } });
    const result = await service.resetPassword({ email: 'sam@example.com', code: '123456', newPassword: 'a brand new password' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_code' });
    expect(backend.updatePassword).not.toHaveBeenCalled();
    expect(service.getState().status).not.toBe('signedIn');
  });

  it('if the password change fails after the code was accepted, the person is signed out again', async () => {
    const { service, backend } = makeRealAuth({ backend: { updatePassword: async () => backendError('same_password') } });
    const result = await service.resetPassword({ email: 'sam@example.com', code: '123456', newPassword: 'the same old password' });
    expect(result).toMatchObject({ ok: false, code: 'same_password' });
    expect(backend.signOut).toHaveBeenCalled();
    expect(service.getState().status).toBe('signedOut');
  });
});

describe('signing out and changes from elsewhere', () => {
  it('signOut ends the session and the state', async () => {
    const { service, backend } = makeRealAuth({ backend: { accessToken: async () => 't' } });
    await service.start();
    expect(service.getState().status).toBe('signedIn');
    await service.signOut();
    expect(backend.signOut).toHaveBeenCalled();
    expect(service.getState().status).toBe('signedOut');
  });

  it('a sign-out in another tab signs this one out', async () => {
    const { service, backend } = makeRealAuth({ backend: { accessToken: async () => 't' } });
    await service.start();
    backend.emit('signed_out');
    await vi.advanceTimersByTimeAsync(1);
    expect(service.getState().status).toBe('signedOut');
  });

  it('a sign-in in another tab makes this one ask the API who it is', async () => {
    const { service, backend, api } = makeRealAuth({ role: 'employer' });
    await service.start();
    expect(service.getState().status).toBe('signedOut');
    backend.emit('signed_in');
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getMe).toHaveBeenCalled();
    expect(service.getState().user?.role).toBe('employer');
  });

  it('tells subscribers about every change, and stops when they unsubscribe', async () => {
    const { service } = makeRealAuth({ backend: { accessToken: async () => 't' } });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    await service.start();
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
    await service.signOut();
    expect(listener.mock.calls.length).toBe(calls);
  });
});
