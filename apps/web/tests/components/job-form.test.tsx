import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobForm } from '../../src/components/jobs/JobForm';
import { ApiError } from '../../src/lib/api/client';
import { makeApi, makeFakeService, makeJob, signedIn } from '../helpers/auth';
import { setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/dashboard/jobs/new'));

function renderForm(props: Partial<React.ComponentProps<typeof JobForm>> = {}, jobs: Parameters<typeof makeApi>[2] = {}) {
  const { service } = makeFakeService(signedIn('employer'));
  const api = makeApi('employer', {}, jobs);
  const onSaved = vi.fn();
  renderWithAuth(<JobForm onSaved={onSaved} {...props} />, service, api);
  return { api, onSaved };
}

const input = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(input(/^Job title/), 'Home health aide');
  await user.selectOptions(screen.getByLabelText(/^Role/), 'hha');
  await user.selectOptions(screen.getByLabelText(/^Employment type/), 'part_time');
  await user.type(input(/^City/), 'Austin');
  await user.type(input(/^State/), 'TX');
  await user.click(input(/^Description/));
  await user.paste('Support clients with daily living activities in their homes.');
}

describe('job form: the fields', () => {
  it('has labelled fields, marks the required ones, and offers real labels for roles, types and pay periods', async () => {
    renderForm();
    for (const label of [/^Job title/, /^Role/, /^Employment type/, /^City/, /^State/, /^Description/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    }
    for (const label of [/^ZIP code/, /^Minimum pay/, /^Maximum pay/, /^Pay period/]) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-required');
    }
    const options = (label: RegExp) => [...screen.getByLabelText(label).querySelectorAll('option')].map((o) => o.textContent);
    expect(options(/^Role/)).toEqual([
      'Choose a role',
      'Personal care aide (PCA)',
      'Home health aide (HHA)',
      'Certified nursing assistant (CNA)',
      'Registered nurse (RN)',
      'Licensed practical nurse (LPN)',
      'Caregiver',
      'Other',
    ]);
    expect(options(/^Employment type/)).toEqual(['Choose a type', 'Full time', 'Part time', 'Per diem', 'Contract', 'Live-in']);
    expect(options(/^Pay period/)).toEqual(['Choose a period', 'per hour', 'per day', 'per week', 'per month', 'per year']);
    expect(screen.getByRole('checkbox', { name: /Easy Apply/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled();
    await expectClassesGenerated();
  });

  it('has no field for status, payment, dates or owner', () => {
    renderForm();
    expect(screen.queryByLabelText(/status|payment|published|expires|owner|employer/i)).not.toBeInTheDocument();
  });

  it('is empty when creating, and filled with the job when editing', () => {
    renderForm({ job: makeJob({ title: 'Night nurse', zip: '78701', payMin: 20, payMax: 25.5, payPeriod: 'hour', easyApply: false }) });
    expect(input(/^Job title/)).toHaveValue('Night nurse');
    expect(input(/^ZIP code/)).toHaveValue('78701');
    expect(input(/^Minimum pay/)).toHaveValue('20');
    expect(input(/^Maximum pay/)).toHaveValue('25.5');
    expect(screen.getByLabelText(/^Pay period/)).toHaveValue('hour');
    expect(screen.getByRole('checkbox', { name: /Easy Apply/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});

describe('job form: validation', () => {
  it('an empty form is refused before anything is sent, with a message for each required field and focus on the first', async () => {
    const user = userEvent.setup();
    const { api, onSaved } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    for (const message of ['Enter a job title.', 'Choose a role.', 'Choose an employment type.', 'Enter a city.', 'Enter a state.', 'Describe the job.']) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(input(/^Job title/)).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(input(/^Job title/)).toHaveFocus());
    expect(api.createJob).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('text over its limit is explained', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.click(input(/^Job title/));
    await user.paste('x'.repeat(110)); // 16 + 110 = 126 characters
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Use 120 characters or fewer.')).toBeInTheDocument();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it('pay that is not an amount is explained', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.type(input(/^Minimum pay/), 'a lot');
    await user.type(input(/^Maximum pay/), '12.345');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findAllByText('Enter an amount such as 18 or 18.50.')).toHaveLength(2);
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it('a maximum below the minimum is explained', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.type(input(/^Minimum pay/), '30');
    await user.type(input(/^Maximum pay/), '20');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Maximum pay must be at least the minimum')).toBeInTheDocument();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it('a bad ZIP code is explained', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.type(input(/^ZIP code/), '12');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Enter a valid ZIP code')).toBeInTheDocument();
    expect(api.createJob).not.toHaveBeenCalled();
  });
});

describe('job form: creating a draft', () => {
  it('sends the cleaned values (numbers for pay, null for empty boxes) and nothing the server decides', async () => {
    const user = userEvent.setup();
    const { api, onSaved } = renderForm();
    await fillRequired(user);
    await user.type(input(/^Minimum pay/), '18');
    await user.type(input(/^Maximum pay/), '22.50');
    await user.selectOptions(screen.getByLabelText(/^Pay period/), 'hour');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(api.createJob).toHaveBeenCalledTimes(1));
    const sent = api.createJob.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toEqual({
      title: 'Home health aide',
      description: 'Support clients with daily living activities in their homes.',
      careRole: 'hha',
      employmentType: 'part_time',
      city: 'Austin',
      state: 'TX',
      zip: null,
      payMin: 18,
      payMax: 22.5,
      payPeriod: 'hour',
      easyApply: true,
    });
    for (const key of ['status', 'paymentId', 'payment_id', 'publishedAt', 'expiresAt', 'employerId', 'id']) expect(sent).not.toHaveProperty(key);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('a draft may be unfinished: pay with no period, and a short description, are sent', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.type(input(/^Minimum pay/), '18');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(api.createJob).toHaveBeenCalled());
    expect((api.createJob.mock.calls[0]![0] as Record<string, unknown>).payPeriod).toBeNull();
  });

  it('turning Easy Apply off is sent', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: /Easy Apply/ }));
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(api.createJob).toHaveBeenCalled());
    expect((api.createJob.mock.calls[0]![0] as Record<string, unknown>).easyApply).toBe(false);
  });

  it('shows a busy state while saving: disabled fields and button, aria-busy, an announced spinner, and no second request', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { api } = renderForm({}, { create: () => new Promise((resolve) => (release = () => resolve(makeJob()))) as never });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    const button = await screen.findByRole('button', { name: /Saving/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(input(/^Job title/)).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving');
    await user.click(button);
    expect(api.createJob).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });
});

describe('job form: problems saving', () => {
  it('field problems from the server are shown on those fields', async () => {
    const user = userEvent.setup();
    renderForm({}, { create: new ApiError(400, 'validation_error', 'Some fields are not valid.', 'r', [{ path: 'city', message: 'Enter a city.' }]) });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Enter a city.')).toBeInTheDocument();
    expect(input(/^City/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Some fields need your attention.')).toBeInTheDocument();
  });

  it.each([
    ['the network is down', new ApiError(0, 'network', 'ECONNREFUSED 10.0.0.1'), 'Could not reach HealthHyr. Check your connection and try again.'],
    ['the server fails', new ApiError(500, 'internal_error', 'SELECT * FROM jobs failed'), 'We could not save this job. Please try again.'],
    ['the job is locked', new ApiError(409, 'job_locked', 'Cancel checkout before editing this job.'), 'Payment is in progress, so this job cannot be edited. Cancel checkout first.'],
  ])('%s: a friendly message, never the server’s words, and the form keeps what was typed', async (_name, error, message) => {
    const user = userEvent.setup();
    renderForm({}, { create: error });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent(/ECONNREFUSED|SELECT/);
    expect(input(/^Job title/)).toHaveValue('Home health aide');
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled();
  });
});

describe('job form: editing', () => {
  it('saves changes with every editable field, shows Saved, and reports the saved job', async () => {
    const user = userEvent.setup();
    const job = makeJob({ title: 'Home health aide' });
    const { api, onSaved } = renderForm({ job });
    const title = input(/^Job title/);
    await user.clear(title);
    await user.type(title, 'Senior home health aide');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateJob).toHaveBeenCalledTimes(1));
    const [id, sent] = api.updateJob.mock.calls[0]! as [string, Record<string, unknown>];
    expect(id).toBe(job.id);
    expect(sent).toMatchObject({ title: 'Senior home health aide', careRole: 'hha', city: 'Austin' });
    for (const key of ['status', 'paymentId', 'publishedAt', 'expiresAt', 'employerId']) expect(sent).not.toHaveProperty(key);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('the Saved notice goes away when you edit again', async () => {
    const user = userEvent.setup();
    renderForm({ job: makeJob() });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('status');
    await user.type(input(/^City/), 'x');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is locked while payment is in progress: every field and the button are disabled, with a clear note', async () => {
    const user = userEvent.setup();
    const { api } = renderForm({ job: makeJob({ status: 'pending_payment' }), locked: true });
    for (const label of [/^Job title/, /^Role/, /^Employment type/, /^City/, /^State/, /^ZIP code/, /^Description/, /^Minimum pay/, /^Maximum pay/, /^Pay period/]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByRole('checkbox', { name: /Easy Apply/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText(/locked while payment is in progress/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(api.updateJob).not.toHaveBeenCalled();
  });
});
