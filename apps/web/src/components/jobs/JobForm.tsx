'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  CARE_ROLES,
  CARE_ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  JOB_LIMITS,
  PAY_PERIODS,
  PAY_PERIOD_LABELS,
  jobInputSchema,
  type JobDetail,
  type JobInputBody,
} from '@healthhyr/shared';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthProvider';
import { ButtonLabel, FormError, FormNotice, formClasses } from '../auth/FormParts';
import { focusFirstInvalid } from '../auth/focus';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

const FIELDS = ['title', 'description', 'careRole', 'employmentType', 'city', 'state', 'zip', 'payMin', 'payMax', 'payPeriod', 'easyApply'] as const;
type FieldName = (typeof FIELDS)[number];

interface Values {
  title: string;
  description: string;
  careRole: string;
  employmentType: string;
  city: string;
  state: string;
  zip: string;
  payMin: string;
  payMax: string;
  payPeriod: string;
  easyApply: boolean;
}

const EMPTY: Values = { title: '', description: '', careRole: '', employmentType: '', city: '', state: '', zip: '', payMin: '', payMax: '', payPeriod: '', easyApply: true };

const toValues = (job: JobDetail): Values => ({
  title: job.title,
  description: job.description,
  careRole: job.careRole,
  employmentType: job.employmentType,
  city: job.city,
  state: job.state,
  zip: job.zip ?? '',
  payMin: job.payMin === null ? '' : String(job.payMin),
  payMax: job.payMax === null ? '' : String(job.payMax),
  payPeriod: job.payPeriod ?? '',
  easyApply: job.easyApply,
});

const isField = (path: string): path is FieldName => (FIELDS as readonly string[]).includes(path);

const MONEY = /^\d{1,8}(\.\d{1,2})?$/;
const MONEY_ERROR = 'Enter an amount such as 18 or 18.50.';

/** Pay is typed as text; turn it into a number, or say what is wrong with it. */
function money(text: string): { value: number | ''; error?: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { value: '' };
  if (!MONEY.test(trimmed)) return { value: '', error: MONEY_ERROR };
  return { value: Number(trimmed) };
}

export interface JobFormProps {
  /** The job being edited. Leave out to create a new draft. */
  job?: JobDetail;
  /** True while the job waits for payment: every field is shown but cannot be changed. */
  locked?: boolean;
  /** Called with the saved job, after a create or a save. */
  onSaved: (job: JobDetail) => void;
}

/** Create a draft or edit a job. A draft may be unfinished: what is still missing is shown beside the form. */
export function JobForm({ job, locked = false, onSaved }: JobFormProps) {
  const { api } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>(job ? toValues(job) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const editing = job !== undefined;
  const disabled = busy || locked;

  const set = (field: FieldName) => (event: { target: { value: string } }) => {
    setValues((previous) => ({ ...previous, [field]: event.target.value }));
    setSaved(false);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || disabled) return;
    setErrors({});
    setFormError(undefined);
    setSaved(false);

    const min = money(values.payMin);
    const max = money(values.payMax);
    const body: JobInputBody = {
      title: values.title,
      description: values.description,
      careRole: values.careRole as JobInputBody['careRole'],
      employmentType: values.employmentType as JobInputBody['employmentType'],
      city: values.city,
      state: values.state,
      zip: values.zip,
      payMin: min.value,
      payMax: max.value,
      payPeriod: values.payPeriod as JobInputBody['payPeriod'],
      easyApply: values.easyApply,
    };

    // The same rules the server applies. Nothing is sent when a field is not valid.
    const found: Partial<Record<FieldName, string>> = {};
    if (min.error) found.payMin = min.error;
    if (max.error) found.payMax = max.error;
    const parsed = jobInputSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        if (isField(path) && !found[path]) found[path] = issue.message;
      }
    }
    if (Object.keys(found).length > 0 || !parsed.success) {
      setErrors(found);
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    setBusy(true);
    try {
      const result = job ? await api.updateJob(job.id, parsed.data) : await api.createJob(parsed.data);
      setValues(toValues(result));
      setSaved(true);
      onSaved(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error' && error.issues.length > 0) {
        const fromServer: Partial<Record<FieldName, string>> = {};
        for (const issue of error.issues) if (isField(issue.path) && !fromServer[issue.path]) fromServer[issue.path] = issue.message;
        setErrors(fromServer);
        setFormError('Some fields need your attention.');
        setTimeout(() => focusFirstInvalid(formRef.current), 0);
      } else if (error instanceof ApiError && error.code === 'job_locked') {
        setFormError('Payment is in progress, so this job cannot be edited. Cancel checkout first.');
      } else if (error instanceof ApiError && error.status === 0) {
        setFormError('Could not reach HealthHyr. Check your connection and try again.');
      } else {
        setFormError(`We could not save ${editing ? 'your changes' : 'this job'}. Please try again.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy} className={`${formClasses} max-w-modal-md`}>
      {formError && <FormError>{formError}</FormError>}
      {saved && editing && <FormNotice>Saved.</FormNotice>}
      {locked && <p className="text-sm text-muted">These fields are locked while payment is in progress. Cancel checkout to edit them.</p>}

      <Field label="Job title" required error={errors.title} hint={`Up to ${JOB_LIMITS.titleMax} characters. At least ${JOB_LIMITS.titleMin} are needed before it can be published.`}>
        {(control) => <Input {...control} value={values.title} onChange={set('title')} disabled={disabled} />}
      </Field>

      <Field label="Role" required error={errors.careRole}>
        {(control) => (
          <Select {...control} value={values.careRole} onChange={set('careRole')} disabled={disabled}>
            <option value="">Choose a role</option>
            {CARE_ROLES.map((role) => (
              <option key={role} value={role}>
                {CARE_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Employment type" required error={errors.employmentType}>
        {(control) => (
          <Select {...control} value={values.employmentType} onChange={set('employmentType')} disabled={disabled}>
            <option value="">Choose a type</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="City" required error={errors.city}>
        {(control) => <Input {...control} value={values.city} onChange={set('city')} autoComplete="address-level2" disabled={disabled} />}
      </Field>

      <Field label="State" required error={errors.state}>
        {(control) => <Input {...control} value={values.state} onChange={set('state')} autoComplete="address-level1" disabled={disabled} />}
      </Field>

      <Field label="ZIP code" error={errors.zip} hint="Optional.">
        {(control) => <Input {...control} value={values.zip} onChange={set('zip')} inputMode="numeric" autoComplete="postal-code" disabled={disabled} />}
      </Field>

      <Field
        label="Description"
        required
        error={errors.description}
        hint={`Up to ${JOB_LIMITS.descriptionMax.toLocaleString('en-US')} characters. At least ${JOB_LIMITS.descriptionMin} are needed before it can be published.`}
      >
        {(control) => <Textarea {...control} rows={8} value={values.description} onChange={set('description')} disabled={disabled} />}
      </Field>

      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="text-sm font-semibold text-ink">Pay (optional)</legend>
        <Field label="Minimum pay" error={errors.payMin}>
          {(control) => <Input {...control} inputMode="decimal" value={values.payMin} onChange={set('payMin')} disabled={disabled} />}
        </Field>
        <Field label="Maximum pay" error={errors.payMax}>
          {(control) => <Input {...control} inputMode="decimal" value={values.payMax} onChange={set('payMax')} disabled={disabled} />}
        </Field>
        <Field label="Pay period" error={errors.payPeriod} hint="Needed if you enter any pay.">
          {(control) => (
            <Select {...control} value={values.payPeriod} onChange={set('payPeriod')} disabled={disabled}>
              <option value="">Choose a period</option>
              {PAY_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {PAY_PERIOD_LABELS[period]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>

      <Checkbox
        label="Easy Apply"
        description="Seekers can apply with their HealthHyr profile."
        checked={values.easyApply}
        onChange={(event) => {
          setValues((previous) => ({ ...previous, easyApply: event.target.checked }));
          setSaved(false);
        }}
        disabled={disabled}
      />

      <Button type="submit" disabled={disabled || !api} aria-busy={busy}>
        <ButtonLabel busy={busy} busyLabel="Saving">
          {editing ? 'Save changes' : 'Create draft'}
        </ButtonLabel>
      </Button>
    </form>
  );
}
