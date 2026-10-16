'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';
import { useSafeId } from './ids';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** A controlled on/off switch. A button with role="switch", so Space and Enter both toggle it. */
export function Switch({ checked, onCheckedChange, label, description, disabled, id: idProp, className }: SwitchProps) {
  const generated = useSafeId();
  const id = idProp ?? `switch-${generated}`;
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-1">
        <label id={labelId} htmlFor={id} className="text-base font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-surface shadow-card',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
