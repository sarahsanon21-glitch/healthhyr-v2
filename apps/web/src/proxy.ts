// Runs before every page request (Next.js 16 calls this file "proxy"; it used to be "middleware").
// It makes a fresh nonce, builds the Content-Security-Policy with it, and sends the policy both on the
// request (Next.js reads the nonce from it and attaches it to its own scripts and styles while it
// renders) and on the response (the browser enforces it).
//
// Any Content-Security-Policy or x-nonce header the visitor sent is overwritten, never trusted.
import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, generateNonce } from './lib/security/csp';
import { isDevelopment, readConnectOrigins, readSiteUrl } from './lib/public-env';

export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    development: isDevelopment(),
    connectOrigins: readConnectOrigins(),
    // Only when the site is served over https: upgrading local http requests would break local runs.
    upgradeInsecureRequests: readSiteUrl().startsWith('https://'),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

// Pages and error pages, not Next.js's own static files, the images in /brand, or the icon files
// (none of those run scripts). Link prefetches are skipped too: they do not render a document.
export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|brand/|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image|twitter-image).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
