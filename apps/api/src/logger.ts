export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

// Fields that database and HTTP client libraries put on their error objects. They are useful for
// diagnosing a failure and stay in the server log. They are never sent to a client.
const ERROR_FIELDS = ['name', 'message', 'code', 'details', 'hint', 'status', 'statusCode'] as const;

/**
 * Turns an unknown thrown value into something safe to log. Logs stay on the server.
 * Supabase and PostgREST errors are plain objects, not Error instances, so they are handled too.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const extra: Record<string, unknown> = {};
    for (const field of ERROR_FIELDS) {
      const value = (error as unknown as Record<string, unknown>)[field];
      if (value !== undefined && field !== 'name' && field !== 'message') extra[field] = value;
    }
    return {
      name: error.name,
      message: error.message,
      ...extra,
      stack: error.stack,
      ...(error.cause !== undefined && { cause: serializeError(error.cause) }),
    };
  }
  if (typeof error === 'object' && error !== null) {
    const picked: Record<string, unknown> = {};
    for (const field of ERROR_FIELDS) {
      const value = (error as Record<string, unknown>)[field];
      if (value !== undefined) picked[field] = value;
    }
    return Object.keys(picked).length > 0 ? picked : { value: Object.prototype.toString.call(error) };
  }
  return { value: String(error) };
}

/** One JSON object per line. Never pass tokens or keys in fields. */
export const consoleLogger: Logger = {
  info: (fields, message) => console.log(JSON.stringify({ level: 'info', message, ...fields })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: 'warn', message, ...fields })),
  error: (fields, message) => console.error(JSON.stringify({ level: 'error', message, ...fields })),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
