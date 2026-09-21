import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { factoryBundlePlugin } from './factory-lab/server';

const repo = process.cwd();
const output = resolve(repo, process.env.GOLFHELM_FACTORY_OUTPUT_ROOT ?? 'output/course-geometry/factory');
/** Dedicated local lab. It never imports the fixture registry or loads env files. */
export default defineConfig(({ command, isPreview }) => {
  if (command !== 'serve' || isPreview) throw new Error('Factory lab is dev-only; it cannot be built or preview-published');
  return {
    root: resolve(repo, 'scripts/golf/course-geometry/factory-lab'), publicDir: false, envDir: false,
    plugins: [react(), factoryBundlePlugin(output)],
    resolve: { alias: { '@': resolve(repo, 'src') }, dedupe: ['react', 'react-dom'] },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    css: { postcss: { plugins: [tailwindcss({ config: resolve(repo, 'tailwind.config.ts') }), autoprefixer()] } },
    server: { host: '127.0.0.1', port: 8774, strictPort: true,
      fs: { allow: [repo, realpathSync(resolve(repo, 'node_modules'))], deny: ['**/.env*', '**/*.{crt,pem}', '**/output/**', '**/.git/**'] } },
  };
});
