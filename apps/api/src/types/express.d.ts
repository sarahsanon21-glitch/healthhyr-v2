import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '@healthhyr/shared';

export interface AuthContext {
  userId: string;
  /** Always read from the profiles table, never from the token or the request. */
  role: UserRole;
  /** A Supabase client that carries this user's JWT, so row-level security applies to every query. */
  db: SupabaseClient;
}

declare global {
  namespace Express {
    interface Request {
      /** Unique id for this request, also sent back as X-Request-Id. */
      id: string;
      auth?: AuthContext;
    }
  }
}
