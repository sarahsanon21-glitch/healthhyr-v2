'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { UserRole } from '@healthhyr/shared';
import { AuthErrorScreen, FullPageSpinner, NoProfileScreen } from '../../components/auth/Screens';
import { useAuth } from './AuthProvider';
import { homeForRole, safeNextPath, signInUrl } from './redirects';

/**
 * Protects a page. Children are rendered ONLY when the API has confirmed the person's role and it is
 * one of `roles`. In every other state, including while loading and on the server, the page shows
 * a spinner or a message, never the protected content.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const role = state.user?.role;
  const allowed = state.status === 'signedIn' && role !== undefined && roles.includes(role);

  useEffect(() => {
    if (state.status === 'signedOut') router.replace(signInUrl(pathname));
    else if (state.status === 'signedIn' && role !== undefined && !roles.includes(role)) router.replace(homeForRole(role));
  }, [state.status, role, roles, router, pathname]);

  if (allowed) return <>{children}</>;
  if (state.status === 'noProfile') return <NoProfileScreen />;
  if (state.status === 'error') return <AuthErrorScreen message={state.message} />;
  return <FullPageSpinner />;
}

/**
 * For the sign-in, sign-up and reset pages. A person who is already signed in goes to the page they
 * were heading to (if it is a safe path on this site) or to the home page for their role.
 */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNextPath(search.get('next'));

  useEffect(() => {
    if (state.status === 'signedIn' && state.user) router.replace(next ?? homeForRole(state.user.role));
  }, [state.status, state.user, router, next]);

  if (state.status === 'signedOut') return <>{children}</>;
  if (state.status === 'noProfile') return <NoProfileScreen />;
  if (state.status === 'error') return <AuthErrorScreen message={state.message} />;
  return <FullPageSpinner />;
}
