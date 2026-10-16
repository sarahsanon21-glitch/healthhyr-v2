import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectIfSignedIn } from '../../src/lib/auth/guards';
import { RESEND_COOLDOWN_SECONDS } from '../../src/components/auth/ConfirmEmailForm';
import { ForgotPasswordForm } from '../../src/components/auth/ForgotPasswordForm';
import { backendError, makeRealAuth } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

beforeEach(() => setLocation('/forgot-password'));
afterEach(() => vi.useRealTimers());

const page = (
  <RedirectIfSignedIn>
    <ForgotPasswordForm />
  </RedirectIfSignedIn>
);

async function requestCode(options: Parameters<typeof makeRealAuth>[0] = {}, email = 'Sam@Example.com') {
  const user = userEvent.setup();
  const auth = makeRealAuth(options);
  renderWithAuth(page, auth.service);
  await screen.findByRole('heading', { level: 1, name: 'Reset your password' });
  await user.type(screen.getByLabelText(/^Email/), email);
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  return { user, ...auth };
}

describe('password reset: asking for a code', () => {
  it('shows an email field and a way back to sign-in', async () => {
    const { service } = makeRealAuth();
    renderWithAuth(page, service);
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('type', 'email');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
  });

  it('an empty or malformed email is explained and nothing is sent', async () => {
    const user = userEvent.setup();
    const { service, backend } = makeRealAuth();
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Reset your password' });

    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Email/)).toHaveFocus());

    await user.type(screen.getByLabelText(/^Email/), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(backend.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows a busy state while the code is being sent', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const { service } = makeRealAuth({
      backend: { requestPasswordReset: () => new Promise((resolve) => (release = () => resolve({ ok: true }))) },
    });
    renderWithAuth(page, service);
    await screen.findByRole('heading', { name: 'Reset your password' });
    await user.type(screen.getByLabelText(/^Email/), 'sam@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    const button = await screen.findByRole('button', { name: /Sending code/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => release());
  });

  it('says the same thing for every address, so it never reveals whether an account exists', async () => {
    await requestCode({}, 'anyone-at-all@example.com');
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('If anyone-at-all@example.com has an account, we sent a 6-digit code to it.');
    expect(document.body).not.toHaveTextContent(/no account|not found|does not exist/i);
  });

  it('being asked to slow down is explained and stays on the first step', async () => {
    const { backend } = await requestCode({ backend: { requestPasswordReset: async () => backendError('over_email_send_rate_limit') } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Wait a minute and try again.');
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(backend.requestPasswordReset).toHaveBeenCalledWith('sam@example.com');
  });
});

describe('password reset: choosing a new password with the code', () => {
  async function toCodeStep(options: Parameters<typeof makeRealAuth>[0] = {}) {
    const result = await requestCode(options);
    await screen.findByRole('heading', { name: 'Choose a new password' });
    return result;
  }

  it('asks for the code and a new password, with the right autocomplete', async () => {
    await toCodeStep();
    expect(screen.getByLabelText(/6-digit code/)).toHaveAttribute('autocomplete', 'one-time-code');
    const password = screen.getByLabelText(/^New password/);
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAccessibleDescription('At least 8 characters.');
    await expectClassesGenerated();
  });

  it('a short password and a bad code are explained and not sent', async () => {
    const { user, backend } = await toCodeStep();
    await user.type(screen.getByLabelText(/6-digit code/), '12');
    await user.type(screen.getByLabelText(/^New password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(backend.verifyRecoveryCode).not.toHaveBeenCalled();
  });

  it('a wrong or expired code is a friendly message and the password is not changed', async () => {
    const { user, backend } = await toCodeStep({ backend: { verifyRecoveryCode: async () => backendError('otp_expired') } });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.type(screen.getByLabelText(/^New password/), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right, or it has expired. Ask for a new one.');
    expect(backend.updatePassword).not.toHaveBeenCalled();
  });

  it('success signs the person in and goes to the home for the role the API reports', async () => {
    const { user, backend } = await toCodeStep({ role: 'employer' });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.type(screen.getByLabelText(/^New password/), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(backend.updatePassword).toHaveBeenCalledWith('a brand new password'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows a busy state while saving', async () => {
    let release!: () => void;
    const { user } = await toCodeStep({ backend: { updatePassword: () => new Promise((resolve) => (release = () => resolve({ ok: true }))) } });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.type(screen.getByLabelText(/^New password/), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    const button = await screen.findByRole('button', { name: /Saving/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => release());
  });

  it('if the password cannot be changed, says so and leaves the person signed out', async () => {
    const { user, backend } = await toCodeStep({ backend: { updatePassword: async () => backendError('same_password') } });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.type(screen.getByLabelText(/^New password/), 'the same old password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a password you have not used before.');
    expect(backend.signOut).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('can send a new code, but only after the wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, backend } = await toCodeStep();

    expect(screen.getByRole('button', { name: new RegExp(`Send a new code in ${RESEND_COOLDOWN_SECONDS}s`) })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync((RESEND_COOLDOWN_SECONDS + 1) * 1000);
    });

    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('If that email has an account, we sent a new code.')).toBeInTheDocument();
    expect(backend.requestPasswordReset).toHaveBeenCalledTimes(2);
  });

  it('can go back to use a different email', async () => {
    const { user } = await toCodeStep();
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  });

  it('never shows the new password as text, and it only ever sits in the password field', async () => {
    const secret = 'my-new-secret-777';
    const { user } = await toCodeStep({ backend: { updatePassword: async () => backendError('weak_password') } });
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.type(screen.getByLabelText(/^New password/), secret);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await screen.findByRole('alert');

    expect(document.body.textContent).not.toContain(secret);
    const holders = [...document.querySelectorAll('[value]')].filter((element) => element.getAttribute('value')?.includes(secret));
    expect(holders.length).toBeLessThanOrEqual(1);
    for (const holder of holders) expect(holder).toHaveAttribute('type', 'password');
  });
});
