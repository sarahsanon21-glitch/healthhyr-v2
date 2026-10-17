import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export const metadata: Metadata = { title: 'Page not found' };

// Our own 404 page. Next.js's built-in one styles itself with inline style attributes, which the
// Content-Security-Policy (no 'unsafe-inline') blocks.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col justify-center px-4">
      <EmptyState
        headingLevel={1}
        title="404: page not found"
        description="That page does not exist or has moved."
        action={
          <Link href="/" className={buttonClasses()}>
            Go to the home page
          </Link>
        }
      />
    </main>
  );
}
