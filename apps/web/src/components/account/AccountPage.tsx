'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '../auth/SignOutButton';
import { Logo } from '../ui/Logo';

export interface AccountPageProps {
  title: string;
  /** A link back to the page this one belongs to. */
  back?: { href: string; label: string };
  children: ReactNode;
}

/** The frame around pages for signed-in people: logo, sign out, a heading, and the page itself. */
export function AccountPage({ title, back, children }: AccountPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo size="2xl" />
        <SignOutButton />
      </header>
      {back && (
        <nav aria-label="Back">
          <Link href={back.href} className="text-sm font-semibold text-primary underline">
            {back.label}
          </Link>
        </nav>
      )}
      <h1 className="font-heading text-3xl font-bold text-ink">{title}</h1>
      {children}
    </main>
  );
}
