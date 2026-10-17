import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicCompany } from '@healthhyr/shared';
import { PublicCompanyView, safeWebsite } from '../../src/components/company/PublicCompanyView';
import { expectClassesGenerated } from '../helpers/tailwind';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

const fetchPublicCompany = vi.fn();
vi.mock('../../src/lib/api/public', () => ({ fetchPublicCompany: (slug: string) => fetchPublicCompany(slug) }));

const COMPANY: PublicCompany = {
  companyName: 'Sunrise Home Care',
  description: 'Home care across the valley.\nCall us any time.',
  website: 'https://sunrise.example.org/about',
  logoUrl: null,
  industry: 'Home health',
  companySize: '11-50',
  city: 'Fresno',
  state: 'CA',
};

/** The only image on the page is the site's own logo in the header. A company's logo is never shown yet. */
const imageSources = () => [...document.querySelectorAll('img')].map((image) => image.getAttribute('src'));

describe('the public company page: what it shows', () => {
  it('shows the company name as the page heading, and what the company shared', async () => {
    render(<PublicCompanyView company={COMPANY} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sunrise Home Care' })).toBeInTheDocument();
    expect(screen.getByText('Fresno, CA')).toBeInTheDocument();
    expect(screen.getByText('Home health')).toBeInTheDocument();
    expect(screen.getByText('11-50 people')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'About Sunrise Home Care' })).toBeInTheDocument();
    expect(screen.getByText(/Home care across the valley\./)).toBeInTheDocument();
    await expectClassesGenerated();
  });

  it('shows the website as a safe external link that opens in a new tab and tells screen readers so', () => {
    render(<PublicCompanyView company={COMPANY} />);
    const link = screen.getByRole('link', { name: /sunrise\.example\.org/ });
    expect(link).toHaveAttribute('href', 'https://sunrise.example.org/about');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.getAttribute('rel')).toContain('nofollow');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('leaves out whatever the company did not fill in, and invents nothing', () => {
    render(<PublicCompanyView company={{ ...COMPANY, description: null, website: null, industry: null, companySize: null, city: null, state: null }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sunrise Home Care' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /example/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/verified|background|reviews|rating|open jobs/i);
  });

  it('shows a city with no state, or a state with no city, without stray punctuation', () => {
    const { rerender } = render(<PublicCompanyView company={{ ...COMPANY, state: null }} />);
    expect(screen.getByText('Fresno')).toBeInTheDocument();
    rerender(<PublicCompanyView company={{ ...COMPANY, city: null }} />);
    expect(screen.getByText('CA')).toBeInTheDocument();
  });

  it('text from the company is shown as plain text, never as markup', () => {
    render(<PublicCompanyView company={{ ...COMPANY, companyName: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' }} />);
    expect(document.querySelector('script')).toBeNull();
    expect(imageSources()).toEqual(['/brand/healthhyr-logo-compact.png']); // no image made from the company's text
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  it('has a link home and no sign-in, sign-out or employer controls', () => {
    render(<PublicCompanyView company={COMPANY} />);
    expect(screen.getByRole('link', { name: 'HealthHyr home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not show a company logo yet, even if one is set', () => {
    render(<PublicCompanyView company={{ ...COMPANY, logoUrl: 'https://tracker.example.org/pixel.png' }} />);
    expect(imageSources()).toEqual(['/brand/healthhyr-logo-compact.png']);
    expect(document.body.innerHTML).not.toContain('tracker.example.org');
  });
});

describe('safeWebsite: only real web addresses become links', () => {
  it.each([
    ['https://example.org', 'https://example.org/', 'example.org'],
    ['http://example.org/a?b=1', 'http://example.org/a?b=1', 'example.org'],
    ['https://sub.example.org:8443/x', 'https://sub.example.org:8443/x', 'sub.example.org:8443'],
  ])('accepts %s', (input, href, label) => {
    expect(safeWebsite(input)).toEqual({ href, label });
  });

  it.each([null, '', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'ftp://example.org', 'example.org', 'not a url', '//example.org', 'file:///etc/passwd'])(
    'refuses %j',
    (input) => {
      expect(safeWebsite(input)).toBeNull();
    },
  );

  it('a javascript: address in the data produces no link on the page', () => {
    render(<PublicCompanyView company={{ ...COMPANY, website: 'javascript:alert(1)' }} />);
    expect(screen.queryByRole('link', { name: /alert|javascript/i })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('javascript:');
  });
});

describe('the page route (/companies/[slug])', () => {
  beforeEach(() => {
    fetchPublicCompany.mockReset();
    notFound.mockClear();
  });

  it('asks for the company by its address and shows it', async () => {
    const { default: Page } = await import('../../src/app/(public)/companies/[slug]/page');
    fetchPublicCompany.mockResolvedValue(COMPANY);
    const element = await Page({ params: Promise.resolve({ slug: 'sunrise-home-care-3f0c9a' }) });
    expect(fetchPublicCompany).toHaveBeenCalledWith('sunrise-home-care-3f0c9a');
    render(element);
    expect(screen.getByRole('heading', { level: 1, name: 'Sunrise Home Care' })).toBeInTheDocument();
  });

  it('a company with no public page (including one still on the default name) is a 404', async () => {
    const { default: Page } = await import('../../src/app/(public)/companies/[slug]/page');
    fetchPublicCompany.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ slug: 'no-such-company-abc123' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('the API being down is an error, not a 404 (it must not tell search engines the page is gone)', async () => {
    const { default: Page } = await import('../../src/app/(public)/companies/[slug]/page');
    fetchPublicCompany.mockRejectedValue(new Error('network'));
    await expect(Page({ params: Promise.resolve({ slug: 'sunrise-home-care-3f0c9a' }) })).rejects.toThrow('network');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('is never indexed yet, and the title names the company', async () => {
    const { generateMetadata } = await import('../../src/app/(public)/companies/[slug]/page');
    fetchPublicCompany.mockResolvedValue(COMPANY);
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'sunrise-home-care-3f0c9a' }) })).toEqual({
      title: 'Sunrise Home Care on HealthHyr',
      robots: { index: false, follow: false },
    });
    fetchPublicCompany.mockResolvedValue(null);
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'other-company-abc123' }) })).toMatchObject({
      title: 'Company not found',
      robots: { index: false, follow: false },
    });
  });
});
