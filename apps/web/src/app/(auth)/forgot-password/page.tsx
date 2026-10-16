import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '../../../components/auth/AuthShell';
import { ForgotPasswordForm } from '../../../components/auth/ForgotPasswordForm';
import { FullPageSpinner } from '../../../components/auth/Screens';
import { RedirectIfSignedIn } from '../../../lib/auth/guards';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RedirectIfSignedIn>
        <AuthShell>
          <ForgotPasswordForm />
        </AuthShell>
      </RedirectIfSignedIn>
    </Suspense>
  );
}
