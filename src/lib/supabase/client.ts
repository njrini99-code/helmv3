import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

/**
 * Create a Supabase client for use in Client Components
 * This client runs in the browser and has access to cookies
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
