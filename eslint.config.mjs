import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', 'supabase/.temp/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // A name that starts with an underscore is unused on purpose (for example, dropping fields with a
    // rest pattern: `const { id: _id, ...rest } = row`).
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Plain Node scripts (not TypeScript, so no-undef applies).
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
