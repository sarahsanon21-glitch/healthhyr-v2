'use client';

import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../lib/auth/AuthProvider';

/** Shown while the browser finds out who the person is. Nothing protected is behind it. */
export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Spinner size="lg" label={label} />
    </main>
  );
}

/** A valid sign-in whose account has no profile row (the signup trigger always makes one). */
export function NoProfileScreen() {
  const { service } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-container items-center justify-center px-4">
      <EmptyState
        headingLevel={1}
        title="Your account is not set up yet"
        description="Something went wrong while creating your account. Sign out and try again, or contact support@healthhyr.com."
        action={<Button onClick={() => void service?.signOut()}>Sign out</Button>}
      />
    </main>
  );
}

/** The API could not be reached, or configuration is missing. Offers a retry and a way out. */
export function AuthErrorScreen({ message }: { message: string | null }) {
  const { service } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-container items-center justify-center px-4">
      <EmptyState
        headingLevel={1}
        title="We could not load your account"
        description={message ?? 'Check your connection and try again.'}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => void service?.refresh()}>Try again</Button>
            <Button variant="secondary" onClick={() => void service?.signOut()}>
              Sign out
            </Button>
          </div>
        }
      />
    </main>
  );
}
