import '@supabase/supabase-js/tracing';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type { Database } from '@/lib/types/database';

/**
 * Read-only accessor for the raw service-role credential, for the rare
 * caller that needs the KEY ITSELF rather than a Supabase client — e.g. HTTP
 * Basic Auth against the Supabase Metrics API
 * (`src/lib/observability/supabase/metrics-api.ts`), which is not a
 * PostgREST/Auth/Storage/Realtime call and has no use for `createClient`.
 * Centralizing the read here keeps every `SUPABASE_SERVICE_ROLE_KEY` access
 * inside the Review Gate's `no-service-role-in-client` allowlist
 * (`scripts/__tests__/review-gate-rules.test.mjs`'s allowlist regex matches
 * `src/lib/supabase/admin`) instead of adding a second file path to that
 * allowlist for every new server-only caller. Returns `null`, never throws
 * — unlike `createAdminClient()` (which throws because a broken client is
 * useless), callers here decide what an absent credential means for them.
 */
export function getServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder for admin client.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
  }

  const client = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    tracePropagation: {
      enabled: true,
      respectSamplingDecision: false,
    },
  });
  Sentry.instrumentSupabaseClient(client, { sendOperationData: false });
  return client;
}
