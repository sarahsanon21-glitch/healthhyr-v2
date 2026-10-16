import type { Metadata } from 'next';
import { SignedInHome } from '../../../components/account/SignedInHome';

export const metadata: Metadata = { title: 'Employer dashboard' };

export default function EmployerDashboardPage() {
  return <SignedInHome title="Employer dashboard">You are signed in as an employer. Posting jobs and managing applicants will appear here.</SignedInHome>;
}
