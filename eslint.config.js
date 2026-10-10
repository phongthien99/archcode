import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'packages/cli/**/*.ts',
      'packages/core/test/**/*.ts',
      'apps/web/e2e/**/*.ts',
      'apps/web/src/**/*.test.ts',
      '**/*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/**/*.test.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  // Core phải chạy được trong trình duyệt, Web Worker và Node: cấm API riêng của từng môi trường.
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'self'].map((name) => ({
          name,
          message: 'packages/core không được dùng API của trình duyệt.',
        })),
        ...['process', 'Buffer', 'require', '__dirname', '__filename', 'global'].map((name) => ({
          name,
          message: 'packages/core không được dùng API của Node.js.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(node:|fs$|path$|os$|child_process$|url$|crypto$|stream$|util$)',
              message: 'packages/core không được import module của Node.js.',
            },
          ],
        },
      ],
    },
  },
);
