// Boots the real server process (src/server.ts) to prove that bad configuration stops it at once.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = resolve(import.meta.dirname, '..');
const tsx = resolve(apiRoot, '../../node_modules/tsx/dist/cli.mjs');

const fake = {
  stripe: ['sk', 'test', 'a'.repeat(24)].join('_'),
  liveStripe: ['sk', 'live', 'b'.repeat(24)].join('_'),
  webhook: ['whsec', 'c'.repeat(24)].join('_'),
};

/** A minimal environment: no inherited configuration, so nothing leaks in from the developer's shell. */
function baseEnv(extra: Record<string, string>): Record<string, string> {
  const keep = ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const env: Record<string, string> = {};
  for (const key of keep) if (process.env[key]) env[key] = process.env[key]!;
  return { ...env, API_ENV_FILE: resolve(apiRoot, '.does-not-exist.env'), ...extra };
}

function run(env: Record<string, string>, onStdout?: (chunk: string, kill: () => void) => void) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, [tsx, 'src/server.ts'], { cwd: apiRoot, env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`server did not finish in time.\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 25_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      onStdout?.(chunk.toString(), () => child.kill());
    });
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}

describe('server boot', () => {
  it('exits with code 1 and names every missing variable when configuration is missing', async () => {
    const result = await run(baseEnv({}));
    expect(result.code).toBe(1);
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
      expect(result.stderr).toContain(name);
    }
    expect(result.stdout).not.toContain('listening');
  }, 30_000);

  it('refuses a live Stripe key in development, without printing it', async () => {
    const result = await run(
      baseEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'anon-' + 'd'.repeat(30),
        SUPABASE_SERVICE_ROLE_KEY: 'service-' + 'e'.repeat(30),
        STRIPE_SECRET_KEY: fake.liveStripe,
        STRIPE_WEBHOOK_SECRET: fake.webhook,
      }),
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/live Stripe keys are not allowed outside production/);
    expect(result.stderr).not.toContain(fake.liveStripe);
    expect(result.stdout).not.toContain('listening');
  }, 30_000);

  it('starts with valid configuration, serves /health, answers 401 on /api/v1/me and 404 on the old /api/me', async () => {
    let port = 0;
    const checks: Array<Promise<unknown>> = [];
    const result = await run(
      baseEnv({
        NODE_ENV: 'development',
        PORT: '0',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'anon-' + 'd'.repeat(30),
        SUPABASE_SERVICE_ROLE_KEY: 'service-' + 'e'.repeat(30),
        STRIPE_SECRET_KEY: fake.stripe,
        STRIPE_WEBHOOK_SECRET: fake.webhook,
      }),
      (chunk, kill) => {
        const line = chunk.split('\n').find((l) => l.includes('"listening"'));
        if (!line || port) return;
        port = (JSON.parse(line) as { port: number }).port;
        checks.push(
          (async () => {
            const health = await fetch(`http://127.0.0.1:${port}/health`);
            expect(health.status).toBe(200);
            expect(await health.json()).toEqual({ status: 'ok' });
            const me = await fetch(`http://127.0.0.1:${port}/api/v1/me`);
            expect(me.status).toBe(401);
            const oldMe = await fetch(`http://127.0.0.1:${port}/api/me`);
            expect(oldMe.status).toBe(404);
            kill();
          })(),
        );
      },
    );
    await Promise.all(checks);
    expect(port).toBeGreaterThan(0);
    expect(result.stdout).toContain('"listening"');
  }, 30_000);
});
