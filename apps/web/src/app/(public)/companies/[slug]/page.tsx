import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicCompanyView } from '../../../../components/company/PublicCompanyView';
import { fetchPublicCompany } from '../../../../lib/api/public';

// One request per page view, shared by the metadata and the page.
const loadCompany = cache(fetchPublicCompany);

// Search engines are told to stay away until the SEO step (12) adds structured data and a sitemap.
const NOT_INDEXED = { index: false, follow: false } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  return { title: company ? `${company.companyName} on HealthHyr` : 'Company not found', robots: NOT_INDEXED };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await loadCompany(slug);
  // A company that has not changed its name from the default is a 404, exactly like a missing one.
  if (!company) notFound();
  return <PublicCompanyView company={company} />;
}
