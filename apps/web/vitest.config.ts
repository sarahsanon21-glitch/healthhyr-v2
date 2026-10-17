import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests: jsdom plus Testing Library.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web-components',
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    // Some tests compile the Tailwind theme to check every class is real. That is slow while the
    // machine is busy (for example, while Docker starts), so the limit is generous.
    testTimeout: 20_000,
  },
});
