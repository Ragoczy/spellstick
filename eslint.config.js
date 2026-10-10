import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Things the deterministic, headless sim (and the AI that drives it) must never touch.
const noRandom = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts.' },
    { object: 'Date', property: 'now', message: 'The sim uses tick counts, not wall-clock time.' },
    { object: 'performance', property: 'now', message: 'The sim uses tick counts, not wall-clock time.' },
  ],
};

const browserOnlyGlobals = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame'].map(
  (name) => ({ name, message: 'src/sim and src/ai must run headless in Node.' }),
);

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'dist-server'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      ...noRandom,
      'no-restricted-globals': ['error', ...browserOnlyGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'src/sim is pure game logic and must not import Phaser.' }],
          patterns: [
            { group: ['phaser/*'], message: 'src/sim must not import Phaser.' },
            {
              group: ['**/render/**', '**/ui/**', '**/ai/**'],
              message: 'src/sim must not depend on render, ui, or ai.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ai/**/*.ts'],
    rules: {
      ...noRandom,
      'no-restricted-globals': ['error', ...browserOnlyGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'src/ai must run headless and must not import Phaser.' }],
          patterns: [
            { group: ['phaser/*'], message: 'src/ai must not import Phaser.' },
            { group: ['**/render/**', '**/ui/**'], message: 'src/ai must not depend on render or ui.' },
          ],
        },
      ],
    },
  },
);
