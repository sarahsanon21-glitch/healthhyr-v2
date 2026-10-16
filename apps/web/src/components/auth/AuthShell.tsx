import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { Logo } from '../ui/Logo';

/** The frame around the sign-in, sign-up and reset pages. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-modal-sm flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" aria-label="HealthHyr home" className="self-start">
        <Logo size="3xl" />
      </Link>
      <Card>{children}</Card>
    </main>
  );
}
