import type { UserRole } from '@healthhyr/shared';

/** Where each role lands after signing in. */
export function homeForRole(role: UserRole): string {
  switch (role) {
    case 'employer':
      return '/dashboard';
    case 'seeker':
      return '/profile';
    case 'admin':
      return '/admin';
  }
}

function hasControlOrBackslash(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === '\\' || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * A "next" address from the URL is only used if it is a plain path on this site. Anything that
 * could send a person to another site (https://..., //host, backslashes, odd characters) is
 * ignored, so a crafted sign-in link cannot be used for phishing.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next.length > 512) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (hasControlOrBackslash(next)) return null;
  try {
    const resolved = new URL(next, 'https://healthhyr.invalid');
    if (resolved.origin !== 'https://healthhyr.invalid') return null;
  } catch {
    return null;
  }
  // Never bounce between the sign-in pages themselves.
  if (/^\/(sign-in|sign-up|forgot-password)(\/|\?|#|$)/.test(next)) return null;
  return next;
}

export function signInUrl(pathname: string): string {
  const next = safeNextPath(pathname);
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';
}
