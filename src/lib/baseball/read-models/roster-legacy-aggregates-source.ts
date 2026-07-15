// =============================================================================
// src/lib/baseball/read-models/roster-legacy-aggregates-source.ts
//
// #379 (roster.ts + RosterClient.tsx migration): the ONE remaining place the
// roster surfaces are permitted to read the deprecated legacy aggregates
// table. Both roster.ts (server read model) and RosterClient.tsx (browser
// refetch after a roster mutation) used to run this exact query inline —
// duplicated and, per the stat-layer-manifest.ts contract test, a "direct
// legacy join" in two files instead of one. Neither call site needs to BLEND
// the result themselves anymore: legacy-stat-adapters.ts's precedence rule
// (via roster-aggregates-merge.ts's thin wrapper) already owns that decision.
// This module's only job is the raw fetch — a plain, framework-light
// function callable from both the authenticated server client
// (@/lib/supabase/server) and the browser client (@/lib/supabase/client),
// since both are `SupabaseClient<Database>` and duck-type identically for a
// simple select/eq query.
//
// WHY THE FETCH STILL HAPPENS (not eliminated): a player with zero box-score
// era rows falls back to their raw legacy aggregate row per the adapter's
// documented precedence (see legacy-stat-adapters.ts) — that fallback tier
// needs the real row from someone. This file is that someone, so
// roster.ts/RosterClient.tsx can stay off the deprecated-table allowlist.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { BaseballPlayerAggregates } from '@/lib/types';

type Client = SupabaseClient<Database>;

export interface RosterLegacyAggregatesResult {
  aggregates: Record<string, BaseballPlayerAggregates>;
  error: boolean;
}

/**
 * Fetch every legacy aggregate row for a team, keyed by player_id. Honest on
 * failure: returns an empty map + `error: true` rather than throwing, so
 * callers can fold the failure into their own error-surfacing (matches the
 * pre-existing inline behavior in roster.ts / RosterClient.tsx).
 *
 * The deprecated table isn't part of the strict generated `Database` schema
 * relations used elsewhere, so — same as the inline query this replaces —
 * the client is cast narrowly at the call boundary rather than typed as `any`
 * throughout.
 */
export async function fetchRosterLegacyAggregates(
  supabase: Client,
  teamId: string,
): Promise<RosterLegacyAggregatesResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('team_id', teamId) as {
    data: BaseballPlayerAggregates[] | null;
    error: unknown;
  };

  const aggregates: Record<string, BaseballPlayerAggregates> = {};
  if (!error && data) {
    for (const agg of data) {
      aggregates[agg.player_id] = agg;
    }
  }

  return { aggregates, error: Boolean(error) };
}
