// Supabase client for PUBLIC reads: no signed-in user, just the project's anon (publishable) key.
//
// Postgres runs the query as the `anon` role, so row-level security decides what is visible
// (for example, only company pages that have been listed). Routes that serve people who are not
// signed in use this client. It carries no user token and no service role.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAnonClient(config: { url: string; anonKey: string }): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
