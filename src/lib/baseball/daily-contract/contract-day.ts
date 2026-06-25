// =============================================================================
// src/lib/baseball/daily-contract/contract-day.ts
//
// V5 Daily Contract — the TIMEZONE-CORRECT definition of "today" (Gap 1).
//
// THE GAP THIS CLOSES
//   Every date anchor in the Daily Contract loop used `new Date().toISOString()
//   .slice(0,10)` — the SERVER's UTC day. A Pacific player who commits at 9pm PT
//   writes the NEXT UTC day's contract; an Eastern player at 9pm ET on the 23rd
//   writes the 24th. The missed-sweep cron (05:15 UTC ≈ 00:15 ET / 21:15 PT prior
//   day) then evaluates against that one global UTC cutover, so a non-UTC team's
//   "today" rolls to 'missed' before its own local midnight. Wrong day, false miss.
//
// THE FIX
//   A team owns ONE IANA timezone (baseball_teams.timezone, default
//   'America/New_York' — present since migration 20260624000090). That tz is the
//   single source of truth for the team's "day": both the player write and the
//   coach read derive "today" from it, and the sweep computes a PER-TEAM cutover.
//   Per-player tz is deliberately NOT introduced — the contract is team-scoped, so
//   one honest "today" must be shared by the player AND the coach roster feed.
//   This mirrors class-conflict-engine.ts, which also anchors on the PROGRAM tz.
//
// ZERO new deps: Intl.DateTimeFormat with a timeZone (the formatToParts idiom
// proven in class-conflict-engine.ts:214) derives a wall-clock date in any IANA
// tz, DST-correct (America/New_York auto-resolves EST/EDT). A bad/empty tz
// degrades honestly to the UTC slice — never throws.
//
// 'server-only' pure module (no 'use server', no React). Importable by the read-
// models, the write actions, the today page, and the sweep alike.
// =============================================================================

// NOTE: deliberately NO `import 'server-only'` here and the supabase client is a
// TYPE-ONLY import (erased at build) — so the pure date helpers (todayIsoInTz /
// isoMinusDays) stay environment-free and this module is importable from node unit
// tests AND from the missed-sweep (which the node-env test imports). The runtime
// query in resolveTeamTimezone uses the caller-supplied client; nothing here pulls
// next/headers into a test bundle.

import type { createClient } from '@/lib/supabase/server';

const DEFAULT_TZ = 'America/New_York';

/** The caller's RSC/server supabase client (passed in; never created here). */
type TimezoneReadClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The YYYY-MM-DD wall-clock date of `now` in IANA `tz`.
 *
 * Uses Intl.DateTimeFormat with `formatToParts` (robust against locale string
 * ordering) to read the year/month/day a clock on the wall in `tz` would show.
 * A Pacific player at 9pm on the 23rd (04:00 UTC the 24th) resolves to the 23rd.
 *
 * HONEST DEGRADE: an empty or invalid tz string never throws — it falls back to
 * the UTC date slice (the previous behavior), so a misconfigured team is no worse
 * off than before the fix, never broken.
 */
export function todayIsoInTz(tz: string, now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    // A corrupt clock can't anchor a day — degrade to a stable empty-safe value.
    return new Date(0).toISOString().slice(0, 10);
  }
  if (!tz) return now.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (!y || !m || !d) return now.toISOString().slice(0, 10);
    return `${y}-${m}-${d}`;
  } catch {
    // Invalid IANA tz (RangeError from Intl) → honest UTC fallback.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Subtract n days from a bare ISO date (YYYY-MM-DD).
 *
 * UTC-noon-safe pure date arithmetic. This is correct to keep UTC: arithmetic on
 * a bare calendar date is tz-INDEPENDENT — only the ANCHOR (what "today" is) needs
 * the team tz. Moving the previously-triplicated copies (player-daily-contract.ts,
 * coach-daily-contracts.ts, missed-sweep.ts) here kills the duplication; each
 * re-exports this one definition.
 */
export function isoMinusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a team's IANA timezone (single source of truth for its "day").
 * Returns the column value, or 'America/New_York' when the row/column is missing
 * — the same default the schema declares, so a read never anchors on an empty tz.
 */
export async function resolveTeamTimezone(
  supabase: TimezoneReadClient,
  teamId: string,
): Promise<string> {
  if (!teamId) return DEFAULT_TZ;
  // baseball_teams.timezone (migration 20260624000090) lags the generated
  // database.ts types — use the established loose accessor for this one column.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('baseball_teams')
    .select('timezone')
    .eq('id', teamId)
    .maybeSingle();
  const tz = (data as { timezone?: string | null } | null)?.timezone;
  return tz && tz.trim() ? tz : DEFAULT_TZ;
}
