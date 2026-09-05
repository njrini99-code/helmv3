import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  test: {
    include: ['fixtures.test.ts'],
    environment: 'node',
  },
});
