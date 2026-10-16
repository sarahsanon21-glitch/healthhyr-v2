import type { Metadata } from 'next';
import { AccountPage } from '../../../components/account/AccountPage';
import { CompanyProfileForm } from '../../../components/company/CompanyProfileForm';

export const metadata: Metadata = { title: 'Company profile' };

export default function EmployerCompanyPage() {
  return (
    <AccountPage title="Company profile" back={{ href: '/dashboard', label: 'Back to dashboard' }}>
      <CompanyProfileForm />
    </AccountPage>
  );
}
