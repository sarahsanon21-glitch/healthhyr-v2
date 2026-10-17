// The website's Content-Security-Policy. It tells the browser exactly where scripts, styles, images
// and network calls may come from, so a script injected into a page cannot run or send anything out.
// That matters most here because the signed-in session lives in the browser's local storage, which
// any script running on the site's origin could read.
//
// Scripts and styles are allowed only with a nonce: a random value made for each request, sent in
// the policy and attached by Next.js to its own scripts and styles. An attacker cannot guess it.
// 'strict-dynamic' lets those trusted scripts load their own chunks. There is no 'unsafe-inline' and
// no 'unsafe-eval' in production.

export interface CspOptions {
  /** A fresh random value for this request (see generateNonce). */
  nonce: string;
  /** `next dev` needs eval for error overlays and inline styles for hot reload. Never true in production. */
  development: boolean;
  /** The API and Supabase Auth origins the browser calls. */
  connectOrigins: string[];
  /** Ask the browser to upgrade http requests to https. Only when the site itself is served over https. */
  upgradeInsecureRequests: boolean;
}

/** 128 random bits, base64 encoded. Made with the Web Crypto API, so it works wherever Next.js runs the proxy. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy({ nonce, development, connectOrigins, upgradeInsecureRequests }: CspOptions): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])];
  const styles = ["'self'", development ? "'unsafe-inline'" : `'nonce-${nonce}'`];
  const connect = ["'self'", ...connectOrigins, ...(development ? ['ws:', 'wss:'] : [])];

  const directives = [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    `style-src ${styles.join(' ')}`,
    // Images are the site's own files, plus data: and blob: for small generated images.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgradeInsecureRequests ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}
