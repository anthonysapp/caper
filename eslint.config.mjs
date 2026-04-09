import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/.assetpack/**',
      '**/coverage/**',
      '**/templates/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      // Relaxed during ESLint 9 / tseslint 8 migration — pre-existing violations,
      // see plan/tasks.md Phase 1c follow-up for a codebase sweep.
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-constant-binary-expression': 'warn',
    },
  },
);
