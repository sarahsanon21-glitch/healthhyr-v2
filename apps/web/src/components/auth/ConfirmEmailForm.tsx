'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AUTH_CODE_LENGTH } from '@healthhyr/shared';
import { useAuth } from '../../lib/auth/AuthProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { ButtonLabel, FormError, FormNotice, PageHeading, formClasses, useCooldown } from './FormParts';
import { focusFirstInvalid } from './focus';

export const RESEND_COOLDOWN_SECONDS = 30;

/** Step two of sign-up: type the 6-digit code that was emailed. On success the session starts and the page moves on. */
export function ConfirmEmailForm({ email }: { email: string }) {
  const { service } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!service || busy) return;
    setBusy(true);
    setCodeError(undefined);
    setFormError(undefined);
    setNotice(undefined);

    const result = await service.confirmSignUp({ email, code });
    setBusy(false);
    if (result.ok) return;

    if (result.fieldErrors?.code) setCodeError(result.fieldErrors.code);
    else setFormError(result.message);
    setTimeout(() => focusFirstInvalid(formRef.current), 0);
  }

  async function onResend() {
    if (!service || cooldown.remaining > 0) return;
    setFormError(undefined);
    setNotice(undefined);
    const result = await service.resendSignUpCode(email);
    if (result.ok) {
      setNotice('We sent you a new code.');
      cooldown.start();
    } else {
      setFormError(result.message);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy} className={formClasses}>
      <PageHeading>Check your email</PageHeading>
      <p className="text-base text-muted">
        We sent a {AUTH_CODE_LENGTH}-digit code to <strong className="text-ink">{email}</strong>. Enter it to finish creating your account. It works for 15 minutes.
      </p>

      {formError && <FormError>{formError}</FormError>}
      {notice && <FormNotice>{notice}</FormNotice>}

      <Field label="6-digit code" error={codeError} required>
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

      <Button type="submit" disabled={busy || !service} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Confirming">
          Confirm email
        </ButtonLabel>
      </Button>

      <Button type="button" variant="ghost" onClick={onResend} disabled={cooldown.remaining > 0 || busy}>
        {cooldown.remaining > 0 ? `Send a new code in ${cooldown.remaining}s` : 'Send a new code'}
      </Button>
    </form>
  );
}
