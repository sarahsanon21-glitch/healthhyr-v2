// Static checks for the API's client design rule:
//
//   User-initiated reads and writes use the per-request client that carries the user's JWT
//   (src/lib/userClient.ts), so row-level security applies. The service-role client
//   (src/lib/serviceClient.ts) bypasses RLS and is for server-only operations: webhooks,
//   publish_job, expiry, admin actions. Those live in src/services/.
//
// These rules fail a test if the code drifts from that design.

export interface SourceFile {
  /** Path relative to apps/api, with forward slashes, for example "src/routes/me.ts". */
  path: string;
  text: string;
}

export interface Violation {
  path: string;
  rule: string;
  detail: string;
}

/** An explicit, reasoned exception. The reason is required. */
export const ALLOW_COMMENT = /^[ \t]*\/\/[ \t]*service-role-allowed:[ \t]*\S.*$/m;
const EMPTY_ALLOW_COMMENT = /^[ \t]*\/\/[ \t]*service-role-allowed:[ \t]*$/m;

const IMPORTS_SERVICE_CLIENT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"][^'"]*serviceClient(?:\.[cm]?[jt]s)?['"]/;

/** Code that answers user requests. It may not import the service-role client without an allow comment. */
export const isUserFacing = (path: string): boolean =>
  path.startsWith('src/routes/') || path.startsWith('src/middleware/') || path === 'src/app.ts';

/** The only files that may name the service-role key. */
export const SERVICE_KEY_ALLOWED = ['src/env.ts', 'src/server.ts', 'src/lib/serviceClient.ts'];
/** The only files that may read process.env. */
export const PROCESS_ENV_ALLOWED = ['src/env.ts', 'src/server.ts'];
/** The only files that may name the Stripe secret key. */
export const STRIPE_KEY_ALLOWED = ['src/env.ts', 'src/server.ts'];

export function scanApiSource(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];

  for (const { path, text } of files) {
    if (isUserFacing(path) && IMPORTS_SERVICE_CLIENT.test(text)) {
      if (EMPTY_ALLOW_COMMENT.test(text) || !ALLOW_COMMENT.test(text)) {
        violations.push({
          path,
          rule: 'service-client-in-user-facing-code',
          detail: 'imports the service-role client without a "// service-role-allowed: <reason>" comment',
        });
      }
    }

    if (!SERVICE_KEY_ALLOWED.includes(path) && /serviceRoleKey|SERVICE_ROLE_KEY/.test(text)) {
      violations.push({ path, rule: 'service-role-key-outside-allowlist', detail: 'names the service-role key' });
    }

    if (!PROCESS_ENV_ALLOWED.includes(path) && /\bprocess\.env\b/.test(text)) {
      violations.push({ path, rule: 'process-env-outside-env', detail: 'reads process.env (only env.ts and server.ts may)' });
    }

    if (!STRIPE_KEY_ALLOWED.includes(path) && /STRIPE_SECRET_KEY|stripe\.secretKey|\bsecretKey\b/.test(text)) {
      violations.push({ path, rule: 'stripe-secret-outside-env', detail: 'names the Stripe secret key' });
    }
  }

  return violations;
}
