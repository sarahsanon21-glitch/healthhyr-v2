import type { ReactNode } from 'react';
import { cx } from './cx';

export interface SplitPaneProps {
  /** The list, on the left. */
  list: ReactNode;
  /** The detail for the selected item, on the right. Pass an EmptyState when nothing is selected. */
  detail: ReactNode;
  /** Names the two regions for screen readers. */
  listLabel: string;
  detailLabel: string;
  /** On small screens only one pane shows. True shows the detail (the caller provides a way back). */
  showDetail?: boolean;
  className?: string;
}

/** List on the left, detail on the right (the job search layout). The detail stays in view while the list scrolls. */
export function SplitPane({ list, detail, listLabel, detailLabel, showDetail = false, className }: SplitPaneProps) {
  return (
    <div className={cx('grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]', className)}>
      <section aria-label={listLabel} className={cx('min-w-0', showDetail && 'hidden lg:block')}>
        {list}
      </section>
      <section
        aria-label={detailLabel}
        className={cx('min-w-0 lg:sticky lg:top-4 lg:max-h-screen lg:self-start lg:overflow-y-auto', !showDetail && 'hidden lg:block')}
      >
        {detail}
      </section>
    </div>
  );
}
