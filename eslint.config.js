import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      '.claude/',
      '.trae/',
      '.nanoclaw/',
      'container/',
      'skills-engine/',
      'data/',
      'backups/',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      // Import plugin rules
      'import/no-unresolved': ['error', { commonjs: true, caseSensitive: true }],
      'import/no-cycle': 'warn',
      'import/no-duplicates': 'error',
      // 'no-restricted-imports': [
      //   'error',
      //   {
      //     patterns: [
      //       {
      //         group: ['**/types.js', '**/types.ts'],
      //         message: 'Please import from specific type files (e.g. src/types/core-runtime.js) instead of the barrel file.',
      //       },
      //     ],
      //   },
      // ],
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': ['warn'],
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.ts', '.d.ts'],
        },
      },
    },
  },
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.js', 'setup/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
