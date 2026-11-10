import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/**/*.test.ts', 'frontend/**/*.test.ts'],
    environment: 'node',
  },
});
