import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['test/**/*.test.ts'],
    setupFiles:  ['test/setup.ts'],
    // Chaque fichier a son propre registre de modules (limiteurs et caches isolés)
    isolate:     true,
    testTimeout: 15_000,
  },
});
