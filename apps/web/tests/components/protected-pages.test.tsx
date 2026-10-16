// The real layouts and pages, as the site mounts them: each folder's layout guards its pages.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout, { metadata as adminMeta } from '../../src/app/(admin)/layout';
import AdminPage from '../../src/app/(admin)/admin/page';
import EmployerLayout, { metadata as employerMeta } from '../../src/app/(employer)/layout';
import EmployerDashboardPage from '../../src/app/(employer)/dashboard/page';
import SeekerLayout, { metadata as seekerMeta } from '../../src/app/(seeker)/layout';
import SeekerProfilePage from '../../src/app/(seeker)/profile/page';
import { metadata as signInMeta } from '../../src/app/(auth)/sign-in/page';
import { metadata as signUpMeta } from '../../src/app/(auth)/sign-up/page';
import { metadata as forgotMeta } from '../../src/app/(auth)/forgot-password/page';
import { makeFakeService, signedIn } from '../helpers/auth';
import { router, setLocation } from '../helpers/navigation';
import { renderWithAuth } from '../helpers/render';
import { expectClassesGenerated } from '../helpers/tailwind';

vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);

const areas = [
  { name: 'employer dashboard', path: '/dashboard', role: 'employer', heading: 'Employer dashboard', Layout: EmployerLayout, Page: EmployerDashboardPage, home: '/dashboard' },
  { name: 'seeker profile', path: '/profile', role: 'seeker', heading: 'Your profile', Layout: SeekerLayout, Page: SeekerProfilePage, home: '/profile' },
  { name: 'admin area', path: '/admin', role: 'admin', heading: 'Admin', Layout: AdminLayout, Page: AdminPage, home: '/admin' },
] as const;

describe.each(areas)('the $name', ({ path, role, heading, Layout, Page }) => {
  beforeEach(() => setLocation(path));

  it('shows its page to the right role', async () => {
    const { service } = makeFakeService(signedIn(role));
    renderWithAuth(
      <Layout>
        <Page />
      </Layout>,
      service,
    );
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await expectClassesGenerated();
  });

  it('shows a signed-out visitor nothing but a spinner, and sends them to sign in', async () => {
    const { service } = makeFakeService({ status: 'signedOut' });
    renderWithAuth(
      <Layout>
        <Page />
      </Layout>,
      service,
    );
    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(path)}`));
  });

  it('shows nothing to the other roles, and sends each one home', async () => {
    for (const other of ['employer', 'seeker', 'admin'] as const) {
      if (other === role) continue;
      setLocation(path);
      const { service } = makeFakeService(signedIn(other));
      const view = renderWithAuth(
        <Layout>
          <Page />
        </Layout>,
        service,
      );
      const home = areas.find((area) => area.role === other)!.home;
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith(home));
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('signing out from a protected page', () => {
  it('ends the session, and the page then sends the person to sign in', async () => {
    setLocation('/dashboard');
    const { service } = makeFakeService(signedIn('employer'));
    renderWithAuth(
      <EmployerLayout>
        <EmployerDashboardPage />
      </EmployerLayout>,
      service,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(service.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in?next=%2Fdashboard'));
    expect(screen.queryByRole('heading', { name: 'Employer dashboard' })).not.toBeInTheDocument();
  });
});

describe('search engines', () => {
  it('are told to leave every account, protected and auth page alone', () => {
    for (const meta of [employerMeta, seekerMeta, adminMeta, signInMeta, signUpMeta, forgotMeta]) {
      expect(meta.robots).toEqual({ index: false, follow: false });
    }
  });
});
