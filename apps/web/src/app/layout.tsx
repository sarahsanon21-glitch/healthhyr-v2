import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { readSiteUrl } from '../lib/public-env';
import './globals.css';

// Font families, weights and CSS variables must match fonts in packages/shared/src/tokens.ts.
// next/font needs literal values here, so a test checks they agree.
const heading = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
  display: 'swap',
});

// Every page is rendered for each request, never built ahead of time. The Content-Security-Policy
// carries a fresh nonce for each request (src/proxy.ts), and Next.js can only attach it to scripts
// while it renders the page for that request. A page built ahead of time would have scripts the
// browser refuses to run.
export const dynamic = 'force-dynamic';

// The icons (icon.png, favicon.ico, apple-icon.png) and the share images (opengraph-image.png,
// twitter-image.png) sit next to this file. Next.js adds them to every page's metadata by their
// file names; metadataBase turns their addresses into absolute ones, as share previews require.
export const metadata: Metadata = {
  metadataBase: new URL(readSiteUrl()),
  title: { default: 'HealthHyr', template: '%s | HealthHyr' },
  description: 'Healthcare jobs for PCAs, HHAs, CNAs, RNs and caregivers.',
  openGraph: { siteName: 'HealthHyr', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning on <html> and <body> only: browser extensions modify these tags before React loads.
    <html lang="en" className={`${heading.variable} ${body.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
