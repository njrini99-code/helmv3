import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

/**
 * Inngest Next.js handler — serves the function registry at
 * /api/inngest. The Inngest cloud (or local Dev Server) discovers
 * functions by hitting this endpoint on PUT.
 *
 * Local dev:
 *   1. Start the app: `npm run dev`
 *   2. In another terminal: `npx inngest-cli@latest dev`
 *      (auto-discovers http://localhost:3000/api/inngest)
 *   3. Open the Dev Server UI at http://localhost:8288
 *
 * Production:
 *   1. Sign up at https://app.inngest.com (free tier: 50K step runs/mo)
 *   2. Create an app, copy INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
 *   3. Add to Vercel env (Preview + Production)
 *   4. Deploy — Inngest auto-syncs functions from the production URL.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
