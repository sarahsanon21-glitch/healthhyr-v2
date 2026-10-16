import { cx } from './cx';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const sizes: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export interface SpinnerProps {
  /** Announced to screen readers. */
  label?: string;
  size?: SpinnerSize;
  className?: string;
}

/** A loading indicator. The animation stops for people who prefer reduced motion; the label still announces. */
export function Spinner({ label = 'Loading', size = 'md', className }: SpinnerProps) {
  return (
    <span role="status" className={cx('inline-flex items-center', className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className={cx('animate-spin text-primary motion-reduce:animate-none', sizes[size])}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
