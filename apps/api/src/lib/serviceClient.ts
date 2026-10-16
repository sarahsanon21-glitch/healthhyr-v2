// Service-role Supabase client. It BYPASSES row-level security.
//
// Allowed only for server-only operations that no user performs directly: Stripe webhooks,
// publish_job and the other server-only SQL functions, expiry and reconcile jobs, and audited
// admin actions. Those live in src/services/.
//
// A route that serves user requests must NOT import this file. If one genuinely must, it needs an
// explicit `// service-role-allowed: <reason>` comment, and it must check ownership in code,
// because the database will not. tests/service-role-scan.test.ts enforces both.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createServiceClient(config: { url: string; serviceRoleKey: string }): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
