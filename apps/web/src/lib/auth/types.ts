import type { SignUpInput, SignUpRole, UserRole } from '@healthhyr/shared';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'noProfile' | 'error';

export interface AuthUser {
  id: string;
  /** Always the role the API read from the database. Never the browser's own idea of the role. */
  role: UserRole;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** A short, friendly message for the 'error' status. Never a raw server message. */
  message: string | null;
}

export const LOADING_STATE: AuthState = { status: 'loading', user: null, message: null };

export type AuthErrorCode =
  | 'validation'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'invalid_code'
  | 'rate_limited'
  | 'weak_password'
  | 'same_password'
  | 'cannot_create'
  | 'signups_disabled'
  | 'network'
  | 'unknown';

export type AuthResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; code: AuthErrorCode; message: string; fieldErrors?: Record<string, string> };

export interface BackendError {
  code?: string;
  message: string;
  status?: number;
}

export type BackendResult = { ok: true } | { ok: false; error: BackendError };

export interface SignUpBackendInput {
  email: string;
  password: string;
  fullName: string;
  role: SignUpRole;
}

/**
 * What the auth service needs from the sign-in provider (Supabase Auth). Kept small so tests can
 * replace it, and so the website could change provider without touching the screens.
 */
export interface AuthBackend {
  accessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  signIn(email: string, password: string): Promise<BackendResult>;
  signUp(input: SignUpBackendInput): Promise<{ ok: true; sessionStarted: boolean } | { ok: false; error: BackendError }>;
  confirmSignUp(email: string, code: string): Promise<BackendResult>;
  resendSignUpCode(email: string): Promise<BackendResult>;
  requestPasswordReset(email: string): Promise<BackendResult>;
  verifyRecoveryCode(email: string, code: string): Promise<BackendResult>;
  updatePassword(newPassword: string): Promise<BackendResult>;
  signOut(): Promise<void>;
  /** Calls back when the session starts or ends anywhere (another tab, expiry, sign-out). */
  onSessionChange(listener: (change: 'signed_in' | 'signed_out') => void): () => void;
}

export interface AuthService {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  /** Loads the saved session, if any, and asks the API who the person is. */
  start(): Promise<void>;
  /** Asks the API again (used by the "Try again" button). */
  refresh(): Promise<void>;
  signIn(input: { email: string; password: string }): Promise<AuthResult>;
  signUp(input: SignUpInput | { fullName: string; email: string; password: string; role: string }): Promise<AuthResult<{ next: 'signed_in' | 'confirm_email' }>>;
  confirmSignUp(input: { email: string; code: string }): Promise<AuthResult>;
  resendSignUpCode(email: string): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  resetPassword(input: { email: string; code: string; newPassword: string }): Promise<AuthResult>;
  signOut(): Promise<void>;
}
