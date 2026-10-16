import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/lib/auth/AuthProvider';
import { RedirectIfSignedIn, RequireRole } from '../../src/lib/auth/guards';
import { makeFakeService, signedIn } from '../helpers/auth';
import { location, router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

const secret = 'PROTECTED-CONTENT';

/** Records every time it is rendered, so a test can prove it was never shown. */
function Protected({ onRender }: { onRender: () => void }) {
  onRender();
  return <p>{secret}</p>;
}

beforeEach(() => setLocation('/dashboard'));

describe('RequireRole: what a signed-out visitor sees on a protected page', () => {
  it('is sent to sign-in with the page they wanted, and the page content is never rendered', async () => {
    const { service } = makeFakeService({ status: 'signedOut' });
    const onRender = vi.fn();
    renderWithAuth(
      <RequireRole roles={['employer']}>
        <Protected onRender={onRender} />
      </RequireRole>,
      service,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in?next=%2Fdashboard'));
    expect(onRender).not.toHaveBeenCalled();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('keeps the page they asked for, for any protected address', async () => {
    setLocation('/jobs/new');
    const { service } = makeFakeService({ status: 'signedOut' });
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in?next=%2Fjobs%2Fnew'));
  });
});

describe('RequireRole: while the site finds out who the person is', () => {
  it('shows a spinner and nothing protected, and does not redirect yet', () => {
    const { service } = makeFakeService({ status: 'loading' });
    const onRender = vi.fn();
    renderWithAuth(
      <RequireRole roles={['employer']}>
        <Protected onRender={onRender} />
      </RequireRole>,
      service,
    );
    expect(onRender).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('renders nothing protected on the server, even if the browser state says signed in', () => {
    const { service } = makeFakeService(signedIn('employer'));
    const html = renderToString(
      <AuthProvider service={service}>
        <RequireRole roles={['employer']}>{secret}</RequireRole>
      </AuthProvider>,
    );
    expect(html).not.toContain(secret);
    expect(html).toContain('Loading');
  });
});

describe('RequireRole: role routing', () => {
  it('shows the page to a person whose role is allowed', () => {
    const { service } = makeFakeService(signedIn('employer'));
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    expect(screen.getByText(secret)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('a %s on an employer page is sent to %s and never sees the page', async (role, home) => {
    const { service } = makeFakeService(signedIn(role));
    const onRender = vi.fn();
    renderWithAuth(
      <RequireRole roles={['employer']}>
        <Protected onRender={onRender} />
      </RequireRole>,
      service,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(onRender).not.toHaveBeenCalled();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it('an employer on a seeker page is sent to the dashboard', async () => {
    setLocation('/profile');
    const { service } = makeFakeService(signedIn('employer'));
    renderWithAuth(<RequireRole roles={['seeker']}>{secret}</RequireRole>, service);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it('allows any of several roles', () => {
    const { service } = makeFakeService(signedIn('admin'));
    renderWithAuth(<RequireRole roles={['employer', 'admin']}>{secret}</RequireRole>, service);
    expect(screen.getByText(secret)).toBeInTheDocument();
  });

  it('reacts when the state changes: signing out removes the page and redirects', async () => {
    const { service, set } = makeFakeService(signedIn('employer'));
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    expect(screen.getByText(secret)).toBeInTheDocument();
    set({ status: 'signedOut', user: null });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in?next=%2Fdashboard'));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });
});

describe('RequireRole: accounts and errors', () => {
  it('a signed-in account with no profile gets a message and a sign-out button, not the page', async () => {
    const { service } = makeFakeService({ status: 'noProfile' });
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    expect(screen.getByRole('heading', { level: 1, name: 'Your account is not set up yet' })).toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(service.signOut).toHaveBeenCalled();
  });

  it('when the account cannot be loaded, offers Try again and Sign out, and shows no page', async () => {
    const { service } = makeFakeService({ status: 'error', message: 'We could not load your account. Check your connection and try again.' });
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    expect(screen.getByRole('heading', { level: 1, name: 'We could not load your account' })).toBeInTheDocument();
    expect(screen.getByText(/Check your connection/)).toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(service.refresh).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(service.signOut).toHaveBeenCalled();
  });

  it('uses only real classes', async () => {
    const { service } = makeFakeService({ status: 'error', message: 'x' });
    renderWithAuth(<RequireRole roles={['employer']}>{secret}</RequireRole>, service);
    await expectClassesGenerated();
  });
});

describe('RedirectIfSignedIn', () => {
  it('shows the page to a signed-out visitor', () => {
    setLocation('/sign-in');
    const { service } = makeFakeService({ status: 'signedOut' });
    renderWithAuth(<RedirectIfSignedIn>{secret}</RedirectIfSignedIn>, service);
    expect(screen.getByText(secret)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['employer', '/dashboard'],
    ['seeker', '/profile'],
    ['admin', '/admin'],
  ] as const)('sends a signed-in %s to %s without showing the page', async (role, home) => {
    setLocation('/sign-in');
    const { service } = makeFakeService(signedIn(role));
    renderWithAuth(<RedirectIfSignedIn>{secret}</RedirectIfSignedIn>, service);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it('goes to a safe ?next= page instead of the role home', async () => {
    setLocation('/sign-in', '?next=%2Fjobs%3Fpage%3D2');
    const { service } = makeFakeService(signedIn('seeker'));
    renderWithAuth(<RedirectIfSignedIn>{secret}</RedirectIfSignedIn>, service);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/jobs?page=2'));
  });

  it.each(['https://evil.example.test', '//evil.example.test', '/\\evil.example.test', 'javascript:alert(1)'])(
    'ignores the unsafe ?next=%s',
    async (next) => {
      setLocation('/sign-in', `?next=${encodeURIComponent(next)}`);
      const { service } = makeFakeService(signedIn('employer'));
      renderWithAuth(<RedirectIfSignedIn>{secret}</RedirectIfSignedIn>, service);
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
      expect(router.replace).not.toHaveBeenCalledWith(next);
    },
  );
});

describe('AuthProvider', () => {
  function Probe() {
    const { state } = useAuth();
    return (
      <p>
        status:{state.status} message:{state.message ?? 'none'}
      </p>
    );
  }

  it('starts the service once it is mounted', () => {
    const { service } = makeFakeService({ status: 'signedOut' });
    renderWithAuth(<Probe />, service);
    expect(service.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/status:signedOut/)).toBeInTheDocument();
  });

  it('without the public configuration, reports the problem by variable name and never a value', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const { render } = await import('@testing-library/react');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText(/status:error/)).toBeInTheDocument());
    expect(screen.getByText(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set/)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('useAuth outside the provider throws a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderWithAuthless()).toThrow(/AuthProvider/);
    spy.mockRestore();
  });

  function renderWithAuthless() {
    return renderToString(<Probe />);
  }

  it('location helper is wired', () => {
    expect(location.pathname).toBe('/dashboard');
  });
});
