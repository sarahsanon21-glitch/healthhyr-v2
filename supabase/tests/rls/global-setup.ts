import { closePool, databaseUrl } from './helpers';
import pg from 'pg';

// Fails fast, with instructions, when the local database is not running or not migrated.
export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  try {
    await client.connect();
    const { rows } = await client.query(
      `select to_regclass('public.jobs') as jobs, to_regproc('auth.uid') as uid, to_regclass('auth.users') as users`,
    );
    const row = rows[0] as { jobs: string | null; uid: string | null; users: string | null };
    if (!row.uid || !row.users) throw new Error('the auth schema is missing (is this a Supabase database?)');
    if (!row.jobs) throw new Error('the schema is not applied. Run: npm run db:reset');
  } catch (error) {
    throw new Error(
      `RLS tests need the local Supabase database. ${(error as Error).message}\n` +
        'Start it with: npm run db:start   (then: npm run db:reset to apply migrations)',
      { cause: error },
    );
  } finally {
    await client.end().catch(() => {});
    await closePool();
  }
}
