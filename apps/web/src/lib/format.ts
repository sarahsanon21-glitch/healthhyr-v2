// Small formatting helpers. Dates are shown in UTC so the same job shows the same date to everyone
// and tests do not depend on the machine's time zone.

/** "January 5, 2026", or an empty string when the value is missing or not a date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Joins the names of what is missing into plain words: "a, b and c". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
