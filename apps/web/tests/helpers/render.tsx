import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AuthProvider } from '../../src/lib/auth/AuthProvider';
import type { AuthService } from '../../src/lib/auth/types';

/** Renders the way the site does: inside the AuthProvider, which starts the service on mount. */
export function renderWithAuth(ui: ReactElement, service: AuthService) {
  return render(<AuthProvider service={service}>{ui}</AuthProvider>);
}
