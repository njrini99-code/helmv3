import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';

/**
 * Create a Supabase client for use in Server Components, Server Actions, and Route Handlers
 * This client runs on the server and uses cookies for authentication
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.');
  }
  const cookieStore = await cookies();

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
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
