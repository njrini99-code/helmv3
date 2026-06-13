'use server';

/**
 * Command Palette server action — bundles the data the ⌘K palette needs
 * for dynamic search (players, recent rounds, recent insights). Fetched
 * once on first open of the palette and cached in component state for
 * the duration of the session.
 *
 * The shape is intentionally narrow — only fields we render in the
 * palette item rows. Heavier records (full insight context, full round
 * detail) are deferred to the navigation target page.
 */

import { createClient } from '@/lib/supabase/server';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

export interface CommandPalettePlayer {
  id: string;
  full_name: string;
  status: string | null;
  handicap: number | null;
  avatar_url: string | null;
}

export interface CommandPaletteRound {
  id: string;
  course_name: string | null;
  round_date: string | null;
  total_score: number | null;
  player_name: string | null;
}

export interface CommandPaletteInsight {
  id: string;
  title: string;
  /** Surfaces the `golf_coach_insights.priority` value (low|medium|high|urgent).
   *  Named `severity` for back-compat with the ⌘K palette UI which keys off this
   *  field; there is NO `severity` column on `golf_coach_insights`. */
  severity: string | null;
  player_name: string | null;
  category: string | null;
  status: string | null;
}

export interface CommandPaletteData {
  players: CommandPalettePlayer[];
  recentRounds: CommandPaletteRound[];
  recentInsights: CommandPaletteInsight[];
}

/**
 * Returns the bundle for the ⌘K palette. Coach role gets team-wide data;
 * player role gets only their own rounds (and zero insights — players
 * see insights through the CoachHelm surface, not through ⌘K).
 */
export async function getCommandPaletteData(): Promise<CommandPaletteData> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { players: [], recentRounds: [], recentInsights: [] };

  // Resolve role + team context
  const [{ data: coach }, { data: player }] = await Promise.all([
    supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const isCoach = !!coach;

  // Resolve the team id for whichever role this user has. Both surfaces
  // need the team id to scope the queries below.
  let teamId: string | null = null;
  if (isCoach && coach?.organization_id) {
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  } else if (player?.id) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    teamId = membership?.team_id ?? null;
  }

  if (!teamId) {
    return { players: [], recentRounds: [], recentInsights: [] };
  }

  // ── Players (coach only — players see "Team Info" via static command) ──
  const playersPromise = isCoach
    ? supabase
        .from('golf_team_members')
        .select(`
          player:golf_players (
            id,
            first_name,
            last_name,
            handicap,
            avatar_url,
            status:roster_status
          )
        `)
        .eq('team_id', teamId)
        .order('created_at', { ascending: true })
        .limit(60)
    : Promise.resolve({ data: [] as Array<{ player: { id: string; first_name: string | null; last_name: string | null; handicap: number | null; avatar_url: string | null; status: string | null } | null }> });

  // ── Recent rounds (last 10 across team for coach; player's own for player) ──
  const roundsQuery = supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      total_score,
      course:golf_courses ( name ),
      player:golf_players ( first_name, last_name )
    `)
    .eq('team_id', teamId)
    .order('round_date', { ascending: false })
    .limit(10);

  if (!isCoach && player?.id) {
    roundsQuery.eq('player_id', player.id);
  }

  // ── Recent coach insights (coach only — last 10 active) ──
  // FIX: `golf_coach_insights` has NO `severity` column (severity lives on
  // golf_patterns_v2) — selecting it 400'd the whole query, and line ~189's
  // `?? []` swallowed the error so the palette's insights section was silently
  // always empty. Select the real `priority` column instead. Also apply the
  // shared product-visibility contract so the palette never surfaces stale v2 /
  // archived / tentative rows.
  const insightsPromise = isCoach
    ? applyInsightVisibility(
        supabase
          .from('golf_coach_insights')
          .select(`
            id,
            title,
            priority,
            category,
            status,
            player:golf_players ( first_name, last_name )
          `)
          .eq('team_id', teamId)
          .in('status', ['active', 'acknowledged']),
      )
        .order('created_at', { ascending: false })
        .limit(10)
    : Promise.resolve({ data: [] as Array<{
        id: string;
        title: string;
        priority: string | null;
        category: string | null;
        status: string | null;
        player: { first_name: string | null; last_name: string | null } | null;
      }> });

  const [playersResult, roundsResult, insightsResult] = await Promise.all([
    playersPromise,
    roundsQuery,
    insightsPromise,
  ]);

  // ── Shape ──
  // Supabase typed-query inference can resolve to a SelectQueryError for
  // joined selects when the FK relationship name is ambiguous. The runtime
  // shape is what we declared above, so we cast through `any` at the
  // boundary and validate by hand below.
  const playersRaw = (playersResult.data ?? []) as Array<{
    player: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      handicap: number | null;
      avatar_url: string | null;
      status: string | null;
    } | null;
  }>;
  const roundsRaw = (roundsResult.data ?? []) as Array<{
    id: string;
    round_date: string | null;
    total_score: number | null;
    course: { name: string | null } | null;
    player: { first_name: string | null; last_name: string | null } | null;
  }>;
  const insightsRaw = (insightsResult.data ?? []) as Array<{
    id: string;
    title: string;
    priority: string | null;
    category: string | null;
    status: string | null;
    player: { first_name: string | null; last_name: string | null } | null;
  }>;

  const players: CommandPalettePlayer[] = playersRaw
    .map((row) => row.player)
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({
      id: p.id,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Unnamed Player',
      status: p.status,
      handicap: p.handicap,
      avatar_url: p.avatar_url,
    }));

  const recentRounds: CommandPaletteRound[] = roundsRaw.map((r) => ({
    id: r.id,
    course_name: r.course?.name ?? null,
    round_date: r.round_date,
    total_score: r.total_score,
    player_name: r.player
      ? [r.player.first_name, r.player.last_name].filter(Boolean).join(' ').trim() || null
      : null,
  }));

  const recentInsights: CommandPaletteInsight[] = insightsRaw.map((i) => ({
    id: i.id,
    title: i.title,
    // Map the real `priority` column into the UI-facing `severity` field.
    severity: i.priority,
    category: i.category,
    status: i.status,
    player_name: i.player
      ? [i.player.first_name, i.player.last_name].filter(Boolean).join(' ').trim() || null
      : null,
  }));

  return { players, recentRounds, recentInsights };
}
