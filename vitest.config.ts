import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
          // These need the local Supabase and have their own projects below.
          exclude: ['apps/api/tests/integration/**', 'node_modules/**'],
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
      {
        // Real GoTrue, mail catcher and API app against the real local Supabase: the API's token
        // checks and the website's auth flows. Needs SUPABASE_URL and SUPABASE_ANON_KEY in .env.
        test: {
          name: 'api-integration',
          environment: 'node',
          include: ['apps/api/tests/integration/**/*.test.ts'],
          globalSetup: ['./apps/api/tests/integration/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
