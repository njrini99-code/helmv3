import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/** Local row types until the held block is applied and types regenerate; a follow-up PR deletes this cast (N-00 §8.13). No other file casts. */
export interface PracticePlanRow {
  id: string;
  team_id: string;
  event_id: string | null;
  title: string | null;
  step: string;
  body: unknown;
  version: number;
  status: 'draft' | 'published';
  published_version: number | null;
  /** Kept by the save and publish functions (010500, 010600): true once a published plan's body or title changes, false again on publish. The one source for "Edits not published". */
  edited_after_publish?: boolean;
  coach_why?: unknown;
  updated_at: string;
}
export interface PracticePlanVersionRow {
  plan_id: string;
  version: number;
  /** Frozen with the version. A player reads these here: `golf_practice_plans` is coach-only. */
  title: string;
  event_id: string | null;
  body: unknown;
  published_at: string;
}
export interface TeamDrillRow {
  id: string;
  team_id: string;
  name: string;
  area: string;
  kind: 'skill' | 'random' | 'pressure';
  minutes: number;
  setup: string;
  goal: string;
  archived_at: string | null;
}
export interface PracticeDocRow {
  id: string;
  folder: string | null;
  practice_plan_id: string | null;
}

/** The one cast (N-00 §8.13). Untyped until the block is applied; callers read rows through the types above. */
export function practiceTables(sb: SupabaseClient<Database>): SupabaseClient {
  return sb as unknown as SupabaseClient;
}

/** The house pattern for functions missing from the generated types: the name and arguments are passed `as never`, the result parsed by the caller. */
export async function practiceRpc(sb: SupabaseClient<Database>, fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
  const res = await (sb.rpc as unknown as (f: never, a: never) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>)(fn as never, args as never);
  return { data: res.data, error: res.error };
}
