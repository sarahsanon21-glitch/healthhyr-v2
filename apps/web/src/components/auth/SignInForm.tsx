'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { ConfirmEmailForm } from './ConfirmEmailForm';
import { ButtonLabel, FormError, PageHeading, formClasses } from './FormParts';
import { focusFirstInvalid } from './focus';

export function SignInForm() {
  const { service } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
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

    const result = await service.signIn({ email, password });
    setBusy(false);
    if (result.ok) return; // The page moves on by itself once the API has confirmed the role.

    if (result.code === 'email_not_confirmed') {
      setConfirmEmail(email.trim().toLowerCase());
      return;
    }
    if (result.fieldErrors) setErrors(result.fieldErrors);
    else setFormError(result.message);
    setTimeout(() => focusFirstInvalid(formRef.current), 0);
  }

  if (confirmEmail) return <ConfirmEmailForm email={confirmEmail} />;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy} className={formClasses}>
      <PageHeading>Sign in</PageHeading>

      {formError && <FormError>{formError}</FormError>}

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

      <Field label="Password" error={errors.password} required>
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" disabled={busy || !service} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Signing in">
          Sign in
        </ButtonLabel>
      </Button>

      <p className="text-sm text-muted">
        <Link href="/forgot-password" className="font-semibold underline">
          Forgot your password?
        </Link>
      </p>
      <p className="text-sm text-muted">
        New to HealthHyr?{' '}
        <Link href="/sign-up" className="font-semibold underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
