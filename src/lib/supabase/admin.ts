import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  SUPABASE_TRACE_PROPAGATION,
  withSupabaseTracing,
} from '@/lib/observability/supabase-tracing';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder for admin client.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
  }

  // Service-role client. Instrumented like every other factory: verified that
  // Sentry's auth instrumentation names spans from `operation.name` only
  // (`auth (admin) createUser`) and never reads `argumentsList`, so no email,
  // user id, or token reaches telemetry from this highest-privilege surface.
  // `sendOperationData: false` (inside withSupabaseTracing) keeps mutation
  // bodies off the spans.
  //
  // The service-role KEY itself is only ever read here into the Supabase client
  // and is never passed to Sentry — instrumentation wraps the client, not its
  // construction arguments.
  return withSupabaseTracing(
    createClient<Database>(url, serviceRoleKey, {
      tracePropagation: SUPABASE_TRACE_PROPAGATION,
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  );
}
