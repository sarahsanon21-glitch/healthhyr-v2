import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployerLayout from '../../src/app/(employer)/layout';
import EmployerCompanyPage, { metadata } from '../../src/app/(employer)/company/page';
import EmployerDashboardPage from '../../src/app/(employer)/dashboard/page';
import { CompanyProfileForm } from '../../src/components/company/CompanyProfileForm';
import { ApiError } from '../../src/lib/api/client';
import { makeApi, makeCompany, makeFakeService, signedIn } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/company'));

type ApiOptions = Parameters<typeof makeApi>[1];

function renderForm(options: ApiOptions = {}) {
  const { service } = makeFakeService(signedIn('employer'));
  const api = makeApi('employer', options);
  renderWithAuth(<CompanyProfileForm />, service, api);
  return { api };
}

const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;

describe('company profile form: loading', () => {
  it('shows an announced spinner, not an empty form, while the profile loads', () => {
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.getMyCompany.mockImplementation(() => new Promise(() => {}));
    renderWithAuth(<CompanyProfileForm />, service, api);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your company profile');
    expect(screen.queryByLabelText(/^Company name/)).not.toBeInTheDocument();
  });

  it('fills the form with the saved profile, and says the page is hidden while the name is the default', async () => {
    renderForm();
    expect(await screen.findByLabelText(/^Company name/)).toHaveValue('My company');
    expect(screen.getByText(/hidden until you change the company name/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View your public page' })).not.toBeInTheDocument();
  });

  it('shows saved values, and a link to the public page when it is already public', async () => {
    renderForm({
      load: makeCompany({
        companyName: 'Sunrise Home Care',
        description: 'Home care.',
        website: 'https://sunrise.example.org',
        industry: 'Home health',
        companySize: '11-50',
        city: 'Fresno',
        state: 'CA',
        isListed: true,
        slug: 'sunrise-home-care-3f0c9a',
      }),
    });
    expect(await screen.findByLabelText(/^Company name/)).toHaveValue('Sunrise Home Care');
    expect(field(/^About your company/)).toHaveValue('Home care.');
    expect(field(/^Website/)).toHaveValue('https://sunrise.example.org');
    expect(field(/^Industry/)).toHaveValue('Home health');
    expect(screen.getByLabelText(/^Company size/)).toHaveValue('11-50');
    expect(field(/^City/)).toHaveValue('Fresno');
    expect(field(/^State/)).toHaveValue('CA');
    expect(screen.getByRole('link', { name: 'View your public page' })).toHaveAttribute('href', '/companies/sunrise-home-care-3f0c9a');
  });

  it('a failed load shows a friendly message and Try again, which loads again', async () => {
    const user = userEvent.setup();
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    api.getMyCompany.mockRejectedValueOnce(new ApiError(0, 'network', 'ECONNREFUSED 10.0.0.1'));
    renderWithAuth(<CompanyProfileForm />, service, api);

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your company profile. Check your connection and try again.');
    expect(document.body).not.toHaveTextContent('ECONNREFUSED');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(/^Company name/)).toHaveValue('My company');
    expect(api.getMyCompany).toHaveBeenCalledTimes(2);
  });

  it('a missing profile (404) says so', async () => {
    renderForm({ load: new ApiError(404, 'not_found', 'Not found.') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Your company profile could not be found. Contact support if this continues.');
  });
});

describe('company profile form: fields', () => {
  it('has labelled fields, a required name, a size list and sensible autocomplete', async () => {
    renderForm();
    const name = await screen.findByLabelText(/^Company name/);
    expect(name).toHaveAttribute('aria-required', 'true');
    expect(name).toHaveAttribute('autocomplete', 'organization');
    expect(field(/^Website/)).toHaveAttribute('type', 'url');
    const size = screen.getByLabelText(/^Company size/);
    const options = [...size.querySelectorAll('option')].map((option) => option.getAttribute('value'));
    expect(options).toEqual(['', '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await expectClassesGenerated();
  });

  it('has no logo field and no listing or address field: the server decides those', async () => {
    renderForm();
    await screen.findByLabelText(/^Company name/);
    expect(screen.queryByLabelText(/logo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/slug|listed|address bar/i)).not.toBeInTheDocument();
  });
});

describe('company profile form: validation', () => {
  it('an empty name is explained, marked invalid, focused, and nothing is sent', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    const name = await screen.findByLabelText(/^Company name/);
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Enter your company name.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(name).toHaveFocus());
    expect(api.saveMyCompany).not.toHaveBeenCalled();
  });

  it('a web address that is not https is explained and nothing is sent', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await screen.findByLabelText(/^Company name/);
    await user.type(field(/^Website/), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a web address that starts with https://')).toBeInTheDocument();
    expect(api.saveMyCompany).not.toHaveBeenCalled();
  });

  it('a description over 5,000 characters is refused', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await screen.findByLabelText(/^Company name/);
    await user.click(field(/^About your company/));
    await user.paste('x'.repeat(5001));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Use 5000 characters or fewer.')).toBeInTheDocument();
    expect(api.saveMyCompany).not.toHaveBeenCalled();
  });
});

describe('company profile form: saving', () => {
  async function fillAndSave(user: ReturnType<typeof userEvent.setup>) {
    const name = await screen.findByLabelText(/^Company name/);
    await user.clear(name);
    await user.type(name, 'Sunrise Home Care');
    await user.type(field(/^City/), 'Fresno');
    await user.selectOptions(screen.getByLabelText(/^Company size/), '11-50');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
  }

  it('sends only the editable fields, with empty boxes as null', async () => {
    const user = userEvent.setup();
    const { api } = renderForm();
    await fillAndSave(user);
    await waitFor(() => expect(api.saveMyCompany).toHaveBeenCalledTimes(1));
    const sent = api.saveMyCompany.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toEqual({
      companyName: 'Sunrise Home Care',
      description: null,
      website: null,
      industry: null,
      companySize: '11-50',
      city: 'Fresno',
      state: null,
    });
    for (const forbidden of ['isListed', 'is_listed', 'slug', 'id', 'logoUrl']) expect(sent).not.toHaveProperty(forbidden);
  });

  it('shows a busy state while saving: disabled fields and button, aria-busy, an announced spinner, no second request', async () => {
    const user = userEvent.setup();
    const { service } = makeFakeService(signedIn('employer'));
    const api = makeApi('employer');
    let release!: () => void;
    api.saveMyCompany.mockImplementation(() => new Promise((resolve) => (release = () => resolve(makeCompany({ companyName: 'Sunrise Home Care', isListed: true, slug: 'sunrise-home-care-3f0c9a' })))));
    renderWithAuth(<CompanyProfileForm />, service, api);
    await fillAndSave(user);

    const button = await screen.findByRole('button', { name: /Saving/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/^Company name/)).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving');
    await user.click(button);
    expect(api.saveMyCompany).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('after a save that makes the page public, says so and links to it', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillAndSave(user);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Saved. Your company page is public.');
    expect(screen.getByRole('link', { name: 'View your public page' })).toHaveAttribute('href', '/companies/sunrise-home-care-3f0c9a');
    await expectClassesGenerated();
  });

  it('after a save that leaves the name on the default, says the page stays hidden', async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByLabelText(/^Company name/);
    await user.type(field(/^City/), 'Fresno');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved. Your company page stays hidden until you change the company name.');
    expect(screen.queryByRole('link', { name: 'View your public page' })).not.toBeInTheDocument();
  });

  it('the form shows what the server saved (for example trimmed text), and the notice goes away when editing again', async () => {
    const user = userEvent.setup();
    renderForm({ save: makeCompany({ companyName: 'Sunrise Home Care', isListed: true, slug: 'sunrise-home-care-3f0c9a' }) });
    const name = await screen.findByLabelText(/^Company name/);
    await user.clear(name);
    await user.type(name, '  sunrise   ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(name).toHaveValue('Sunrise Home Care');
    await user.type(name, '!');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('server-side field problems are shown on those fields', async () => {
    const user = userEvent.setup();
    renderForm({
      save: new ApiError(400, 'validation_error', 'Some fields are not valid.', 'req-1', [{ path: 'website', message: 'Enter a web address that starts with https://' }]),
    });
    await fillAndSave(user);
    expect(await screen.findByText('Enter a web address that starts with https://')).toBeInTheDocument();
    expect(field(/^Website/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Some fields need your attention.')).toBeInTheDocument();
  });

  it.each([
    ['the network is down', new ApiError(0, 'network', 'ECONNREFUSED 10.0.0.1'), 'Could not reach HealthHyr. Check your connection and try again.'],
    ['the server fails', new ApiError(500, 'internal_error', 'SELECT * FROM employer_profiles failed'), 'We could not save your changes. Please try again.'],
    ['the session has ended', new ApiError(401, 'invalid_token', 'bad token abc'), 'We could not save your changes. Please try again.'],
  ])('%s: a friendly message, never the server’s words, and the form stays usable', async (_name, error, message) => {
    const user = userEvent.setup();
    renderForm({ save: error });
    await fillAndSave(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent(/ECONNREFUSED|SELECT|bad token/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.getByLabelText(/^Company name/)).toHaveValue('Sunrise Home Care');
  });
});

describe('the company page in the employer area', () => {
  function mount(state: Parameters<typeof makeFakeService>[0]) {
    const { service } = makeFakeService(state);
    const api = makeApi('employer');
    renderWithAuth(
      <EmployerLayout>
        <EmployerCompanyPage />
      </EmployerLayout>,
      service,
      api,
    );
    return { api };
  }

  it('is not indexed by search engines, and has a title', () => {
    expect(metadata.title).toBe('Company profile');
  });

  it('shows an employer the heading, a way back and the form', async () => {
    mount(signedIn('employer'));
    expect(screen.getByRole('heading', { level: 1, name: 'Company profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Company name/)).toBeInTheDocument();
  });

  it('shows a signed-out visitor only a spinner, asks the server for nothing, and sends them to sign in', async () => {
    const { api } = mount({ status: 'signedOut' });
    expect(screen.queryByRole('heading', { name: 'Company profile' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent('/company')}`));
    expect(api.getMyCompany).not.toHaveBeenCalled();
  });

  it.each([
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('a %s sees nothing of it and is sent to %s', async (role, home) => {
    const { api } = mount(signedIn(role));
    expect(screen.queryByRole('heading', { name: 'Company profile' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(api.getMyCompany).not.toHaveBeenCalled();
  });

  it('the dashboard links to it', () => {
    const { service } = makeFakeService(signedIn('employer'));
    renderWithAuth(
      <EmployerLayout>
        <EmployerDashboardPage />
      </EmployerLayout>,
      service,
    );
    expect(screen.getByRole('link', { name: 'Edit company profile' })).toHaveAttribute('href', '/company');
  });
});
