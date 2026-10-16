import type { Metadata } from 'next';
import { SignedInHome } from '../../../components/account/SignedInHome';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminPage() {
  return <SignedInHome title="Admin">You are signed in as an administrator. Moderation tools will appear here.</SignedInHome>;
}
