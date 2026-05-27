import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

/**
 * Create a Supabase client for use in Client Components
 * This client runs in the browser and has access to cookies
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.');
  }
  return createBrowserClient<Database>(
    url,
    anonKey,
    {
      global: {
        fetch: (fetchUrl: RequestInfo | URL, options: RequestInit = {}) => {
          // 10s HTTP abort — DB statement_timeout is 8s, so DB error bubbles up first
          const signal = options.signal ?? AbortSignal.timeout(10_000);
          return fetch(fetchUrl, { ...options, signal });
        },
      },
    }
  );
}
