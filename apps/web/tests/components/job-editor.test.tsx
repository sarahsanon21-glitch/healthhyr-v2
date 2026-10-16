import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployerLayout from '../../src/app/(employer)/layout';
import EditJobPage from '../../src/app/(employer)/dashboard/jobs/[id]/page';
import { JobEditor } from '../../src/components/jobs/JobEditor';
import { ApiError } from '../../src/lib/api/client';
import { JOB_ID, makeApi, makeFakeService, makeJob, signedIn } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation(`/dashboard/jobs/${JOB_ID}`));

const FUTURE = '2099-06-15T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

function renderEditor(jobs: Parameters<typeof makeApi>[2] = {}) {
  const { service } = makeFakeService(signedIn('employer'));
  const api = makeApi('employer', {}, jobs);
  renderWithAuth(<JobEditor id={JOB_ID} />, service, api);
  return { api };
}

const status = () => within(screen.getByRole('region', { name: 'Status' }));

describe('job editor: loading', () => {
  it('shows an announced spinner while the job loads, then the job', async () => {
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.getJob.mockImplementation(() => new Promise(() => {}));
    renderWithAuth(<JobEditor id={JOB_ID} />, service, api);
    expect(screen.getByRole('status')).toHaveTextContent('Loading this job');
    expect(screen.queryByRole('region', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('asks the API for this job id', async () => {
    const { api } = renderEditor();
    await screen.findByRole('region', { name: 'Status' });
    expect(api.getJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('a failed load shows a friendly message (never the server’s words) and Try again loads again', async () => {
    const user = userEvent.setup();
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.getJob.mockRejectedValueOnce(new ApiError(500, 'internal_error', 'SELECT * FROM jobs failed'));
    renderWithAuth(<JobEditor id={JOB_ID} />, service, api);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this job. Check your connection and try again.');
    expect(document.body).not.toHaveTextContent('SELECT');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Status' })).toBeInTheDocument();
  });

  it('a job that is not found (or is not yours) says so', async () => {
    renderEditor({ get: new ApiError(404, 'not_found', 'Not found.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('This job could not be found. It may have been deleted.');
  });
});

describe('job editor: a draft', () => {
  it('lists in plain words what is still missing before it can be published', async () => {
    renderEditor({ get: makeJob({ missingFields: ['title', 'description', 'pay_period'] }) });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Draft')).toBeInTheDocument();
    expect(status().getByText(/Before this job can be published you still need a job title of at least 5 characters, a description of at least 50 characters and a pay period for the pay you entered\./)).toBeInTheDocument();
    await expectClassesGenerated();
  });

  it('a complete draft says so, and honestly says payment and publishing are not available yet', async () => {
    renderEditor();
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('This job has everything it needs. Payment and publishing are not available yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(pay|publish|checkout)/i })).not.toBeInTheDocument();
  });

  it('the form shows the job and can be edited', async () => {
    renderEditor({ get: makeJob({ title: 'Night nurse' }) });
    expect(await screen.findByLabelText(/^Job title/)).toHaveValue('Night nurse');
    expect(screen.getByLabelText(/^Job title/)).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Cancel checkout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close job' })).not.toBeInTheDocument();
  });

  describe('deleting it', () => {
    it('asks first; "Keep it" closes the question and deletes nothing', async () => {
      const user = userEvent.setup();
      const { api } = renderEditor();
      await user.click(await screen.findByRole('button', { name: 'Delete draft' }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete this draft?' });
      expect(within(dialog).getByText(/“Home health aide” will be removed\./)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.deleteJob).not.toHaveBeenCalled();
    });

    it('confirming deletes it and goes back to the dashboard', async () => {
      const user = userEvent.setup();
      const { api } = renderEditor();
      await user.click(await screen.findByRole('button', { name: 'Delete draft' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
      await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith(JOB_ID));
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    });

    it('if the server refuses (payment history), the reason is shown and the job stays', async () => {
      const user = userEvent.setup();
      renderEditor({ remove: new ApiError(409, 'job_not_deletable', 'This job has payment history, so it cannot be deleted.') });
      await user.click(await screen.findByRole('button', { name: 'Delete draft' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete draft' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('This job has payment history, so it cannot be deleted.');
      expect(router.replace).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/^Job title/)).toBeInTheDocument();
    });
  });
});

describe('job editor: waiting for payment (required fields locked)', () => {
  const pending = () => makeJob({ status: 'pending_payment' });

  it('says so, locks every field and the save button, and offers Cancel checkout', async () => {
    renderEditor({ get: pending() });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Waiting for payment')).toBeInTheDocument();
    expect(status().getByText(/The required fields are locked\. Cancel checkout if you need to change them\./)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Job title/)).toBeDisabled();
    expect(screen.getByLabelText(/^Description/)).toBeDisabled();
    expect(screen.getByLabelText(/^City/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel checkout' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('cancelling checkout unlocks the form, shows the job as a draft, and says so', async () => {
    const user = userEvent.setup();
    const { api } = renderEditor({ get: pending() });
    await user.click(await screen.findByRole('button', { name: 'Cancel checkout' }));
    await waitFor(() => expect(api.cancelCheckout).toHaveBeenCalledWith(JOB_ID));
    expect(await screen.findByText('Checkout cancelled. You can edit this job again.')).toBeInTheDocument();
    expect(status().getByText('Draft')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Job title/)).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Cancel checkout' })).not.toBeInTheDocument();
  });

  it('shows a busy state while cancelling, and cannot be pressed twice', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { api } = renderEditor({ get: pending(), cancel: (() => new Promise((resolve) => (release = () => resolve(makeJob())))) as never });
    await user.click(await screen.findByRole('button', { name: 'Cancel checkout' }));
    const busy = await screen.findByRole('button', { name: /Cancelling/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(api.cancelCheckout).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('if the payment has already gone through, the reason is shown and the job stays locked', async () => {
    const user = userEvent.setup();
    renderEditor({
      get: pending(),
      cancel: new ApiError(409, 'payment_succeeded', 'This payment has already gone through, so checkout cannot be cancelled.'),
    });
    await user.click(await screen.findByRole('button', { name: 'Cancel checkout' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This payment has already gone through, so checkout cannot be cancelled.');
    expect(status().getByText('Waiting for payment')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Job title/)).toBeDisabled();
  });
});

describe('job editor: a published job', () => {
  const published = () => makeJob({ status: 'published', publishedAt: '2026-01-01T00:00:00Z', expiresAt: FUTURE });

  it('shows when it ends, stays editable, and can be closed', async () => {
    renderEditor({ get: published() });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Published')).toBeInTheDocument();
    expect(status().getByText('Live until June 15, 2099. You can keep editing it while it is live.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Job title/)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close job' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('closing it shows it as closed, with a notice, and the Reopen button appears', async () => {
    const user = userEvent.setup();
    const { api } = renderEditor({ get: published(), close: makeJob({ status: 'closed', expiresAt: FUTURE }) });
    await user.click(await screen.findByRole('button', { name: 'Close job' }));
    await waitFor(() => expect(api.closeJob).toHaveBeenCalledWith(JOB_ID));
    expect(await screen.findByText('This job is closed.')).toBeInTheDocument();
    expect(status().getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen job' })).toBeInTheDocument();
  });

  it('shows a busy state while closing', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    renderEditor({ get: published(), close: (() => new Promise((resolve) => (release = () => resolve(makeJob({ status: 'closed' }))))) as never });
    await user.click(await screen.findByRole('button', { name: 'Close job' }));
    const busy = await screen.findByRole('button', { name: /Closing/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await act(async () => release());
  });
});

describe('job editor: reopening', () => {
  it('a closed job whose end date is ahead: "Reopen job", with no new payment, and it says it is live again', async () => {
    const user = userEvent.setup();
    const { api } = renderEditor({
      get: makeJob({ status: 'closed', expiresAt: FUTURE }),
      reopen: makeJob({ status: 'published', expiresAt: FUTURE }),
    });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Closed. You can reopen it with no new payment until June 15, 2099.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen job' }));
    await waitFor(() => expect(api.reopenJob).toHaveBeenCalledWith(JOB_ID));
    expect(await screen.findByText('This job is live again until June 15, 2099. No new payment was needed.')).toBeInTheDocument();
    expect(status().getByText('Published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close job' })).toBeInTheDocument();
  });

  it('a closed job past its end date: "Reopen as a draft", and it says a new payment is needed', async () => {
    const user = userEvent.setup();
    renderEditor({ get: makeJob({ status: 'closed', expiresAt: PAST }), reopen: makeJob({ status: 'draft' }) });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Closed after its end date. Reopening it makes a draft that needs a new payment.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen as a draft' }));
    expect(await screen.findByText('This job is a draft again. Publishing it needs a new payment.')).toBeInTheDocument();
    expect(status().getByText('Draft')).toBeInTheDocument();
  });

  it('an expired job: says when it expired, and reopening makes a draft that needs a new payment', async () => {
    const user = userEvent.setup();
    renderEditor({ get: makeJob({ status: 'expired', expiresAt: '2025-12-31T00:00:00Z' }), reopen: makeJob({ status: 'draft' }) });
    await screen.findByRole('region', { name: 'Status' });
    expect(status().getByText('Expired on December 31, 2025. Reopening it makes a draft that needs a new payment.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen as a draft' }));
    expect(await screen.findByText('This job is a draft again. Publishing it needs a new payment.')).toBeInTheDocument();
  });

  it('shows a busy state while reopening', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    renderEditor({ get: makeJob({ status: 'expired', expiresAt: PAST }), reopen: (() => new Promise((resolve) => (release = () => resolve(makeJob())))) as never });
    await user.click(await screen.findByRole('button', { name: 'Reopen as a draft' }));
    const busy = await screen.findByRole('button', { name: /Reopening/ });
    expect(busy).toBeDisabled();
    await act(async () => release());
  });
});

describe('job editor: problems with an action', () => {
  it.each([
    ['the network is down', new ApiError(0, 'network', 'ECONNREFUSED 10.0.0.1'), 'Could not reach HealthHyr. Check your connection and try again.'],
    ['the server fails', new ApiError(500, 'internal_error', 'SELECT * FROM jobs failed'), 'Something went wrong. Please try again.'],
    ['the job is gone', new ApiError(404, 'not_found', 'Not found.'), 'This job could not be found. It may have been deleted.'],
    ['the API sends a reason', new ApiError(409, 'job_not_published', 'Only a published job can be closed.'), 'Only a published job can be closed.'],
  ])('%s: a friendly message, never raw server text', async (_name, error, message) => {
    const user = userEvent.setup();
    renderEditor({ get: makeJob({ status: 'published', expiresAt: FUTURE }), close: error });
    await user.click(await screen.findByRole('button', { name: 'Close job' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent(/ECONNREFUSED|SELECT/);
    expect(screen.getByRole('button', { name: 'Close job' })).toBeEnabled();
  });

  it('one action at a time: while one runs, the others are disabled', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    renderEditor({
      get: makeJob({ status: 'published', expiresAt: FUTURE }),
      close: (() => new Promise((resolve) => (release = () => resolve(makeJob({ status: 'closed' }))))) as never,
    });
    await user.click(await screen.findByRole('button', { name: 'Close job' }));
    await screen.findByRole('button', { name: /Closing/ });
    expect(screen.getByRole('button', { name: /Closing/ })).toBeDisabled();
    await act(async () => release());
  });
});

describe('the edit page in the employer area', () => {
  async function mount(state: Parameters<typeof makeFakeService>[0]) {
    const { service } = makeFakeService(state);
    const api = makeApi('employer');
    const page = await EditJobPage({ params: Promise.resolve({ id: JOB_ID }) });
    renderWithAuth(<EmployerLayout>{page}</EmployerLayout>, service, api);
    return { api };
  }

  it('shows an employer the heading, a way back and the job', async () => {
    await mount(signedIn('employer'));
    expect(screen.getByRole('heading', { level: 1, name: 'Edit job' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(await screen.findByRole('region', { name: 'Status' })).toBeInTheDocument();
  });

  it('shows a signed-out visitor only a spinner, asks the server for nothing, and sends them to sign in', async () => {
    const { api } = await mount({ status: 'signedOut' });
    expect(screen.queryByRole('heading', { name: 'Edit job' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(`/dashboard/jobs/${JOB_ID}`)}`));
    expect(api.getJob).not.toHaveBeenCalled();
  });

  it.each([
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('a %s sees nothing of it and is sent to %s', async (role, home) => {
    const { api } = await mount(signedIn(role));
    expect(screen.queryByRole('heading', { name: 'Edit job' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(api.getJob).not.toHaveBeenCalled();
  });
});
