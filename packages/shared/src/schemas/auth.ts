import { z } from 'zod';
import { USER_ROLES } from '../enums';

/**
 * The only roles a person can ask for when signing up. "admin" is deliberately not here:
 * admins are created by hand with the service role, never by a form.
 */
export const SIGN_UP_ROLES = ['seeker', 'employer'] as const;
export type SignUpRole = (typeof SIGN_UP_ROLES)[number];

export const PASSWORD_MIN_LENGTH = 8;
/** Longest password the sign-in service accepts. */
export const PASSWORD_MAX_LENGTH = 72;
export const AUTH_CODE_LENGTH = 6;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter a valid email address.').max(254, 'That email address is too long.'));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`);

export const authCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${AUTH_CODE_LENGTH}}$`), `Enter the ${AUTH_CODE_LENGTH}-digit code from the email.`);

export const signInSchema = z.object({
  email: emailSchema,
  // No length rule here: sign-in only checks that something was typed.
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(100, 'Use 100 characters or fewer.'),
  email: emailSchema,
  password: newPasswordSchema,
  role: z.enum(SIGN_UP_ROLES, { error: 'Choose one.' }),
});

export const confirmSignUpSchema = z.object({ email: emailSchema, code: authCodeSchema });

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: authCodeSchema,
  newPassword: newPasswordSchema,
});

/**
 * What GET /api/v1/me answers. Clients trust the role in this response (it comes from the
 * database) and nothing else. Any other role value is refused.
 */
export const meResponseSchema = z.object({
  id: z.uuid(),
  role: z.enum(USER_ROLES),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ConfirmSignUpInput = z.infer<typeof confirmSignUpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
