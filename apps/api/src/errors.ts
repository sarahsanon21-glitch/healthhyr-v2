/**
 * An error whose message is written to be shown to the person using the app.
 * Anything that is not an HttpError is treated as unexpected and answered with a generic 500.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthorized = (code = 'unauthorized', message = 'Sign in to continue.') =>
  new HttpError(401, code, message, { 'WWW-Authenticate': 'Bearer' });

export const forbidden = (code = 'forbidden', message = 'You do not have access to this.') =>
  new HttpError(403, code, message);

export const notFound = () => new HttpError(404, 'not_found', 'Not found.');
