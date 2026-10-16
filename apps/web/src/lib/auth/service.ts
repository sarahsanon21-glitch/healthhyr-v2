// The website's auth state machine.
//
// One rule above all: the person's role comes from GET /api/v1/me, which reads it from the
// database. Nothing here ever reads a role from the session, the token, local storage, the URL or a
// form. A sign-up asks for a role, but the screen that follows is chosen from the API's answer.
import {
  confirmSignUpSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@healthhyr/shared';
import { ApiError, type ApiClient } from '../api/client';
import { mapAuthError } from './errors';
import {
  LOADING_STATE,
  type AuthBackend,
  type AuthResult,
  type AuthService,
  type AuthState,
  type BackendError,
  type BackendResult,
} from './types';

const SIGNED_OUT: AuthState = { status: 'signedOut', user: null, message: null };
const CANNOT_LOAD = 'We could not load your account. Check your connection and try again.';

type SignUpResult = AuthResult<{ next: 'signed_in' | 'confirm_email' }>;

interface Issue {
  path: PropertyKey[];
  message: string;
}

/** The first message for each field, from a failed validation. */
function fieldErrors(issues: Issue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

const validation = (issues: Issue[]): AuthResult & SignUpResult => ({
  ok: false,
  code: 'validation',
  message: 'Check the highlighted fields.',
  fieldErrors: fieldErrors(issues),
});

const failure = (error: BackendError): AuthResult & SignUpResult => {
  const mapped = mapAuthError(error);
  return { ok: false, code: mapped.code, message: mapped.message };
};

export interface AuthServiceDeps {
  backend: AuthBackend;
  api: ApiClient;
}

export function createAuthService({ backend, api }: AuthServiceDeps): AuthService {
  let state: AuthState = LOADING_STATE;
  const listeners = new Set<() => void>();
  let identityLoad: Promise<void> | null = null;
  let started = false;

  function setState(next: AuthState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Asks the API who the person is. At most one request at a time. */
  function loadIdentity(): Promise<void> {
    identityLoad ??= (async () => {
      try {
        let me;
        try {
          me = await api.getMe();
        } catch (error) {
          // A 401 can mean the access token just expired. Refresh once and ask again.
          if (error instanceof ApiError && error.status === 401) {
            const token = await backend.refresh();
            if (!token) throw error;
            me = await api.getMe();
          } else {
            throw error;
          }
        }
        setState({ status: 'signedIn', user: { id: me.id, role: me.role }, message: null });
      } catch (error) {
        if (error instanceof ApiError && error.status === 403 && error.code === 'no_profile') {
          setState({ status: 'noProfile', user: null, message: null });
        } else if (error instanceof ApiError && error.status === 401) {
          // The session is not valid and could not be refreshed: end it.
          await backend.signOut();
          setState(SIGNED_OUT);
        } else {
          setState({ status: 'error', user: null, message: CANNOT_LOAD });
        }
      } finally {
        identityLoad = null;
      }
    })();
    return identityLoad;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start() {
      if (started) return;
      started = true;

      // Changes from elsewhere (another tab, expiry, sign-out). Handled on the next tick, because
      // the provider can deadlock if its own callback calls back into it. The subscription lasts
      // as long as the page does.
      backend.onSessionChange((change) => {
        setTimeout(() => {
          if (change === 'signed_out') {
            if (state.status !== 'signedOut') setState(SIGNED_OUT);
          } else if (state.status !== 'signedIn') {
            void loadIdentity();
          }
        }, 0);
      });

      const token = await backend.accessToken();
      if (!token) {
        setState(SIGNED_OUT);
        return;
      }
      await loadIdentity();
    },

    async refresh() {
      setState(LOADING_STATE);
      const token = await backend.accessToken();
      if (!token) {
        setState(SIGNED_OUT);
        return;
      }
      await loadIdentity();
    },

    async signIn(input) {
      const parsed = signInSchema.safeParse(input);
      if (!parsed.success) return validation(parsed.error.issues);
      const result = await backend.signIn(parsed.data.email, parsed.data.password);
      if (!result.ok) return failure(result.error);
      await loadIdentity();
      return { ok: true };
    },

    async signUp(input): Promise<SignUpResult> {
      // "admin" and anything else that is not seeker or employer stops here. Nothing is sent.
      const parsed = signUpSchema.safeParse(input);
      if (!parsed.success) return validation(parsed.error.issues);
      const result = await backend.signUp(parsed.data);
      if (!result.ok) return failure(result.error);
      if (result.sessionStarted) {
        await loadIdentity();
        return { ok: true, next: 'signed_in' };
      }
      return { ok: true, next: 'confirm_email' };
    },

    async confirmSignUp(input) {
      const parsed = confirmSignUpSchema.safeParse(input);
      if (!parsed.success) return validation(parsed.error.issues);
      const result = await backend.confirmSignUp(parsed.data.email, parsed.data.code);
      if (!result.ok) return failure(result.error);
      await loadIdentity();
      return { ok: true };
    },

    async resendSignUpCode(email) {
      const parsed = requestPasswordResetSchema.safeParse({ email });
      if (!parsed.success) return validation(parsed.error.issues);
      const result = await backend.resendSignUpCode(parsed.data.email);
      return result.ok ? { ok: true } : failure(result.error);
    },

    async requestPasswordReset(email) {
      const parsed = requestPasswordResetSchema.safeParse({ email });
      if (!parsed.success) return validation(parsed.error.issues);
      const result = await backend.requestPasswordReset(parsed.data.email);
      // Supabase answers the same whether or not the address has an account, and so do we.
      return result.ok ? { ok: true } : failure(result.error);
    },

    async resetPassword(input) {
      const parsed = resetPasswordSchema.safeParse(input);
      if (!parsed.success) return validation(parsed.error.issues);

      const verified: BackendResult = await backend.verifyRecoveryCode(parsed.data.email, parsed.data.code);
      if (!verified.ok) return failure(verified.error);

      const updated = await backend.updatePassword(parsed.data.newPassword);
      if (!updated.ok) {
        // The code started a session. Do not leave the person half signed in with the old password.
        await backend.signOut();
        setState(SIGNED_OUT);
        return failure(updated.error);
      }
      await loadIdentity();
      return { ok: true };
    },

    async signOut() {
      await backend.signOut();
      setState(SIGNED_OUT);
    },
  };
}
