import type { Metadata } from 'next';
import { AccountPage } from '../../../../../components/account/AccountPage';
import { NewJob } from '../../../../../components/jobs/NewJob';

export const metadata: Metadata = { title: 'Post a job' };

export default function NewJobPage() {
  return (
    <AccountPage title="Post a job" back={{ href: '/dashboard', label: 'Back to dashboard' }}>
      <NewJob />
    </AccountPage>
  );
}
