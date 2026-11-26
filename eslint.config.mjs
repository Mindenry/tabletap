import tseslint from 'typescript-eslint';

/**
 * A deliberately small, fast rule set. Types are enforced by `tsc --noEmit`;
 * these rules catch the class of mistakes the compiler allows.
 */
export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/.netlify/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/prisma/migrations/**',
      '**/.turbo/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
  },
  tseslint.configs.base,
  {
    rules: {
      'no-debugger': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'no-var': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
