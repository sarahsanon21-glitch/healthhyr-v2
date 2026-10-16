// Test doubles for the website's auth layer.
import type { UserRole } from '@healthhyr/shared';
import { vi } from 'vitest';
import { ApiError, type ApiClient } from '../../src/lib/api/client';
import { createAuthService } from '../../src/lib/auth/service';
import type { AuthBackend, AuthService, AuthState, BackendResult } from '../../src/lib/auth/types';

export const USER_ID = '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10';

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
}

/** An API that answers GET /api/v1/me with the given role. */
export function makeApi(role: UserRole | ApiError = 'seeker'): FakeApi {
  const getMe = vi.fn(async () => {
    if (role instanceof ApiError) throw role;
    return { id: USER_ID, role };
  });
  return { getMe } as FakeApi;
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
