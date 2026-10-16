// Shared setup for tests that talk to the real local Supabase. Values come from the git-ignored
// root .env (see .env.example). Nothing is hardcoded here.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export function supabaseEnv(): { url: string; anonKey: string; databaseUrl: string } {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, RLS_DATABASE_URL } = process.env;
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['RLS_DATABASE_URL', RLS_DATABASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. Start the local database (npm run db:start) and copy the values from ` +
        '`npm run db:status` into the git-ignored root .env (see .env.example).',
    );
  }
  return { url: SUPABASE_URL!.replace(/\/$/, ''), anonKey: SUPABASE_ANON_KEY!, databaseUrl: RLS_DATABASE_URL! };
}

/** The LOCAL service-role key, for tests that exercise server-only operations. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Copy "SERVICE_ROLE_KEY" from `npm run db:status` into the git-ignored root .env (see .env.example).',
    );
  }
  return key;
}
