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
  {
    files: ['src/contexts/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../application/**', '../infrastructure/**', '../interfaces/**'],
              message:
                'domain 层禁止依赖 application/infrastructure/interfaces，请改为通过领域协议协作。',
            },
            {
              group: ['../../*/application/**', '../../*/infrastructure/**', '../../*/interfaces/**'],
              message: 'contexts 间禁止跨层直连，需经 application 契约或 shared/platform。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/contexts/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../infrastructure/**', '../interfaces/**'],
              message: 'application 层禁止依赖 infrastructure/interfaces，实现细节应通过端口注入。',
            },
            {
              group: ['../../*/domain/**', '../../*/infrastructure/**', '../../*/interfaces/**'],
              message: '跨 context 访问请经目标 context 的 application 契约。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/contexts/*/interfaces/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../infrastructure/**'],
              message: 'interfaces 层禁止直接依赖 infrastructure，请通过 application 协调。',
            },
            {
              group: ['../../*/domain/**', '../../*/infrastructure/**', '../../*/interfaces/**'],
              message: '跨 context 访问请经目标 context 的 application 契约。',
            },
          ],
        },
      ],
    },
  },
);
