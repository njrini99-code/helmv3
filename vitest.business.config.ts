import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './src/test/stubs/server-only.ts'),
    },
  },
  test: {
    name: 'business',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.tsx'],
    include: [
      'src/**/*.contract.test.{ts,tsx}',
      'src/**/*-contract.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'archive', 'helm-website-ui', 'helm-intelligence'],
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});
