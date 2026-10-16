import type { AuthErrorCode, BackendError } from './types';

export interface MappedAuthError {
  code: AuthErrorCode;
  message: string;
}

/**
 * Turns a provider error into a fixed, friendly message. The provider's own wording is never shown,
 * so nothing unexpected reaches the screen, and the messages do not reveal whether an account exists.
 */
export function mapAuthError(error: BackendError): MappedAuthError {
  const code = error.code ?? '';

  if (code === 'invalid_credentials') {
    return { code: 'invalid_credentials', message: 'Email or password is incorrect.' };
  }
  if (code === 'email_not_confirmed') {
    return { code: 'email_not_confirmed', message: 'Confirm your email first. Enter the 6-digit code we sent you.' };
  }
  if (code === 'otp_expired' || code === 'invalid_otp' || code === 'otp_disabled') {
    return { code: 'invalid_code', message: 'That code is not right, or it has expired. Ask for a new one.' };
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit' || error.status === 429) {
    return { code: 'rate_limited', message: 'Too many attempts. Wait a minute and try again.' };
  }
  if (code === 'same_password') {
    return { code: 'same_password', message: 'Choose a password you have not used before.' };
  }
  if (code === 'weak_password') {
    return { code: 'weak_password', message: 'Choose a stronger password.' };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || code === 'identity_already_exists') {
    return { code: 'cannot_create', message: 'We could not create that account. If you already have one, sign in instead.' };
  }
  if (code === 'signup_disabled') {
    return { code: 'signups_disabled', message: 'New accounts are not being accepted right now.' };
  }
  if (code === 'network' || error.status === 0) {
    return { code: 'network', message: 'Could not reach HealthHyr. Check your connection and try again.' };
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' };
}
