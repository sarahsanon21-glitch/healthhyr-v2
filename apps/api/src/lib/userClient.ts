// Per-request Supabase client for USER-INITIATED reads and writes.
//
// It sends the user's own JWT, so Postgres runs the query as that user and row-level security
// applies. This is the default for every route that serves a signed-in person.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type UserClientFactory = (accessToken: string) => SupabaseClient;

export function createUserClientFactory(config: { url: string; anonKey: string }): UserClientFactory {
  return (accessToken) =>
    createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}
