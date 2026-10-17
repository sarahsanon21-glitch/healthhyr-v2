// Security headers that are the same on every response (pages, error pages and files). The
// Content-Security-Policy is different on every request (it carries a nonce), so it is built in
// src/proxy.ts instead. next.config.ts applies these to every path.

export interface Header {
  key: string;
  value: string;
}

// Features the site never uses, switched off, so a script or an embedded page cannot ask for them.
const DISABLED_FEATURES = [
  'accelerometer',
  'bluetooth',
  'browsing-topics',
  'camera',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'payment',
  'serial',
  'usb',
];

export const STATIC_SECURITY_HEADERS: Header[] = [
  // Browsers must use https for this site for the next two years. No includeSubDomains and no preload:
  // those are decided separately (docs/SECURITY.md), after checking every subdomain.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: DISABLED_FEATURES.map((feature) => `${feature}=()`).join(', ') },
  // frame-ancestors in the Content-Security-Policy is the real rule; this is for old browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];
