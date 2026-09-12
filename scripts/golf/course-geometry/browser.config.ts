import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'node:path';

const root = process.cwd();
const fixture = resolve(root, 'src/test/fixtures/course-geometry/browser');
/** Local browser fixture only: real components/styles, inert external adapters.
 * Never imported by Next or player routes. No environment credentials loaded. */
export default defineConfig({
  root: fixture, publicDir: resolve(root, 'public'),
  plugins: [react(), {
    name: 'isolate-server-actions', enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/app/') || !/^['"]use server['"]/m.test(code)) return;
      const names = [...code.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m => m[1]);
      return names.map(name => `export const ${name} = async () => ({ success: true, data: [], count: 0, unreadCount: 0 });`).join('\n');
    },
  }],
  resolve: { alias: [
    { find: '@/lib/supabase/client', replacement: resolve(fixture, 'supabase.ts') },
    { find: 'next/navigation', replacement: resolve(fixture, 'navigation.ts') },
    { find: 'next/dynamic', replacement: resolve(fixture, 'dynamic.tsx') },
    { find: 'next/link', replacement: resolve(fixture, 'link.tsx') },
    { find: 'next/image', replacement: resolve(fixture, 'image.tsx') },
    { find: '@', replacement: resolve(root, 'src') },
  ], dedupe: ['react', 'react-dom'] },
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
  css: { postcss: { plugins: [tailwindcss({ config: resolve(root, 'tailwind.config.ts') }), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 8768, strictPort: true, fs: { allow: [root, '/Users/ricknini/Downloads/helmv3'] } },
});
