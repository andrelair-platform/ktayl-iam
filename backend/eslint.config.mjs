// =============================================================================
// ESLint Configuration (Flat Config - ESLint 9+) — ktayl-iam backend (NestJS)
// =============================================================================
// Replaces oxlint (the platform outlier — the house standard is eslint + tsc for
// TypeScript, and oxlint cannot enforce `complexity`/`naming-convention`). This
// wires typescript-eslint (type-aware) and the clean-code.md floor. See #2353.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  // ---------------------------------------------------------------------------
  // Application source — the clean-code.md floor, type-aware.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // js.configs.recommended's no-undef/no-unused-vars misfire on TS — defer to tsc.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Measurable clean-code floor (house defaults — clean-code.md TypeScript row).
      complexity: ['error', 10],
      'max-params': ['error', 4],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      // Error handling: an unhandled promise is a real bug class in async code.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allowSingleOrDouble' },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'], leadingUnderscore: 'allowSingleOrDouble' },
        { selector: 'function', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allowSingleOrDouble' },
        { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allowSingleOrDouble' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'property', format: null }, // snake_case DB/API/wire fields are legitimate
        { selector: 'import', format: null },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ---------------------------------------------------------------------------
  // Tooling: tests + CLI runners (migrations/seeds) — console is their output;
  // the floor is for app logic, not one-shot scripts/tests (testing.md).
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**', '**/migrate.ts', '**/seeds/**', '**/*.config.ts'],
    rules: {
      'no-console': 'off',
      complexity: 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-depth': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/naming-convention': 'off',
    },
  },
);
