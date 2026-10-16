import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
        },
      },
      './apps/web/vitest.config.ts',
      {
        // Needs the local Supabase database. Start it with: npm run db:start
        test: {
          name: 'rls',
          environment: 'node',
          include: ['supabase/tests/rls/**/*.test.ts'],
          globalSetup: ['./supabase/tests/rls/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
