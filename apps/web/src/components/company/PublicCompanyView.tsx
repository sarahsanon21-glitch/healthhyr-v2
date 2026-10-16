import Link from 'next/link';
import type { PublicCompany } from '@healthhyr/shared';
import { Logo } from '../ui/Logo';

/**
 * A web address is shown as a link only if it really is an http or https address. The database lets
 * an employer write this column directly, so the page does not trust it to be a safe link.
 */
export function safeWebsite(value: string | null): { href: string; label: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { href: url.href, label: url.host };
  } catch {
    return null;
  }
}

/**
 * The public company page. Shows only what the company chose to share. Nothing here is invented:
 * a field that is empty is simply left out. (No logo yet: uploads arrive in a later step.)
 */
export function PublicCompanyView({ company }: { company: PublicCompany }) {
  const website = safeWebsite(company.website);
  const place = [company.city, company.state].filter(Boolean).join(', ');
  const facts = [
    place && { label: 'Location', value: place },
    company.industry && { label: 'Industry', value: company.industry },
    company.companySize && { label: 'Company size', value: `${company.companySize} people` },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <main className="mx-auto flex min-h-screen max-w-container flex-col gap-6 px-4 py-8">
      <header>
        <Link href="/" aria-label="HealthHyr home">
          <Logo size="2xl" />
        </Link>
      </header>

      <article className="flex max-w-modal-lg flex-col gap-6">
        <h1 className="font-heading text-3xl font-bold text-ink">{company.companyName}</h1>

        {facts.length > 0 && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1">
                <dt className="text-sm font-semibold text-muted">{fact.label}</dt>
                <dd className="text-base text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {company.description && (
          <section aria-labelledby="about-heading" className="flex flex-col gap-2">
            <h2 id="about-heading" className="font-heading text-xl font-bold text-ink">
              About {company.companyName}
            </h2>
            <p className="whitespace-pre-line text-base text-ink">{company.description}</p>
          </section>
        )}

        {website && (
          <p className="text-base">
            <a href={website.href} rel="nofollow noopener noreferrer" target="_blank" className="font-semibold text-primary underline">
              {website.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
      </article>
    </main>
  );
}
