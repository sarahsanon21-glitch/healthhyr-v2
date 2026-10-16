import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '../../../components/auth/AuthShell';
import { FullPageSpinner } from '../../../components/auth/Screens';
import { SignUpForm } from '../../../components/auth/SignUpForm';
import { RedirectIfSignedIn } from '../../../lib/auth/guards';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RedirectIfSignedIn>
        <AuthShell>
          <SignUpForm />
        </AuthShell>
      </RedirectIfSignedIn>
    </Suspense>
  );
}
