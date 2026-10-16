import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './cx';

export type CardElement = 'div' | 'section' | 'article' | 'li';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /** The element to render, so a card can be a list item or an article. */
  as?: CardElement;
  /** Inner padding. Turn off when the card holds edge-to-edge content. */
  padded?: boolean;
}

export function Card({ as = 'div', padded = true, className, ...props }: CardProps) {
  // All four elements accept the same props as a div here; the cast keeps the union simple.
  const Tag = as as 'div';
  return (
    <Tag className={cx('rounded-lg border border-line bg-surface shadow-card', padded && 'p-6', className)} {...props} />
  );
}
