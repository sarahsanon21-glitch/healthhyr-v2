import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectIfSignedIn } from '../../src/lib/auth/guards';
import { RESEND_COOLDOWN_SECONDS } from '../../src/components/auth/ConfirmEmailForm';
import { SignUpForm } from '../../src/components/auth/SignUpForm';
import { backendError, makeRealAuth, makeFakeService } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/sign-up'));
afterEach(() => vi.useRealTimers());

const page = (
  <RedirectIfSignedIn>
    <SignUpForm />
  </RedirectIfSignedIn>
);

const roleRadios = () => screen.getAllByRole('radio') as HTMLInputElement[];

async function fillForm(user: ReturnType<typeof userEvent.setup>, role: 'seeker' | 'employer' | null) {
  if (role) await user.click(screen.getByRole('radio', { name: role === 'seeker' ? /looking for work/ : /hiring/ }));
  await user.type(screen.getByLabelText(/^Your name/), 'Sam Rivera');
  await user.type(screen.getByLabelText(/^Email/), 'Sam@Example.com');
  await user.type(screen.getByLabelText(/^Password/), 'a-long-password');
}

describe('sign-up page: the role choice', () => {
  it('offers exactly two roles, seeker and employer, and never admin', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { level: 1, name: 'Create your account' });
    expect(roleRadios().map((radio) => radio.value)).toEqual(['seeker', 'employer']);
    expect(screen.queryByRole('radio', { name: /admin/i })).not.toBeInTheDocument();
    expect(document.body.innerHTML.toLowerCase()).not.toContain('admin');
  });

  it('is a labelled group, required, and nothing is chosen for the person', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.getByRole('group', { name: /I am/ })).toBeInTheDocument();
    for (const radio of roleRadios()) {
      expect(radio).not.toBeChecked();
      expect(radio).toHaveAttribute('aria-required', 'true');
    }
  });

  it('?role=employer preselects that choice', async () => {
    setLocation('/sign-up', '?role=employer');
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.getByRole('radio', { name: /hiring/ })).toBeChecked();
  });

  it.each(['admin', 'ADMIN', 'superuser', '', 'seeker%20', '%00'])('?role=%s preselects nothing', async (role) => {
    setLocation('/sign-up', `?role=${role}`);
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    for (const radio of roleRadios()) expect(radio).not.toBeChecked();
  });

  it('a radio button tampered with in the page still cannot send admin', async () => {
    const user = userEvent.setup();
    const { service, backend } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });

    const seeker = screen.getByRole('radio', { name: /looking for work/ }) as HTMLInputElement;
    fireEvent.change(seeker, { target: { value: 'admin' } }); // someone edits the value in dev tools
    expect(seeker.value).toBe('admin');
    await fillForm(user, null);
    await user.click(seeker);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(backend.signUp).toHaveBeenCalledTimes(1));
    const sent = backend.signUp.mock.calls[0]![0] as { role: string };
    expect(sent.role).toBe('seeker');
    expect(sent.role).not.toBe('admin');
  });

  it('an empty form is refused before anything is sent, with a message for every field', async () => {
    const user = userEvent.setup();
    const { service, backend } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Choose one.')).toBeInTheDocument();
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(backend.signUp).not.toHaveBeenCalled();
    await waitFor(() => expect(roleRadios()[0]).toHaveFocus());
  });
});

describe('sign-up form: fields and states', () => {
  it('has labelled required fields with the right autocomplete and a password hint', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.getByLabelText(/^Your name/)).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('autocomplete', 'email');
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAccessibleDescription('At least 8 characters.');
  });

  it('shows a busy state while the account is being created', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { service } = makeRealAuth({
      backend: { signUp: () => new Promise((resolve) => (release = () => resolve({ ok: true as const, sessionStarted: false }))) },
    });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    await fillForm(user, 'seeker');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const button = await screen.findByRole('button', { name: /Creating account/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.getByRole('group', { name: /I am/ })).toBeDisabled();
    await act(async () => release());
  });

  it('an address that cannot be used gets the same neutral message, never "already registered"', async () => {
    const user = userEvent.setup();
    const { service } = makeRealAuth({ backend: { signUp: async () => backendError('user_already_exists', 'User already registered') as never } });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    await fillForm(user, 'employer');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not create that account. If you already have one, sign in instead.');
    expect(document.body).not.toHaveTextContent(/already registered/i);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await expectClassesGenerated();
  });
});

describe('sign-up form: confirming the emailed code', () => {
  async function reachCodeStep(role: 'seeker' | 'employer' = 'employer', options: Parameters<typeof makeRealAuth>[0] = {}) {
    const user = userEvent.setup();
    const auth = makeRealAuth(options);
    renderWithAuth(page, auth.service);
    await screen.findByRole('heading', { name: 'Create your account' });
    await fillForm(user, role);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    return { user, ...auth };
  }

  it('sends the chosen role and a clean email, then asks for the code for that address', async () => {
    const { backend } = await reachCodeStep('employer');
    expect(backend.signUp).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'a-long-password', fullName: 'Sam Rivera', role: 'employer' });
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute('inputmode', 'numeric');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a code of the wrong shape is explained and not sent', async () => {
    const { user, backend } = await reachCodeStep();
    await user.type(screen.getByLabelText(/6-digit code/), '12ab');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));
    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText(/6-digit code/)).toHaveFocus());
    expect(backend.confirmSignUp).not.toHaveBeenCalled();
  });

  it('a wrong or expired code shows a friendly message', async () => {
    const { user } = await reachCodeStep('employer', { backend: { confirmSignUp: async () => backendError('otp_expired', 'RAW') } });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right, or it has expired. Ask for a new one.');
  });

  it('a good code signs in, and the destination comes from the API role, not from the role they picked', async () => {
    // They signed up as an employer, but the database says seeker: the API wins.
    const { user, backend } = await reachCodeStep('employer', { role: 'seeker' });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm email' }));
    await waitFor(() => expect(backend.confirmSignUp).toHaveBeenCalledWith('sam@example.com', '123456'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/profile'));
    expect(router.replace).not.toHaveBeenCalledWith('/dashboard');
  });

  it('can ask for a new code, then must wait before asking again', async () => {
    const { user, backend } = await reachCodeStep();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByRole('status')).toHaveTextContent('We sent you a new code.');
    expect(backend.resendSignUpCode).toHaveBeenCalledWith('sam@example.com');

    expect(screen.getByRole('button', { name: new RegExp(`Send a new code in ${RESEND_COOLDOWN_SECONDS}s`) })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync((RESEND_COOLDOWN_SECONDS + 1) * 1000);
    });
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('being asked to slow down is explained', async () => {
    const { user } = await reachCodeStep('seeker', { backend: { resendSignUpCode: async () => backendError('over_email_send_rate_limit') } });
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Wait a minute and try again.');
  });
});

describe('sign-up form: no email confirmation needed (a session starts at once)', () => {
  it('goes straight to the API role’s home', async () => {
    const user = userEvent.setup();
    const { service } = makeRealAuth({
      role: 'employer',
      backend: { signUp: async () => ({ ok: true as const, sessionStarted: true }) },
    });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Create your account' });
    await fillForm(user, 'employer');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });
});

describe('sign-up form: with a service that has not started', () => {
  it('still renders the form without a busy indicator', async () => {
    const { service } = makeFakeService({ status: 'signedOut' });
    renderWithAuth(page, service);
    const button = await screen.findByRole('button', { name: 'Create account' });
    expect(within(button).queryByRole('status')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
