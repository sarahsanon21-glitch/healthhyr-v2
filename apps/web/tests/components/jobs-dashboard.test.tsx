import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployerLayout from '../../src/app/(employer)/layout';
import EmployerDashboardPage from '../../src/app/(employer)/dashboard/page';
import NewJobPage from '../../src/app/(employer)/dashboard/jobs/new/page';
import { EmployerDashboard } from '../../src/components/jobs/EmployerDashboard';
import { ApiError } from '../../src/lib/api/client';
import { JOB_ID, makeApi, makeCompany, makeFakeService, makeSummary, signedIn } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/dashboard'));

type Stub = Parameters<typeof makeApi>[2];

function renderDashboard(jobs: Stub = {}, company: Parameters<typeof makeApi>[1] = {}) {
  const { service } = makeFakeService(signedIn('employer'));
  const api = makeApi('employer', company, jobs);
  renderWithAuth(<EmployerDashboard />, service, api);
  return { api };
}

const OTHER_ID = '8c2f3d4e-5b6a-4c7d-9e8f-0a1b2c3d4e5f';

describe('employer dashboard: loading and errors', () => {
  it('shows an announced spinner while the jobs load', () => {
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.listJobs.mockImplementation(() => new Promise(() => {}));
    renderWithAuth(<EmployerDashboard />, service, api);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your jobs');
  });

  it('a failed load shows a friendly message (never the server’s words) and Try again loads again', async () => {
    const user = userEvent.setup();
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.listJobs.mockRejectedValueOnce(new ApiError(500, 'internal_error', 'SELECT * FROM jobs failed'));
    renderWithAuth(<EmployerDashboard />, service, api);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your jobs. Check your connection and try again.');
    expect(document.body).not.toHaveTextContent('SELECT');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You have not posted any jobs yet')).toBeInTheDocument();
    expect(api.listJobs).toHaveBeenCalledTimes(2);
  });

  it('the links to post a job and edit the company are there while loading and after an error', async () => {
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer', {}, { list: new ApiError(0, 'network', 'x') });
    renderWithAuth(<EmployerDashboard />, service, api);
    expect(screen.getByRole('link', { name: 'Post a job' })).toHaveAttribute('href', '/dashboard/jobs/new');
    expect(screen.getByRole('link', { name: 'Edit company profile' })).toHaveAttribute('href', '/company');
    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: 'Post a job' })).toBeInTheDocument();
  });
});

describe('employer dashboard: no jobs yet', () => {
  it('shows an honest empty state with a way forward, and no sample jobs', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'You have not posted any jobs yet' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Post a job' });
    expect(links).toHaveLength(2); // the button at the top, and the one in the empty state
    for (const link of links) expect(link).toHaveAttribute('href', '/dashboard/jobs/new');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await expectClassesGenerated();
  });
});

describe('employer dashboard: the jobs', () => {
  const jobs = [
    makeSummary({ id: JOB_ID, title: 'Home health aide', status: 'published', city: 'Austin', state: 'TX', expiresAt: '2026-01-31T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }),
    makeSummary({ id: OTHER_ID, title: 'Night nurse', status: 'draft', careRole: 'rn', employmentType: 'per_diem', city: 'Dallas', state: 'TX', updatedAt: '2026-02-03T00:00:00Z' }),
    makeSummary({ id: '9d3a4e5f-6c7b-4d8e-8f9a-1b2c3d4e5f60', title: 'Waiting job', status: 'pending_payment' }),
    makeSummary({ id: 'ad4b5f60-7d8c-4e9f-9a0b-2c3d4e5f6071', title: 'Old job', status: 'expired' }),
    makeSummary({ id: 'be5c6071-8e9d-4f0a-8b1c-3d4e5f607182', title: 'Closed job', status: 'closed' }),
  ];

  it('lists every job with its title as a link to the job, its status in words, and where and what it is', async () => {
    renderDashboard({ list: jobs });
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);

    const first = items[0]!;
    expect(within(first).getByRole('link', { name: 'Home health aide' })).toHaveAttribute('href', `/dashboard/jobs/${JOB_ID}`);
    expect(within(first).getByText('Published')).toBeInTheDocument();
    expect(within(first).getByText('Home health aide (HHA) · Part time · Austin, TX')).toBeInTheDocument();
    expect(first).toHaveTextContent('Live until January 31, 2026');
    expect(first).toHaveTextContent('Updated January 2, 2026');

    const second = items[1]!;
    expect(within(second).getByText('Draft')).toBeInTheDocument();
    expect(within(second).getByText('Registered nurse (RN) · Per diem · Dallas, TX')).toBeInTheDocument();
    expect(second).not.toHaveTextContent('Live until');

    const statuses = items.map((item) => within(item).getByText(/^(Draft|Published|Waiting for payment|Expired|Closed)$/).textContent);
    expect(statuses).toEqual(['Published', 'Draft', 'Waiting for payment', 'Expired', 'Closed']);
    await expectClassesGenerated();
  });

  it('never shows ids, owner or payment details in the page text', async () => {
    renderDashboard({ list: jobs });
    await screen.findByRole('list');
    const text = document.body.textContent ?? '';
    expect(text).not.toContain(JOB_ID);
    expect(text).not.toMatch(/payment_id|employer_id|employerId|paymentId/);
  });

  it('there is no pay or publish button yet, because payment does not exist yet', async () => {
    renderDashboard({ list: jobs });
    await screen.findByRole('list');
    expect(screen.queryByRole('button', { name: /pay|publish|checkout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /pay|publish/i })).not.toBeInTheDocument();
  });
});

describe('employer dashboard: the company hint', () => {
  it('while the company is still on the default name, says it is needed before paying for a post', async () => {
    renderDashboard({}, { load: makeCompany({ isListed: false }) });
    expect(await screen.findByText(/you need a company name before you can pay for a post/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set your company name' })).toHaveAttribute('href', '/company');
  });

  it('is not shown once the company has a name', async () => {
    renderDashboard({}, { load: makeCompany({ companyName: 'Sunrise', isListed: true, slug: 'sunrise-abc123' }) });
    await screen.findByText('You have not posted any jobs yet');
    expect(screen.queryByText(/you need a company name/)).not.toBeInTheDocument();
  });

  it('failing to load the company does not hide the jobs', async () => {
    renderDashboard({ list: [makeSummary()] }, { load: new ApiError(500, 'x', 'y') });
    expect(await screen.findByRole('link', { name: 'Home health aide' })).toBeInTheDocument();
    expect(screen.queryByText(/you need a company name/)).not.toBeInTheDocument();
  });
});

describe('the employer pages are for employers only', () => {
  function mount(path: string, page: React.ReactElement, state: Parameters<typeof makeFakeService>[0]) {
    setLocation(path);
    const { service } = makeFakeService(state);
    const api = makeApi('employer');
    renderWithAuth(<EmployerLayout>{page}</EmployerLayout>, service, api);
    return { api };
  }

  it('the dashboard page shows an employer their dashboard', async () => {
    mount('/dashboard', <EmployerDashboardPage />, signedIn('employer'));
    expect(screen.getByRole('heading', { level: 1, name: 'Employer dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('You have not posted any jobs yet')).toBeInTheDocument();
  });

  it('the post-a-job page shows an employer the form and a way back', () => {
    mount('/dashboard/jobs/new', <NewJobPage />, signedIn('employer'));
    expect(screen.getByRole('heading', { level: 1, name: 'Post a job' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeInTheDocument();
  });

  it.each([
    ['/dashboard', <EmployerDashboardPage key="a" />],
    ['/dashboard/jobs/new', <NewJobPage key="b" />],
  ])('%s shows a signed-out visitor only a spinner, asks the server for nothing, and sends them to sign in', async (path, page) => {
    const { api } = mount(path, page, { status: 'signedOut' });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(path)}`));
    expect(api.listJobs).not.toHaveBeenCalled();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it.each([
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('a %s sees nothing of the dashboard and is sent to %s', async (role, home) => {
    const { api } = mount('/dashboard', <EmployerDashboardPage />, signedIn(role));
    expect(screen.queryByRole('heading', { name: 'Employer dashboard' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(api.listJobs).not.toHaveBeenCalled();
  });
});
