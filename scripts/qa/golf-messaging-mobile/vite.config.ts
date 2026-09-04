import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';

const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessRoot, '../../..');
const stub = (name: string) => path.join(harnessRoot, 'stubs', name);

export default defineConfig({
  root: harnessRoot,
  plugins: [
    {
      name: 'golf-messaging-text-fixture-structured-message-stub',
      enforce: 'pre',
      transform(code, id) {
        if (id.includes('/MessageThreadPane.tsx')) {
          return code.replace("from './StructuredMessage';", `from '${stub('structured-message.tsx')}';`);
        }
        return null;
      },
    },
    react(),
  ],
  // A few shared Fairway primitives import Next Link. They are still rendered
  // through their real component code here; this only supplies the browser
  // build-time environment symbol that Next normally injects.
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  resolve: {
    alias: [
      { find: '@/hooks/golf/use-golf-group-avatars', replacement: stub('group-avatars.ts') },
      { find: '@/hooks/golf/use-golf-message-reactions', replacement: stub('message-reaction-hook.ts') },
      { find: '@/hooks/golf/use-golf-message-responses', replacement: stub('message-response-hook.ts') },
      { find: '@/app/golf/actions/messages', replacement: stub('message-actions.ts') },
      { find: '@/app/golf/actions/message-reactions', replacement: stub('message-reactions.ts') },
      { find: '@/lib/supabase/client', replacement: stub('supabase-client.ts') },
      { find: '@/lib/error-logging', replacement: stub('error-logging.ts') },
      { find: '@/lib/server-error-logger', replacement: stub('server-error-logger.ts') },
      { find: '@/lib/admin/request-context', replacement: stub('request-context.ts') },
      { find: '@/components/fairway/pages/messages/StructuredMessage', replacement: stub('structured-message.tsx') },
      { find: '@/components/golf/messages/AttachmentButton', replacement: stub('attachment-button.tsx') },
      { find: '@/components/golf/messages/AttachmentPreview', replacement: stub('attachment-preview.tsx') },
      { find: 'server-only', replacement: stub('server-only.ts') },
      { find: '@', replacement: path.join(repositoryRoot, 'src') },
    ],
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.join(repositoryRoot, 'tailwind.config.ts') }), autoprefixer()],
    },
  },
  server: { strictPort: true },
});
