import { defineConfig } from 'vitest/config'

// Tests du frontend uniquement (blog-api a sa propre configuration : blog-api/vitest.config.ts)
export default defineConfig({
  test: {
    environment: 'node',
    include:     ['src/**/*.test.ts'],
  },
})
