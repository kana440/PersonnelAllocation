import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@personnel/domain': path.resolve(__dirname, '../../packages/domain/src'),
    },
  },
  test: {
    globals:     true,
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    reporters:   ['verbose'],
  },
})
