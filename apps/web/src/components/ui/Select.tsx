import type { ComponentPropsWithRef } from 'react';
import { controlClasses } from './controls';
import { cx } from './cx';
import { ChevronDownIcon } from './Icons';

export type SelectProps = ComponentPropsWithRef<'select'>;

/** A native select (keyboard and screen reader behavior come for free) with a styled chevron. */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select className={cx(controlClasses, 'appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
