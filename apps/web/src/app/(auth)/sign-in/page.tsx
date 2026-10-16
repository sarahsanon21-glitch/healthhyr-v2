import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '../../../components/auth/AuthShell';
import { FullPageSpinner } from '../../../components/auth/Screens';
import { SignInForm } from '../../../components/auth/SignInForm';
import { RedirectIfSignedIn } from '../../../lib/auth/guards';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RedirectIfSignedIn>
        <AuthShell>
          <SignInForm />
        </AuthShell>
      </RedirectIfSignedIn>
    </Suspense>
  );
}
