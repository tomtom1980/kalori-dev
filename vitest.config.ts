import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
      'tests/components/**/*.test.tsx',
      'tests/rls/**/*.test.ts',
      // Task 5.1.9 — Lighthouse CI threshold drift sentinel.
      'tests/lighthouse/**/*.test.ts',
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'components/**/*.test.tsx',
    ],
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**', 'tests/axe/**', 'tests/visual/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['app/**', 'components/**', 'lib/**', 'eslint-rules/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/*.types.ts',
        '**/index.ts',
        'next.config.ts',
        'tailwind.config.ts',
        'tests/**',
        'supabase/migrations/**',
        // Route-level stubs + shell layouts have no testable logic at Task 1.2 —
        // they are thin JSX placeholders that the E2E + visual regression
        // suites exercise instead. Including them in unit coverage would force
        // synthetic tests for unreachable code.
        'app/layout.tsx',
        'app/globals.css',
        'app/**/layout.tsx',
        'app/**/page.tsx',
      ],
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
});
