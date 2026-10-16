// The one place errors become responses.
//
// Rule: a response never contains a stack trace, a file path, SQL, a database error message, or
// anything the caller sent us. Known errors (HttpError, validation, bad JSON) get fixed, friendly
// messages. Everything else becomes a generic 500. The full error is logged on the server, with the
// request id so support can find it.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError, notFound } from '../errors';
import { serializeError, type Logger } from '../logger';

interface PublicError {
  status: number;
  code: string;
  message: string;
  headers?: Record<string, string>;
  issues?: Array<{ path: string; message: string }>;
  /** True for errors we expect callers to cause. Unexpected ones are logged loudly. */
  expected: boolean;
}

const GENERIC: PublicError = {
  status: 500,
  code: 'internal_error',
  message: 'Something went wrong on our side. Please try again.',
  expected: false,
};

function bodyParserError(error: unknown): PublicError | null {
  if (typeof error !== 'object' || error === null) return null;
  const { type, status } = error as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || typeof status !== 'number') return null;
  if (!/^(entity|encoding|charset|request|stream|parameters)\./.test(type)) return null;

  if (status === 413) return { status, code: 'payload_too_large', message: 'The request is too large.', expected: true };
  if (status === 415) return { status, code: 'unsupported_media_type', message: 'Unsupported content type.', expected: true };
  if (type === 'entity.parse.failed') return { status: 400, code: 'invalid_json', message: 'The request body is not valid JSON.', expected: true };
  return { status: 400, code: 'bad_request', message: 'The request could not be read.', expected: true };
}

function toPublicError(error: unknown): PublicError {
  if (error instanceof HttpError) {
    return { status: error.status, code: error.code, message: error.message, headers: error.headers, expected: error.status < 500 };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'validation_error',
      message: 'Some fields are not valid.',
      issues: error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message.slice(0, 200),
      })),
      expected: true,
    };
  }
  return bodyParserError(error) ?? GENERIC;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    const mapped = toPublicError(error);
    if (!mapped.expected) {
      logger.error({ requestId: req.id, method: req.method, path: req.path, err: serializeError(error) }, 'request failed');
    }

    if (mapped.headers) res.set(mapped.headers);
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: req.id,
        ...(mapped.issues && { issues: mapped.issues }),
      },
    });
  };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound());
