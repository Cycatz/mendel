import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `const { omitted, ...rest } = obj` is how we drop a field
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] } },
  {
    files: ['src/podl/**/*.ts'],
    rules: {
      // Constitution §3: the engine is deterministic and DOM-free.
      'no-restricted-globals': ['error', 'window', 'document'],
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*'] }],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use seeded mulberry32.' }],
    },
  },
);
