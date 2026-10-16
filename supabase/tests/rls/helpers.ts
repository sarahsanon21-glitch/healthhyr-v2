// RLS test harness. Runs against a real local Supabase database (real auth schema and roles).
//
// Every test runs inside one transaction that is rolled back, so tests never leave data behind
// and never see each other's rows. Inside it, a test acts as a database role with JWT claims,
// exactly like a request through PostgREST would: anon, authenticated (with a user id) or
// service_role. Setup (creating users, jobs, payments) acts as superuser or service_role.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../../..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function databaseUrl(): string {
  const url = process.env.RLS_DATABASE_URL;
  if (!url) {
    throw new Error(
      'RLS_DATABASE_URL is not set. Start the local database (npm run db:start), then put the DB URL from ' +
        '`npm run db:status` in a git-ignored .env file (see .env.example).',
    );
  }
  return url;
}

let pool: pg.Pool | undefined;
function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 4 });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type Row = Record<string, unknown>;

export type Attempt =
  | { ok: true; rows: Row[]; rowCount: number }
  | { ok: false; error: string; code: string | undefined };

/** SQLSTATE for "permission denied" (insufficient_privilege). */
const PERMISSION_DENIED = '42501';

export class Db {
  constructor(private readonly client: pg.PoolClient) {}

  private async setClaims(claims: Record<string, string> | null): Promise<void> {
    const json = claims ? JSON.stringify(claims) : '';
    await this.client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [json, claims?.sub ?? '', claims?.role ?? ''],
    );
  }

  /** The anon role, no user. */
  async asAnon(): Promise<this> {
    await this.client.query('reset role');
    await this.setClaims({ role: 'anon' });
    await this.client.query('set local role anon');
    return this;
  }

  /** A signed-in user (the authenticated role with that user id). */
  async asUser(userId: string): Promise<this> {
    await this.client.query('reset role');
    await this.setClaims({ sub: userId, role: 'authenticated' });
    await this.client.query('set local role authenticated');
    return this;
  }

  /** The API's service role: bypasses RLS, and passes the server-only guards. */
  async asService(): Promise<this> {
    await this.client.query('reset role');
    await this.setClaims({ role: 'service_role' });
    await this.client.query('set local role service_role');
    return this;
  }

  /** The database owner with no JWT. Used for setup that no API role could do (auth.users, admin role). */
  async asSuperuser(): Promise<this> {
    await this.client.query('reset role');
    await this.setClaims(null);
    return this;
  }

  async q(text: string, values: unknown[] = []): Promise<pg.QueryResult<Row>> {
    return this.client.query<Row>(text, values);
  }

  async rows(text: string, values: unknown[] = []): Promise<Row[]> {
    return (await this.q(text, values)).rows;
  }

  async one(text: string, values: unknown[] = []): Promise<Row> {
    const rows = await this.rows(text, values);
    if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}: ${text}`);
    return rows[0]!;
  }

  /** Runs a statement that may fail, without aborting the surrounding transaction. */
  async attempt(text: string, values: unknown[] = []): Promise<Attempt> {
    await this.client.query('savepoint attempt');
    try {
      const result = await this.client.query<Row>(text, values);
      await this.client.query('release savepoint attempt');
      return { ok: true, rows: result.rows, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      await this.client.query('rollback to savepoint attempt');
      const e = error as { message?: string; code?: string };
      return { ok: false, error: e.message ?? String(error), code: e.code };
    }
  }

  /** Asserts that a statement fails with a message matching the pattern. */
  async expectError(text: string, values: unknown[] = [], pattern: RegExp = /./): Promise<Attempt & { ok: false }> {
    const result = await this.attempt(text, values);
    if (result.ok) throw new Error(`expected an error matching ${pattern}, but the statement succeeded: ${text}`);
    if (!pattern.test(result.error)) {
      throw new Error(`expected an error matching ${pattern}, got: ${result.error}`);
    }
    return result;
  }

  /**
   * How many rows a statement returns (select) or affects (update, delete).
   * For a select, "permission denied" counts as 0: the role cannot see those rows either way,
   * whether a missing grant or row-level security is what stops it.
   */
  async count(text: string, values: unknown[] = []): Promise<number> {
    if (/^\s*select\b/i.test(text)) {
      const result = await this.attempt(text, values);
      if (result.ok) return result.rows.length;
      if (result.code === PERMISSION_DENIED) return 0;
      throw new Error(result.error);
    }
    const result = await this.q(text, values);
    return result.rowCount ?? 0;
  }
}

/**
 * Runs a test body inside a transaction that is always rolled back.
 * RLS_MUTATION_SQL, when set, is applied first. The mutation runner uses it to remove a policy
 * or guard and prove that the tests notice (see supabase/tests/mutation.mjs).
 */
export async function tx(body: (db: Db) => Promise<void>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (process.env.RLS_MUTATION_SQL) await client.query(process.env.RLS_MUTATION_SQL);
    await body(new Db(client));
  } finally {
    await client.query('rollback').catch(() => {});
    client.release();
  }
}
