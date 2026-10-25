/** Held live-round tables (20261025050000), typed until the production apply regenerates database.ts. */
import type { SupabaseClient } from '@supabase/supabase-js';

/** `public.golf_round_live`, as PostgREST returns it. The table is not in the generated types until it is applied. */
export interface GolfRoundLiveRow {
  round_id: string;
  team_id: string;
  player_id: string;
  round_type: string;
  qualifier_id: string | null;
  qualifier_round: number | null;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  holes_planned: number;
  start_position: number;
  current_hole: number | null;
  share: string;
  phase: string;
  thru: number;
  to_par: number | null;
  strokes: number | null;
  holes: Array<{ n: number; p: number | null; y: number | null; s: number | null; at: string | null }> | null;
  last_hole_at: string | null;
  heard_at: string;
  started_at: string | null;
  ended_at: string | null;
  seq: number | string;
}

type HeldTable<Row> = { Row: { [K in keyof Row]: Row[K] }; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type LiveDatabase = {
  public: {
    Tables: {
      golf_round_live: HeldTable<GolfRoundLiveRow>;
      golf_round_live_prefs: HeldTable<{ player_id: string; practice_share: string; updated_at: string }>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

/** Uses the caller's session and RLS; only the schema typing changes. */
export function liveTable<T extends keyof LiveDatabase['public']['Tables']>(client: object, table: T) {
  return (client as SupabaseClient<LiveDatabase>).from(table);
}
