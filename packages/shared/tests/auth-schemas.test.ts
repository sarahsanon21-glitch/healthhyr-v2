import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../src/enums';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SIGN_UP_ROLES,
  authCodeSchema,
  confirmSignUpSchema,
  emailSchema,
  meResponseSchema,
  newPasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../src/schemas';

const validSignUp = { fullName: 'Sam Rivera', email: 'sam@example.com', password: 'a-long-password', role: 'seeker' } as const;

describe('sign-up roles', () => {
  it('are seeker and employer only, and admin can never be requested', () => {
    expect([...SIGN_UP_ROLES]).toEqual(['seeker', 'employer']);
    expect(SIGN_UP_ROLES).not.toContain('admin');
    const all: readonly string[] = USER_ROLES;
    for (const role of SIGN_UP_ROLES) expect(all).toContain(role);
  });

  it('the sign-up schema refuses admin and any other role', () => {
    for (const role of ['admin', 'ADMIN', 'superuser', '', 'seeker ', undefined, null, 1]) {
      expect(signUpSchema.safeParse({ ...validSignUp, role }).success, String(role)).toBe(false);
    }
    expect(signUpSchema.safeParse({ ...validSignUp, role: 'employer' }).success).toBe(true);
  });

  it('asks the person to choose when no role is given', () => {
    const result = signUpSchema.safeParse({ ...validSignUp, role: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Choose one.');
  });
});

describe('email', () => {
  it('is trimmed and lower-cased', () => {
    expect(emailSchema.parse('  Sam@Example.COM ')).toBe('sam@example.com');
  });

  it('rejects empty, malformed and too long addresses with friendly messages', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false);
    const empty = emailSchema.safeParse('   ');
    if (!empty.success) expect(empty.error.issues[0]?.message).toBe('Enter your email address.');
  });
});

describe('password', () => {
  it('needs at least 8 characters and at most 72', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(newPasswordSchema.safeParse('1234567').success).toBe(false);
    expect(newPasswordSchema.safeParse('12345678').success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(PASSWORD_MAX_LENGTH + 1)).success).toBe(false);
  });

  it('is not trimmed: spaces are allowed', () => {
    expect(newPasswordSchema.parse('  spaces ok  ')).toBe('  spaces ok  ');
  });

  it('sign-in only requires that something was typed', () => {
    expect(signInSchema.safeParse({ email: 'sam@example.com', password: 'x' }).success).toBe(true);
    expect(signInSchema.safeParse({ email: 'sam@example.com', password: '' }).success).toBe(false);
  });
});

describe('emailed code', () => {
  it('is exactly 6 digits', () => {
    expect(authCodeSchema.parse(' 123456 ')).toBe('123456');
    for (const bad of ['12345', '1234567', 'abcdef', '12 3456', '12345a', '']) {
      expect(authCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('the other auth forms', () => {
  it('sign-up needs a name', () => {
    expect(signUpSchema.safeParse({ ...validSignUp, fullName: '   ' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...validSignUp, fullName: 'x'.repeat(101) }).success).toBe(false);
  });

  it('confirm, request-reset and reset all validate their parts', () => {
    expect(confirmSignUpSchema.safeParse({ email: 'sam@example.com', code: '123456' }).success).toBe(true);
    expect(confirmSignUpSchema.safeParse({ email: 'sam@example.com', code: '12' }).success).toBe(false);
    expect(requestPasswordResetSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ email: 'sam@example.com', code: '123456', newPassword: 'long-enough' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ email: 'sam@example.com', code: '123456', newPassword: 'short' }).success).toBe(false);
  });
});

describe('the /me response', () => {
  const id = '3f0c9a52-8a5e-4f0e-9a58-5a3a9d9b8f10';

  it('accepts exactly the three known roles', () => {
    for (const role of USER_ROLES) expect(meResponseSchema.safeParse({ id, role }).success, role).toBe(true);
  });

  it('refuses an unknown role, a missing role and a bad id', () => {
    for (const bad of [{ id, role: 'superuser' }, { id }, { id: 'nope', role: 'seeker' }, { role: 'seeker' }, null, 'seeker']) {
      expect(meResponseSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
