'use client';

import { SIGN_UP_ROLES, type SignUpRole } from '@healthhyr/shared';
import { FieldError } from '../ui/Field';
import { useSafeId } from '../ui/ids';

// "admin" is not here and cannot be: the choices come from SIGN_UP_ROLES.
const CHOICES: Record<SignUpRole, { label: string; description: string }> = {
  seeker: { label: 'I am looking for work', description: 'Search jobs and apply.' },
  employer: { label: 'I am hiring', description: 'Post jobs and manage applicants.' },
};

export interface RoleChoiceProps {
  value: string;
  onChange: (role: SignUpRole) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function RoleChoice({ value, onChange, error, disabled }: RoleChoiceProps) {
  const base = useSafeId();
  const errorId = error ? `${base}-error` : undefined;

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={errorId} disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold text-ink">
        I am
        <span aria-hidden="true" className="text-danger">
          {' '}
          *
        </span>
      </legend>
      {SIGN_UP_ROLES.map((role) => (
        <label
          key={role}
          className="flex cursor-pointer items-start gap-3 rounded-md border border-muted bg-surface p-3 text-base text-ink"
        >
          <input
            type="radio"
            name="role"
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            aria-invalid={error ? true : undefined}
            aria-required="true"
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-semibold">{CHOICES[role].label}</span>
            <span className="text-sm text-muted">{CHOICES[role].description}</span>
          </span>
        </label>
      ))}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}
