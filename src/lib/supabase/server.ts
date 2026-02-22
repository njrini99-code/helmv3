import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';

/**
 * Create a Supabase client for use in Server Components, Server Actions, and Route Handlers
 * This client runs on the server and uses cookies for authentication
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
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
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          // 10s HTTP abort — DB statement_timeout is 8s, so DB error bubbles up first
          const signal = options.signal ?? AbortSignal.timeout(10_000);
          return fetch(url, { ...options, signal });
        },
      },
    }
  );
}
