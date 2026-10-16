// The only place the web app reads environment variables. Every value is public: it is compiled
// into the browser bundle and anyone can read it. The web app never holds a server secret.
//
// Next.js only inlines `process.env.NEXT_PUBLIC_X` when the name is written out literally, which is
// why each variable is spelled out below instead of looked up in a loop.

export interface PublicEnv {
  apiBaseUrl: string;
  supabaseUrl: string;
  /** Supabase's publishable (anon) key. Safe in a browser because row-level security does the protecting. */
  supabasePublishableKey: string;
}

export class PublicEnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`The website is missing configuration: ${problems.join('; ')}`);
    this.name = 'PublicEnvError';
  }
}

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** True if the key is a Supabase secret or service-role key. A browser must never be given one. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const problems: string[] = [];
  const apiBaseUrl = source.NEXT_PUBLIC_API_BASE_URL?.trim();
  const supabaseUrl = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!apiBaseUrl) problems.push('NEXT_PUBLIC_API_BASE_URL is not set');
  else if (!isHttpUrl(apiBaseUrl)) problems.push('NEXT_PUBLIC_API_BASE_URL must be an http(s) URL');

  if (!supabaseUrl) problems.push('NEXT_PUBLIC_SUPABASE_URL is not set');
  else if (!isHttpUrl(supabaseUrl)) problems.push('NEXT_PUBLIC_SUPABASE_URL must be an http(s) URL');

  if (!key) problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');
  else if (looksLikeSecretKey(key)) problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the publishable key, not a secret or service-role key');

  if (problems.length > 0) throw new PublicEnvError(problems);
  return {
    apiBaseUrl: apiBaseUrl!.replace(/\/$/, ''),
    supabaseUrl: supabaseUrl!.replace(/\/$/, ''),
    supabasePublishableKey: key!,
  };
}

export function readPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
