import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';
import { FieldError } from './Field';
import { useSafeId } from './ids';

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'children'> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export function Checkbox({ label, description, error, id: idProp, className, disabled, ...props }: CheckboxProps) {
  const generated = useSafeId();
  const id = idProp ?? `checkbox-${generated}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [props['aria-describedby'], descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <input
          {...props}
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error ? true : props['aria-invalid']}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex flex-col">
          <label htmlFor={id} className={cx('text-base', disabled ? 'text-muted' : 'text-ink')}>
            {label}
          </label>
          {description && (
            <p id={descriptionId} className="text-sm text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
