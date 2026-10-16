import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/api/client';
import { RedirectIfSignedIn } from '../../src/lib/auth/guards';
import { SignInForm } from '../../src/components/auth/SignInForm';
import { backendError, makeRealAuth } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/sign-in'));

/** The page as the site renders it: the sign-in form inside the signed-in redirect. */
const page = (
  <RedirectIfSignedIn>
    <SignInForm />
  </RedirectIfSignedIn>
);

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText(/^Email/), email);
  if (password) await user.type(screen.getByLabelText(/^Password/), password);
}

describe('sign-in page: what a visitor sees', () => {
  it('shows a spinner, not the form, while it finds out whether they are already signed in', () => {
    const { service } = makeRealAuth({ backend: { accessToken: () => new Promise(() => {}) } });
    renderWithAuth(page, service);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('then shows the form with labelled, required fields and links to the other pages', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();

    const email = screen.getByLabelText(/^Email/);
    const password = screen.getByLabelText(/^Password/);
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toHaveAttribute('aria-required', 'true');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-up');
  });

  it('uses only real classes', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await expectClassesGenerated();
  });
});

describe('sign-in page: someone who is already signed in', () => {
  it('is sent to their home without ever seeing the form', async () => {
    const { service } = makeRealAuth({ role: 'employer', backend: { accessToken: async () => 'saved' } });
    renderWithAuth(page, service);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('a signed-in account with no profile gets the "not set up" message instead of a redirect loop', async () => {
    const { service } = makeRealAuth({
      role: new ApiError(403, 'no_profile', 'x'),
      backend: { accessToken: async () => 'saved' },
    });
    renderWithAuth(page, service);
    expect(await screen.findByRole('heading', { name: 'Your account is not set up yet' })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('when the API is down at start, offers Try again', async () => {
    const { service } = makeRealAuth({
      role: new ApiError(0, 'network', 'x'),
      backend: { accessToken: async () => 'saved' },
    });
    renderWithAuth(page, service);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('sign-in form: validation', () => {
  it('an empty submit shows an error on each field, marks them invalid, focuses the first, and sends nothing', async () => {
    const user = userEvent.setup();
    const { service, backend } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const email = screen.getByLabelText(/^Email/);
    const password = screen.getByLabelText(/^Password/);

    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Error: Enter your email address.');
    expect(password).toHaveAccessibleDescription('Error: Enter your password.');
    await waitFor(() => expect(email).toHaveFocus());
    expect(backend.signIn).not.toHaveBeenCalled();
  });

  it('a badly formed email is explained', async () => {
    const user = userEvent.setup();
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'not-an-email', 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });
});

describe('sign-in form: submitting', () => {
  it('shows a busy state while the request runs: disabled fields and button, aria-busy, an announced spinner', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { service } = makeRealAuth({
      backend: { signIn: () => new Promise((resolve) => (release = () => resolve({ ok: true }))) },
    });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const button = await screen.findByRole('button', { name: /Signing in/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.getByLabelText(/^Password/)).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Signing in');
    expect(button.closest('form')).toHaveAttribute('aria-busy', 'true');
    release();
  });

  it('a second click while busy does not send a second request', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { service, backend } = makeRealAuth({
      backend: { signIn: () => new Promise((resolve) => (release = () => resolve({ ok: true }))) },
    });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: /Signing in/ }));
    expect(backend.signIn).toHaveBeenCalledTimes(1);
    release();
  });

  it('wrong credentials: a form-level alert with an icon, fields usable again, and no hint about which part was wrong', async () => {
    const user = userEvent.setup();
    const { service } = makeRealAuth({ backend: { signIn: async () => backendError('invalid_credentials') } });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error: Email or password is incorrect.');
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText(/^Email/)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByLabelText(/^Email/)).not.toHaveAttribute('aria-invalid');
    await expectClassesGenerated();
  });

  it.each([
    ['too many attempts', 'over_request_rate_limit', 'Too many attempts. Wait a minute and try again.'],
    ['the network is down', 'network', 'Could not reach HealthHyr. Check your connection and try again.'],
    ['something unexpected', 'weird', 'Something went wrong. Please try again.'],
  ])('%s shows a friendly message', async (_name, code, message) => {
    const user = userEvent.setup();
    const { service } = makeRealAuth({ backend: { signIn: async () => backendError(code, 'RAW-PROVIDER-TEXT') } });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent('RAW-PROVIDER-TEXT');
  });

  it('never shows the password as text, and it only ever sits in the password field', async () => {
    const user = userEvent.setup();
    const secret = 'my-secret-password-123';
    const { service } = makeRealAuth({ backend: { signIn: async () => backendError('invalid_credentials') } });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', secret);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');

    expect(document.body.textContent).not.toContain(secret);
    const holders = [...document.querySelectorAll('[value]')].filter((element) => element.getAttribute('value')?.includes(secret));
    expect(holders).toHaveLength(1);
    expect(holders[0]).toHaveAttribute('type', 'password');
  });
});

describe('sign-in form: where a successful sign-in goes (decided by the role the API reports)', () => {
  async function signInAs(role: 'employer' | 'seeker' | 'admin', search = '') {
    setLocation('/sign-in', search);
    const user = userEvent.setup();
    const { service, backend, api } = makeRealAuth({ role });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'sam@example.com', 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    return { backend, api };
  }

  it.each([
    ['employer', '/dashboard'],
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('a %s goes to %s', async (role, home) => {
    const { api } = await signInAs(role);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(api.getMe).toHaveBeenCalled();
  });

  it('goes to the page they were heading to when it is a safe path', async () => {
    await signInAs('employer', '?next=%2Fdashboard');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('ignores an unsafe next address and uses the role home', async () => {
    await signInAs('seeker', `?next=${encodeURIComponent('https://evil.example.test')}`);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
    expect(router.replace).not.toHaveBeenCalledWith('https://evil.example.test');
  });
});

describe('sign-in form: an account whose email is not confirmed yet', () => {
  it('moves to the code step for that address, and confirming signs them in', async () => {
    const user = userEvent.setup();
    const { service, backend } = makeRealAuth({ role: 'seeker', backend: { signIn: async () => backendError('email_not_confirmed') } });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Sign in' });
    await fill(user, 'Sam@Example.com', 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));
    await waitFor(() => expect(backend.confirmSignUp).toHaveBeenCalledWith('sam@example.com', '123456'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
  });
});
