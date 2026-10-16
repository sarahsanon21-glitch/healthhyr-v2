import Link from 'next/link';
import { buttonClasses } from '../components/ui/Button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col justify-center gap-4 px-4">
      <h1 className="text-4xl font-extrabold text-ink">HealthHyr</h1>
      <p className="text-base text-muted">This site is under construction.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/sign-in" className={buttonClasses()}>
          Sign in
        </Link>
        <Link href="/sign-up" className={buttonClasses({ variant: 'secondary' })}>
          Create an account
        </Link>
      </div>
    </main>
  );
}
