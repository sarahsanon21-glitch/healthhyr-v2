'use client';

import type { ReactNode } from 'react';
import { SignOutButton } from '../auth/SignOutButton';
import { Logo } from '../ui/Logo';

/**
 * The first screen after signing in. It is deliberately plain: the real dashboard, profile and
 * admin tools arrive in later steps, and nothing here is made up.
 */
export function SignedInHome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo size="2xl" />
        <SignOutButton />
      </header>
      <h1 className="font-heading text-3xl font-bold text-ink">{title}</h1>
      <p className="max-w-modal-md text-base text-muted">{children}</p>
    </main>
  );
}
