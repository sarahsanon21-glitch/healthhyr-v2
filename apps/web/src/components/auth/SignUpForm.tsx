'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, SIGN_UP_ROLES } from '@healthhyr/shared';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { ConfirmEmailForm } from './ConfirmEmailForm';
import { ButtonLabel, FormError, PageHeading, formClasses } from './FormParts';
import { RoleChoice } from './RoleChoice';
import { focusFirstInvalid } from './focus';

export function SignUpForm() {
  const { service } = useAuth();
  const search = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  // "?role=employer" can preselect a choice. Anything else, including "admin", selects nothing.
  const requested = search.get('role') ?? '';
  const [role, setRole] = useState<string>((SIGN_UP_ROLES as readonly string[]).includes(requested) ? requested : '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!service || busy) return;
    setBusy(true);
    setErrors({});
    setFormError(undefined);

    const result = await service.signUp({ fullName, email, password, role });
    setBusy(false);

    if (result.ok) {
      // With email confirmation on, the session starts only after the code. Otherwise the page
      // moves on by itself once the API has confirmed the role.
      if (result.next === 'confirm_email') setConfirmEmail(email.trim().toLowerCase());
      return;
    }
    if (result.fieldErrors) setErrors(result.fieldErrors);
    else setFormError(result.message);
    setTimeout(() => focusFirstInvalid(formRef.current), 0);
  }

  if (confirmEmail) return <ConfirmEmailForm email={confirmEmail} />;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy} className={formClasses}>
      <PageHeading>Create your account</PageHeading>

      {formError && <FormError>{formError}</FormError>}

      <RoleChoice value={role} onChange={setRole} error={errors.role} disabled={busy} />

      <Field label="Your name" error={errors.fullName} required>
        {(control) => (
          <Input {...control} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" disabled={busy} />
        )}
      </Field>

      <Field label="Email" error={errors.email} required>
        {(control) => (
          <Input
            {...control}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={busy}
          />
        )}
      </Field>

      <Field label="Password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} error={errors.password} required>
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" disabled={busy || !service} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Creating account">
          Create account
        </ButtonLabel>
      </Button>

      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
