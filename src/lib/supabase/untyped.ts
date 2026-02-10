/**
 * Utility for Supabase queries on tables/columns not yet in generated Database types.
 * Centralizes the type escape hatch so individual files don't need as-any casts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Access a Supabase table that is not (yet) in the generated Database types.
 * This avoids scattering as-any casts across the codebase.
 * The eslint-disable is intentional and contained to this single utility.
 */
export function fromUntyped(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  table: string
) {
  return client.from(table);
}
