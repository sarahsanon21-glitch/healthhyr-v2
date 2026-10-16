import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', 'supabase/.temp/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Plain Node scripts (not TypeScript, so no-undef applies).
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
