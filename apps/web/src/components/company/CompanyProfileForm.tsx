'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { COMPANY_SIZES, companyProfileInputSchema, type CompanyProfileResponse } from '@healthhyr/shared';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthProvider';
import { ButtonLabel, FormError, FormNotice, formClasses } from '../auth/FormParts';
import { focusFirstInvalid } from '../auth/focus';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { Textarea } from '../ui/Textarea';

const FIELDS = ['companyName', 'description', 'website', 'industry', 'companySize', 'city', 'state'] as const;
type FieldName = (typeof FIELDS)[number];
type Values = Record<FieldName, string>;

const EMPTY: Values = { companyName: '', description: '', website: '', industry: '', companySize: '', city: '', state: '' };

const toValues = (company: CompanyProfileResponse): Values => ({
  companyName: company.companyName,
  description: company.description ?? '',
  website: company.website ?? '',
  industry: company.industry ?? '',
  companySize: company.companySize ?? '',
  city: company.city ?? '',
  state: company.state ?? '',
});

const isField = (path: string): path is FieldName => (FIELDS as readonly string[]).includes(path);

const LOAD_ERROR = 'We could not load your company profile. Check your connection and try again.';

type Load = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

/** The employer's company profile: load it, edit it, save it. Every state is shown, none is faked. */
export function CompanyProfileForm() {
  const { api } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<CompanyProfileResponse | null>(null);
  const [current, setCurrent] = useState<CompanyProfileResponse | null>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    api
      .getMyCompany()
      .then((company) => {
        if (cancelled) return;
        setValues(toValues(company));
        setCurrent(company);
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const missing = error instanceof ApiError && error.status === 404;
        setLoad({ status: 'error', message: missing ? 'Your company profile could not be found. Contact support if this continues.' : LOAD_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const set = (field: FieldName) => (event: { target: { value: string } }) => {
    setValues((previous) => ({ ...previous, [field]: event.target.value }));
    setSaved(null);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || busy) return;
    setErrors({});
    setFormError(undefined);
    setSaved(null);

    // The same rules the server applies. Nothing is sent when a field is not valid.
    const parsed = companyProfileInputSchema.safeParse(values);
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        if (isField(path) && !found[path]) found[path] = issue.message;
      }
      setErrors(found);
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    setBusy(true);
    try {
      const company = await api.saveMyCompany(parsed.data);
      setValues(toValues(company));
      setCurrent(company);
      setSaved(company);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error' && error.issues.length > 0) {
        const found: Partial<Record<FieldName, string>> = {};
        for (const issue of error.issues) if (isField(issue.path) && !found[issue.path]) found[issue.path] = issue.message;
        setErrors(found);
        setFormError('Some fields need your attention.');
        setTimeout(() => focusFirstInvalid(formRef.current), 0);
      } else if (error instanceof ApiError && error.status === 0) {
        setFormError('Could not reach HealthHyr. Check your connection and try again.');
      } else {
        setFormError('We could not save your changes. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (load.status === 'loading') {
    return (
      <div className="flex items-center gap-3 text-base text-muted">
        <Spinner label="Loading your company profile" />
        <span aria-hidden="true">Loading your company profile</span>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="flex max-w-modal-md flex-col items-start gap-4">
        <FormError>{load.message}</FormError>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  const stillDefault = current !== null && !current.isListed;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy} className={`${formClasses} max-w-modal-md`}>
      {formError && <FormError>{formError}</FormError>}

      {saved && (
        <FormNotice>
          {saved.isListed && saved.slug ? (
            <>
              Saved. Your company page is public.{' '}
              <Link href={`/companies/${saved.slug}`} className="font-semibold underline">
                View your public page
              </Link>
            </>
          ) : (
            'Saved. Your company page stays hidden until you change the company name.'
          )}
        </FormNotice>
      )}

      {stillDefault && !saved && (
        <p className="text-sm text-muted">Your public company page is hidden until you change the company name from &ldquo;My company&rdquo;.</p>
      )}
      {current?.isListed && current.slug && !saved && (
        <p className="text-sm text-muted">
          Your company page is public.{' '}
          <Link href={`/companies/${current.slug}`} className="font-semibold text-primary underline">
            View your public page
          </Link>
        </p>
      )}

      <Field
        label="Company name"
        required
        error={errors.companyName}
        hint="This is the name people see on your page and on your job posts."
      >
        {(control) => <Input {...control} value={values.companyName} onChange={set('companyName')} autoComplete="organization" disabled={busy} />}
      </Field>

      <Field label="About your company" error={errors.description} hint="Up to 5,000 characters.">
        {(control) => <Textarea {...control} rows={6} value={values.description} onChange={set('description')} disabled={busy} />}
      </Field>

      <Field label="Website" error={errors.website} hint="Start with https://">
        {(control) => <Input {...control} type="url" inputMode="url" value={values.website} onChange={set('website')} autoComplete="url" disabled={busy} />}
      </Field>

      <Field label="Industry" error={errors.industry}>
        {(control) => <Input {...control} value={values.industry} onChange={set('industry')} disabled={busy} />}
      </Field>

      <Field label="Company size" error={errors.companySize}>
        {(control) => (
          <Select {...control} value={values.companySize} onChange={set('companySize')} disabled={busy}>
            <option value="">Choose a size</option>
            {COMPANY_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} people
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="City" error={errors.city}>
        {(control) => <Input {...control} value={values.city} onChange={set('city')} autoComplete="address-level2" disabled={busy} />}
      </Field>

      <Field label="State" error={errors.state}>
        {(control) => <Input {...control} value={values.state} onChange={set('state')} autoComplete="address-level1" disabled={busy} />}
      </Field>

      <Button type="submit" disabled={busy || !api} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Saving">
          Save changes
        </ButtonLabel>
      </Button>
    </form>
  );
}
