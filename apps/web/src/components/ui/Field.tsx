import type { ReactNode } from 'react';
import { cx } from './cx';
import { useSafeId } from './ids';
import { AlertIcon } from './Icons';

/** Props a control needs to be wired to its Field. Spread them onto Input, Textarea or Select. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** An error message with an icon and an "Error:" prefix for screen readers, so color is never the only cue. */
export function FieldError({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1 text-sm text-danger">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="sr-only">Error:</span> {children}
      </span>
    </p>
  );
}

export function Field({ label, hint, error, required, id: idProp, className, children }: FieldProps) {
  const generated = useSafeId();
  const id = idProp ?? `field-${generated}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');

  const control: FieldControlProps = { id };
  if (describedBy) control['aria-describedby'] = describedBy;
  if (error) control['aria-invalid'] = true;
  if (required) control['aria-required'] = true;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children(control)}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
