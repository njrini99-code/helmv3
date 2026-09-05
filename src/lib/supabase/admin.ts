import '@supabase/supabase-js/tracing';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import type { Database } from '@/lib/types/database';
import { getSecretKey, tryGetSecretKey } from '@/lib/supabase/keys.mjs';

/**
 * Read-only accessor for the raw secret/service-role credential, for the
 * rare caller that needs the KEY ITSELF rather than a Supabase client — e.g.
 * HTTP Basic Auth against the Supabase Metrics API
 * (`src/lib/observability/supabase/metrics-api.ts`), which is not a
 * PostgREST/Auth/Storage/Realtime call and has no use for `createClient`.
 * Centralizing the read here keeps every `SUPABASE_SECRET_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY` access inside the Review Gate's
 * `no-service-role-in-client` allowlist
 * (`scripts/__tests__/review-gate-rules.test.mjs`'s allowlist regex matches
 * `src/lib/supabase/admin` and `src/lib/supabase/keys`) instead of adding a
 * second file path to that allowlist for every new server-only caller.
 * Returns `null`, never throws — unlike `createAdminClient()` (which throws
 * because a broken client is useless), callers here decide what an absent
 * credential means for them.
 */
export function getServiceRoleKey(): string | null {
  return tryGetSecretKey().key;
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder for admin client.');
  }
  // New-format secret key first, legacy service-role JWT as fallback — see
  // src/lib/supabase/keys.mjs. Throws naming both env names when neither is
  // set.
  const serviceRoleKey = getSecretKey();

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
