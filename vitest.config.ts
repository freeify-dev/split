import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['shared/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/src/**/*.test.ts', 'server/test/**/*.test.ts'],
        },
      },
    ],
  },
})
