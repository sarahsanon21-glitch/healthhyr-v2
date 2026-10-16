import { supabaseEnv } from './env';

// Fails fast, with instructions, when the local Supabase is not running.
export default async function setup(): Promise<void> {
  const { url } = supabaseEnv();
  try {
    const health = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`auth health check returned ${health.status}`);
    const jwks = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
    if (!jwks.ok) throw new Error(`JWKS endpoint returned ${jwks.status}`);
  } catch (error) {
    throw new Error(
      `API integration tests need the local Supabase (${url}). ${(error as Error).message}\n` +
        'Start it with: npm run db:start',
      { cause: error },
    );
  }
}
