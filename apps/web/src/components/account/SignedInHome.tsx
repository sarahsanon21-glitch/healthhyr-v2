'use client';

import type { ReactNode } from 'react';
import { AccountPage } from './AccountPage';

/**
 * The first screen after signing in. It is deliberately plain: the real dashboard, profile and
 * admin tools arrive in later steps, and nothing here is made up.
 */
export function SignedInHome({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <AccountPage title={title}>
      <p className="max-w-modal-md text-base text-muted">{children}</p>
      {actions}
    </AccountPage>
  );
}
