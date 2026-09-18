'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const jest = require('eslint-plugin-jest');

/**
 * ESLint flat configuration. The Code Quality stage runs this with
 * --max-warnings=0, so any rule below is effectively a build gate.
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'reports/**', 'dist/**', 'data/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-return-await': 'error',
      'complexity': ['warn', 12],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['tests/**/*.js'],
    plugins: { jest },
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...jest.configs.recommended.rules,
      'max-lines-per-function': 'off',
      // supertest's chained .expect() calls are assertions in their own right.
      'jest/expect-expect': [
        'warn',
        { assertFunctionNames: ['expect', 'request.**.expect'] },
      ],
    },
  },
  {
    // The build and operations scripts legitimately write to stdout.
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
