import type { ReactNode } from 'react';
import { cx } from './cx';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** A button or link that moves the person forward. */
  action?: ReactNode;
  /** A decorative icon. Hidden from assistive tech. */
  icon?: ReactNode;
  /** The heading level, so the page outline stays correct. Use 1 when it is the whole page. */
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

/** What to show when a list or search has nothing in it. Never fill it with sample data. */
export function EmptyState({ title, description, action, icon, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as 'h2';
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="text-muted">
          {icon}
        </div>
      )}
      <Heading className="font-heading text-xl font-bold text-ink">{title}</Heading>
      {description && <p className="max-w-modal-sm text-base text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
