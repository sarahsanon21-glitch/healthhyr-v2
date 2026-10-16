// The Supabase Auth adapter. It is the only file in the website that calls supabase.auth.
// The browser holds the publishable key only. Passwords and codes go straight to Supabase Auth
// over HTTPS and are never sent to the HealthHyr API or logged.
import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicEnv } from '../public-env';
import type { AuthBackend, BackendError, BackendResult } from './types';

function toBackendError(error: AuthError): BackendError {
  // supabase-js reports a failed network call as AuthRetryableFetchError with status 0.
  if (error.name === 'AuthRetryableFetchError') return { code: 'network', message: error.message, status: 0 };
  return { ...(error.code !== undefined && { code: error.code }), message: error.message, ...(error.status !== undefined && { status: error.status }) };
}

const result = (error: AuthError | null): BackendResult => (error ? { ok: false, error: toBackendError(error) } : { ok: true });

export function createBrowserSupabase(env: PublicEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

export function createSupabaseBackend(supabase: SupabaseClient): AuthBackend {
  const { auth } = supabase;
  return {
    async accessToken() {
      const { data } = await auth.getSession();
      return data.session?.access_token ?? null;
    },

    async refresh() {
      const { data, error } = await auth.refreshSession();
      return error ? null : (data.session?.access_token ?? null);
    },

    async signIn(email, password) {
      const { error } = await auth.signInWithPassword({ email, password });
      return result(error);
    },

    async signUp({ email, password, fullName, role }) {
      // The role is a request, not a grant: the database trigger accepts "employer", turns anything
      // else into "seeker", and never creates an admin. The sign-up form only offers these two roles.
      const { data, error } = await auth.signUp({ email, password, options: { data: { full_name: fullName, role } } });
      if (error) return { ok: false, error: toBackendError(error) };
      return { ok: true, sessionStarted: data.session !== null };
    },

    async confirmSignUp(email, code) {
      const { error } = await auth.verifyOtp({ email, token: code, type: 'signup' });
      return result(error);
    },

    async resendSignUpCode(email) {
      const { error } = await auth.resend({ type: 'signup', email });
      return result(error);
    },

    async requestPasswordReset(email) {
      const { error } = await auth.resetPasswordForEmail(email);
      return result(error);
    },

    async verifyRecoveryCode(email, code) {
      const { error } = await auth.verifyOtp({ email, token: code, type: 'recovery' });
      return result(error);
    },

    async updatePassword(newPassword) {
      const { error } = await auth.updateUser({ password: newPassword });
      return result(error);
    },

    async signOut() {
      // "local" ends this browser's session only, not the person's sessions on other devices.
      await auth.signOut({ scope: 'local' });
    },

    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') listener('signed_in');
        else if (event === 'SIGNED_OUT') listener('signed_out');
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
