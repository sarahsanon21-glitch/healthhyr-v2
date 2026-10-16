import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanApiSource, type SourceFile } from './helpers/service-role-scan';

const apiRoot = resolve(import.meta.dirname, '..');

const scan = (path: string, text: string) => scanApiSource([{ path, text }]).map((v) => v.rule);

describe('service-role scanner: what it catches', () => {
  it.each([
    ['a route', 'src/routes/jobs.ts'],
    ['middleware', 'src/middleware/auth.ts'],
    ['the app wiring', 'src/app.ts'],
  ])('flags the service-role client imported by %s', (_name, path) => {
    expect(scan(path, `import { createServiceClient } from '../lib/serviceClient';`)).toContain('service-client-in-user-facing-code');
    expect(scan(path, `import { createServiceClient } from "../lib/serviceClient.ts";`)).toContain('service-client-in-user-facing-code');
    expect(scan(path, `const m = await import('../lib/serviceClient');`)).toContain('service-client-in-user-facing-code');
    expect(scan(path, `const m = require('../lib/serviceClient');`)).toContain('service-client-in-user-facing-code');
    expect(scan(path, `import * as svc from '../lib/serviceClient'`)).toContain('service-client-in-user-facing-code');
  });

  it('accepts the import with an explicit allow comment that gives a reason', () => {
    const code = `// service-role-allowed: admin export needs to read every row; ownership is checked in code below
import { createServiceClient } from '../lib/serviceClient';`;
    expect(scan('src/routes/admin.ts', code)).toEqual([]);
  });

  it('rejects an allow comment with no reason', () => {
    const code = `// service-role-allowed:
import { createServiceClient } from '../lib/serviceClient';`;
    expect(scan('src/routes/admin.ts', code)).toContain('service-client-in-user-facing-code');
    expect(scan('src/routes/admin.ts', `// service-role-allowed:   \nimport x from '../lib/serviceClient';`)).toContain(
      'service-client-in-user-facing-code',
    );
  });

  it('does not accept a look-alike comment', () => {
    for (const comment of ['// service-role ok', '/* service-role-allowed: nope */', '// allowed: service-role', '// TODO service-role-allowed: later']) {
      const code = `${comment}\nimport { createServiceClient } from '../lib/serviceClient';`;
      expect(scan('src/routes/x.ts', code), comment).toContain('service-client-in-user-facing-code');
    }
  });

  it('allows server-only code in services to use the service-role client', () => {
    expect(scan('src/services/publish.ts', `import { createServiceClient } from '../lib/serviceClient';`)).toEqual([]);
    expect(scan('src/services/webhooks/stripe.ts', `import { createServiceClient } from '../../lib/serviceClient';`)).toEqual([]);
  });

  it('does not flag a user-facing file that imports the per-request client', () => {
    expect(scan('src/routes/jobs.ts', `import { createUserClientFactory } from '../lib/userClient';`)).toEqual([]);
  });

  it('flags the service-role key named anywhere outside env.ts, server.ts and the client file', () => {
    expect(scan('src/routes/x.ts', 'const k = config.supabase.serviceRoleKey;')).toContain('service-role-key-outside-allowlist');
    expect(scan('src/services/x.ts', 'const k = process.env.SUPABASE_SERVICE_ROLE_KEY;')).toContain('service-role-key-outside-allowlist');
    expect(scan('src/env.ts', 'SUPABASE_SERVICE_ROLE_KEY: secret(20)')).not.toContain('service-role-key-outside-allowlist');
    expect(scan('src/lib/serviceClient.ts', 'config.serviceRoleKey')).toEqual([]);
  });

  it('flags process.env everywhere except env.ts and server.ts', () => {
    expect(scan('src/routes/x.ts', 'const v = process.env.NODE_ENV;')).toContain('process-env-outside-env');
    expect(scan('src/services/x.ts', "process.env['SOMETHING']")).toContain('process-env-outside-env');
    expect(scan('src/lib/x.ts', 'const { env } = process; process.env')).toContain('process-env-outside-env');
    expect(scan('src/server.ts', 'process.env.API_ENV_FILE')).toEqual([]);
    expect(scan('src/env.ts', 'parseEnv(process.env)')).toEqual([]);
  });

  it('flags the Stripe secret key named outside env.ts and server.ts', () => {
    expect(scan('src/services/stripe.ts', 'new Stripe(config.stripe.secretKey)')).toContain('stripe-secret-outside-env');
    expect(scan('src/routes/x.ts', 'STRIPE_SECRET_KEY')).toContain('stripe-secret-outside-env');
    expect(scan('src/env.ts', 'STRIPE_SECRET_KEY: z.string()')).toEqual([]);
  });
});

function sourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx|mts|js|mjs)$/.test(name)) return [];
    return [{ path: relative(apiRoot, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }];
  });
}

describe('service-role scanner: the real API source', () => {
  const files = sourceFiles(join(apiRoot, 'src'));

  it('finds the source files it is meant to scan', () => {
    const paths = files.map((file) => file.path);
    for (const expected of ['src/app.ts', 'src/env.ts', 'src/server.ts', 'src/middleware/auth.ts', 'src/routes/me.ts', 'src/lib/serviceClient.ts', 'src/lib/userClient.ts']) {
      expect(paths).toContain(expected);
    }
  });

  it('no route, middleware or app wiring imports the service-role client without an allow comment', () => {
    expect(scanApiSource(files).filter((v) => v.rule === 'service-client-in-user-facing-code')).toEqual([]);
  });

  it('server-only secrets are named only where they are allowed', () => {
    expect(scanApiSource(files)).toEqual([]);
  });

  it('the user-facing authentication code uses the per-request client factory', () => {
    const auth = files.find((file) => file.path === 'src/middleware/auth.ts')!;
    expect(auth.text).toMatch(/createUserClient/);
    expect(auth.text).not.toMatch(/serviceClient|serviceRole/i);
  });
});
