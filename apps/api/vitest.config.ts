import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@tabletap/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
