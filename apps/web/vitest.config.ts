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
  },
});
