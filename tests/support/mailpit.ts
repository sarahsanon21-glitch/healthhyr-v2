// Reads emails from the local mail catcher (Mailpit, started with the local Supabase).
// Tests use it to get the 6-digit codes that sign-up confirmation and password reset email out.
// Nothing here is used outside tests.
const BASE = (process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/$/, '');

interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`mail catcher ${path} answered ${response.status}`);
  return response;
}

async function mailpit<T>(path: string): Promise<T> {
  return (await (await call(path)).json()) as T;
}

export interface CodeOptions {
  /** Only emails whose subject contains this text (for example "confirmation" or "reset"). */
  subjectIncludes?: string;
  /** Only emails received after this moment, so a resent code is not confused with the first one. */
  since?: Date;
  timeoutMs?: number;
}

/** Waits for an email to this address and returns the 6-digit code in it. */
export async function waitForCode(email: string, options: CodeOptions = {}): Promise<string> {
  const { subjectIncludes, since, timeoutMs = 10_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { messages } = await mailpit<{ messages: MailSummary[] }>(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const matches = messages
      .filter((m) => !subjectIncludes || m.Subject.toLowerCase().includes(subjectIncludes.toLowerCase()))
      .filter((m) => !since || new Date(m.Created) > since)
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());

    const newest = matches[0];
    if (newest) {
      const full = await mailpit<{ Text: string }>(`/api/v1/message/${newest.ID}`);
      const code = /\b(\d{6})\b/.exec(full.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no email with a code arrived for ${email} within ${timeoutMs} ms`);
}

/** Deletes every email sent to this address. */
export async function clearMailFor(email: string): Promise<void> {
  const { messages } = await mailpit<{ messages: MailSummary[] }>(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (messages.length === 0) return;
  await call('/api/v1/messages', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ IDs: messages.map((m) => m.ID) }),
  });
}

/** True when the mail catcher answers. Used by the integration test setup. */
export async function mailCatcherIsUp(): Promise<boolean> {
  try {
    await call('/api/v1/info');
    return true;
  } catch {
    return false;
  }
}
