// Text rules shared by every schema. They mirror the CHECK constraints in migration 0002, so the API
// can answer with a friendly message before the database ever has to refuse a value.
import { z } from 'zod';

/** Control characters except tab, line feed and carriage return (what multi-line text may contain). */
// eslint-disable-next-line no-control-regex
const MULTILINE_FORBIDDEN = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** Every control character, including tab and new lines (what a single-line field may not contain). */
// eslint-disable-next-line no-control-regex
const SINGLE_LINE_FORBIDDEN = /[\u0001-\u001f\u007f]/;

export const hasNoControlCharacters = (value: string): boolean => !SINGLE_LINE_FORBIDDEN.test(value);
export const hasNoOddControlCharacters = (value: string): boolean => !MULTILINE_FORBIDDEN.test(value);

/** A trimmed single-line text with a maximum length. */
export const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .refine(hasNoControlCharacters, 'Remove line breaks and special characters.');

/** A trimmed multi-line text with a maximum length. */
export const multiLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .refine(hasNoOddControlCharacters, 'Remove special characters.');

// An empty box means "nothing", so it is stored as null rather than an empty string.
export const emptyToNull = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? null : value);
