// A controllable stand-in for next/navigation. Each test file mounts it with:
//   vi.mock('next/navigation', async () => (await import('../helpers/navigation')).navigationModule);
import { vi } from 'vitest';

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const location = { pathname: '/', search: '' };

/** Call in beforeEach: clears every mock and sets the current address. */
export function setLocation(pathname: string, search = ''): void {
  for (const fn of Object.values(router)) fn.mockReset();
  location.pathname = pathname;
  location.search = search;
}

export const navigationModule = {
  useRouter: () => router,
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
};
