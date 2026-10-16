import type { Metadata } from 'next';
import { SignedInHome } from '../../../components/account/SignedInHome';
import { buttonClasses } from '../../../components/ui/Button';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Employer dashboard' };

export default function EmployerDashboardPage() {
  return (
    <SignedInHome
      title="Employer dashboard"
      actions={
        <div>
          <Link href="/company" className={buttonClasses({ variant: 'primary' })}>
            Edit company profile
          </Link>
        </div>
      }
    >
      You are signed in as an employer. Posting jobs and managing applicants will appear here.
    </SignedInHome>
  );
}
