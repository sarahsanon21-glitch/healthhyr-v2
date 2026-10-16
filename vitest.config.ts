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
    ],
  },
});
