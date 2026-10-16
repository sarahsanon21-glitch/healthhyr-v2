import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireRole } from '../../lib/auth/guards';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Everything in this folder is for job seekers only. */
export default function SeekerLayout({ children }: { children: ReactNode }) {
  return <RequireRole roles={['seeker']}>{children}</RequireRole>;
}
