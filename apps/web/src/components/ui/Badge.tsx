import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './cx';

export type BadgeVariant = 'lime' | 'neutral' | 'primary' | 'danger';

// Lime is a fill only, always with Ink text.
const variants: Record<BadgeVariant, string> = {
  lime: 'bg-lime text-ink',
  neutral: 'border border-line bg-surface text-ink',
  primary: 'bg-primary text-surface',
  danger: 'bg-danger text-surface',
};

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'lime', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', variants[variant], className)}
      {...props}
    />
  );
}
