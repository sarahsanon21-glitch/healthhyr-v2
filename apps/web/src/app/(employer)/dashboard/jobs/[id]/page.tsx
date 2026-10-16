import type { Metadata } from 'next';
import { AccountPage } from '../../../../../components/account/AccountPage';
import { JobEditor } from '../../../../../components/jobs/JobEditor';

export const metadata: Metadata = { title: 'Edit job' };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AccountPage title="Edit job" back={{ href: '/dashboard', label: 'Back to dashboard' }}>
      <JobEditor id={id} />
    </AccountPage>
  );
}
