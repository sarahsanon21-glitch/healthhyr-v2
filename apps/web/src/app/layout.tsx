import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
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

export const metadata: Metadata = {
  title: { default: 'HealthHyr', template: '%s | HealthHyr' },
  description: 'Healthcare jobs for PCAs, HHAs, CNAs, RNs and caregivers.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
