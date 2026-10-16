import { useId } from 'react';

/** A React id that is safe to use in element ids and CSS selectors. */
export function useSafeId(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}
