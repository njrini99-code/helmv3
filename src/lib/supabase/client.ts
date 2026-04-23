import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

/**
 * Create a Supabase client for use in Client Components
 * This client runs in the browser and has access to cookies
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'placeholder-anon-key',
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          // 10s HTTP abort — DB statement_timeout is 8s, so DB error bubbles up first
          const signal = options.signal ?? AbortSignal.timeout(10_000);
          return fetch(url, { ...options, signal });
        },
      },
    }
  );
}
