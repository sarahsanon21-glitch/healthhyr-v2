import type { Metadata } from 'next';
import { SignedInHome } from '../../../components/account/SignedInHome';

export const metadata: Metadata = { title: 'Your profile' };

export default function SeekerProfilePage() {
  return <SignedInHome title="Your profile">You are signed in as a job seeker. Your profile and applications will appear here.</SignedInHome>;
}
