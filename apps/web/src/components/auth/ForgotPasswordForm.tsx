'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { AUTH_CODE_LENGTH, PASSWORD_MIN_LENGTH } from '@healthhyr/shared';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { ButtonLabel, FormError, FormNotice, PageHeading, formClasses, useCooldown } from './FormParts';
import { RESEND_COOLDOWN_SECONDS } from './ConfirmEmailForm';
import { focusFirstInvalid } from './focus';

type Step = 'request' | 'reset';

/** Password reset with an emailed code: ask for the code, then enter it with a new password. */
export function ForgotPasswordForm() {
  const { service } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  function problem(result: { code: string; message: string; fieldErrors?: Record<string, string> }) {
    if (result.fieldErrors) setErrors(result.fieldErrors);
    else setFormError(result.message);
    setTimeout(() => focusFirstInvalid(formRef.current), 0);
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (!service || busy) return;
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    setNotice(undefined);

    const target = step === 'reset' ? sentTo : email;
    const result = await service.requestPasswordReset(target);
    setBusy(false);
    if (!result.ok) return problem(result);

    setSentTo(target.trim().toLowerCase());
    cooldown.start();
    if (step === 'reset') setNotice('If that email has an account, we sent a new code.');
    setStep('reset');
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    if (!service || busy) return;
    setBusy(true);
    setErrors({});
    setFormError(undefined);
    setNotice(undefined);

    const result = await service.resetPassword({ email: sentTo, code, newPassword });
    setBusy(false);
    if (!result.ok) problem(result);
    // On success the person is signed in and the page moves on by itself.
  }

  if (step === 'request') {
    return (
      <form ref={formRef} onSubmit={requestCode} noValidate aria-busy={busy} className={formClasses}>
        <PageHeading>Reset your password</PageHeading>
        <p className="text-base text-muted">Enter your email address and we will send you a {AUTH_CODE_LENGTH}-digit code.</p>

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

        <Button type="submit" disabled={busy || !service} aria-busy={busy}>
          <ButtonLabel busy={busy} busyLabel="Sending code">
            Send code
          </ButtonLabel>
        </Button>

        <p className="text-sm text-muted">
          <Link href="/sign-in" className="font-semibold underline">
            Back to sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={onReset} noValidate aria-busy={busy} className={formClasses}>
      <PageHeading>Choose a new password</PageHeading>
      <FormNotice>
        If <strong>{sentTo}</strong> has an account, we sent a {AUTH_CODE_LENGTH}-digit code to it. It works for 15 minutes.
      </FormNotice>

      {formError && <FormError>{formError}</FormError>}
      {notice && <FormNotice>{notice}</FormNotice>}

      <Field label="6-digit code" error={errors.code} required>
        {(control) => (
          <Input
            {...control}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={AUTH_CODE_LENGTH}
            disabled={busy}
          />
        )}
      </Field>

      <Field label="New password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} error={errors.newPassword} required>
        {(control) => (
          <Input
            {...control}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" disabled={busy || !service} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Saving">
          Save new password
        </ButtonLabel>
      </Button>

      <Button type="button" variant="ghost" onClick={() => void requestCode()} disabled={cooldown.remaining > 0 || busy}>
        {cooldown.remaining > 0 ? `Send a new code in ${cooldown.remaining}s` : 'Send a new code'}
      </Button>

      <p className="text-sm text-muted">
        <button
          type="button"
          className="font-semibold text-primary underline"
          onClick={() => {
            setStep('request');
            setCode('');
            setNewPassword('');
            setErrors({});
            setFormError(undefined);
            setNotice(undefined);
          }}
        >
          Use a different email
        </button>
      </p>
    </form>
  );
}
