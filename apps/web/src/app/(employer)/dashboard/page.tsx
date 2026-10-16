import type { Metadata } from 'next';
import { AccountPage } from '../../../components/account/AccountPage';
import { EmployerDashboard } from '../../../components/jobs/EmployerDashboard';

export const metadata: Metadata = { title: 'Employer dashboard' };

export default function EmployerDashboardPage() {
  return (
    <AccountPage title="Employer dashboard">
      <EmployerDashboard />
    </AccountPage>
  );
}
