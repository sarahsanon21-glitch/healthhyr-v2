'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckIcon } from '../ui/Icons';
import { FieldError } from '../ui/Field';
import { Spinner } from '../ui/Spinner';
import { cx } from '../ui/cx';

/** A message for the whole form, announced to screen readers, with an icon so color is never alone. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border-2 border-danger bg-surface p-3">
      <FieldError>{children}</FieldError>
    </div>
  );
}

/** A friendly confirmation ("we sent a code"), also announced politely. */
export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-lime p-3 text-sm text-ink">
      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** The text of a submit button, with a spinner while the request runs. */
export function ButtonLabel({ busy, busyLabel, children }: { busy: boolean; busyLabel: string; children: ReactNode }) {
  return busy ? (
    <span className="inline-flex items-center gap-2">
      <Spinner size="sm" label={busyLabel} />
      <span aria-hidden="true">{busyLabel}</span>
    </span>
  ) : (
    <>{children}</>
  );
}

export const formClasses = 'flex flex-col gap-4';

export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('font-heading text-2xl font-bold text-ink', className)}>{children}</h1>;
}

/**
 * Counts down from `seconds` after `start()`, for "send a new code" buttons. It works from an end
 * time, so the count stays right even if the browser slows the timer down in a background tab.
 */
export function useCooldown(seconds: number): { remaining: number; start: () => void } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setEndsAt(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return {
    remaining,
    start: () => {
      setRemaining(seconds);
      setEndsAt(Date.now() + seconds * 1000);
    },
  };
}
