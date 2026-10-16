'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Button } from '../ui/Button';

/** Ends this browser's session. The protected page then redirects to sign-in by itself. */
export function SignOutButton() {
  const { service } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={busy || !service}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        await service?.signOut();
        setBusy(false);
      }}
    >
      {busy ? 'Signing out' : 'Sign out'}
    </Button>
  );
}
