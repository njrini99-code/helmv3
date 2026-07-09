// =============================================================================
// src/lib/lifting/resolve-athlete-timezone.ts
//
// Resolve the IANA timezone that should anchor a Lifting Lab athlete's "today"
// (helm_lifting_sessions.scheduled_date / helm_lifting_readiness_checkins.
// checkin_date bucketing) — mirrors the baseball Daily Contract's
// resolveTeamTimezone (src/lib/baseball/daily-contract/contract-day.ts): a
// player's LOCAL day, not the server's UTC day, decides which session is
// "today's lift" and whether today's readiness check-in already exists. Without
// this, a Pacific athlete lifting at 9pm PT could see tomorrow's session (or
// miss today's just-submitted check-in) because the naive
// `new Date().toISOString().slice(0, 10)` reads the server's UTC date instead.
//
// A helm_lifting_athletes row is multi-sport (baseball / golf / a direct,
// non-sport-linked account — see helm_lifting_athletes.sport), so there is no
// single "team" table to read a timezone off of the way baseball_teams.timezone
// works alone. This resolves per-sport:
//   - baseball: sport_player_id -> baseball_team_members (the ACTIVE
//     membership join table baseball_players are linked through — baseball_
//     players itself has no team_id/FK) -> team_id -> baseball_teams.timezone,
//     via the canonical resolveTeamTimezone (one definition, not a fork).
//   - golf: sport_player_id -> golf_team_members (ACTIVE) -> team_id ->
//     golf_team_settings.timezone (same lookup golf's own dashboard-data.ts
//     resolves against).
//   - anything else (direct lab account, unresolved membership): 'America/
//     New_York', the same default both sport helpers degrade to — never
//     throws, never worse off than the previous UTC-slice behavior.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveTeamTimezone } from '@/lib/baseball/daily-contract/contract-day';

const DEFAULT_TZ = 'America/New_York';

/**
 * Resolve the timezone for `athleteId` (a helm_lifting_athletes.id). Reads the
 * athlete's own sport + sport_player_id, then follows that sport's team
 * membership to its timezone column. Degrades honestly to 'America/New_York'
 * whenever a step is missing (no sport_player_id, no active membership, no
 * timezone column value) — same as the sport-specific helpers it delegates to.
 */
export async function resolveLiftingAthleteTimezone(athleteId: string): Promise<string> {
  if (!athleteId) return DEFAULT_TZ;

  const supabase = await createClient();

  const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('sport, sport_player_id')
    .eq('id', athleteId)
    .maybeSingle() as { data: { sport: string | null; sport_player_id: string | null } | null };

  if (!athlete?.sport_player_id) return DEFAULT_TZ;

  if (athlete.sport === 'baseball') {
    const { data: membership } = await supabase
      .from('baseball_team_members')
      .select('team_id')
      .eq('player_id', athlete.sport_player_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!membership?.team_id) return DEFAULT_TZ;
    // Reuses the canonical baseball_teams.timezone reader directly.
    return resolveTeamTimezone(supabase, membership.team_id);
  }

  if (athlete.sport === 'golf') {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', athlete.sport_player_id)
      .eq('status', 'active')
      // A player can legitimately hold more than one active team_members row
      // (mirrors the same >1-row guard in player-lift.ts's resolvePlayerTeam)
      // — without order+limit, .maybeSingle() errors (PGRST116) instead of
      // just taking the first membership.
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!membership?.team_id) return DEFAULT_TZ;

    const { data: settings } = await supabase
      .from('golf_team_settings')
      .select('timezone')
      .eq('team_id', membership.team_id)
      .maybeSingle();
    const tz = (settings as { timezone?: string | null } | null)?.timezone;
    return tz && tz.trim() ? tz : DEFAULT_TZ;
  }

  return DEFAULT_TZ;
}
