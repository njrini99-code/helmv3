import 'server-only';
import { getInsightsForCoach, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/utils/uuid';
import { chLogServer } from '../lib/track-server';
import { assignedByInsight, coachTour, countCountableRounds, declinedByInsight, drillTextByInsight, earliestStaleFloor, handled, loadCoachHelmGate, loadPlayerHelmGate, loadVisible, newestRounds, PLAYER_FEED_LIMIT, type CoachHelmGate } from './coachhelm';
import { countReads, isOpenFinding, kindOf } from './coachhelm-classify';
import { EMPTY_DIVE, readPlans, readRounds, readThemes } from './coachhelm-dive';
import { diveCounts, orderDive, roundIdsToRead, themesByCategory, toChDeepInsight, toDiveCleared, type ChDeepDive } from './coachhelm-dive-shape';
import { readEngineFlags, readFocusVerdicts } from './coachhelm-engine';
import { shapeReadsLifecycle } from './coachhelm-engine-shape';
import { toChInsight } from './coachhelm-map';
import { toChProfile, type ChProfile } from './coachhelm-profile-shape';
import { boardMissing, firstName } from './coachhelm-shape';
import { loadPlayerStanding } from './coachhelm-standing';
import type { ChStanding } from './coachhelm-standing-shape';
import { coachHeadLine, type ChCoachPlayerHead, type ChViewLoad } from './coachhelm-views-shape';
import { speak, type ChViewer } from './coachhelm-voice';
import { classYearLabel } from './season';

/**
 * A coach's views of one player (Clubhouse P013, spec A): the Game profile, Standing and Deep dive at
 * `/golf/dashboard/coachhelm?view=…&player=<golf_players.id>`. The address names the player; it is only ever input, and nothing
 * here trusts it until `loadCoachPlayerScope` has checked it against the coach's own team.
 *
 * The scope is a branded value that only `loadCoachPlayerScope` makes, and the three loaders take it, never an id: Standing reads
 * `golf_player_standing` through the service client (`loadPlayerStandingMap`), and the goals read through it too, so an id from the
 * address that reached them unchecked would read any player's rows. A raw string, or an object shaped like a scope, does not compile
 * as one (`data/__tests__/coachhelm-player.test.ts`).
 *
 * Everything else is the player's views' own code, reused: the shapers, the delivery action, the Board's helpers. Nothing computes a
 * number of its own. The one difference in what is read is the feed: a coach's Deep dive reads `getInsightsForCoach` for the player
 * (the coach feed, which keeps the coach's evidence and records a coach exposure), never `getInsightsForPlayer` (which strips the
 * coach's keys and records the reads as shown to the player).
 */

const log = (what: string, err: unknown) => chLogServer('coachhelm', what, err, 'coachhelm');

/** What the board calls a player with no name on file. */
const NO_NAME = 'Player';

declare const COACH_PLAYER_SCOPE: unique symbol;

/**
 * One player a coach may read: an active member of the team the shell resolved for this coach, with CoachHelm on for both. Made only
 * by `loadCoachPlayerScope` (the brand); every coach loader takes it. It is this team's only: a player the coach staffs on another
 * team is not in scope here.
 */
export type ChCoachPlayerScope = {
  readonly coachId: string;
  readonly teamId: string;
  readonly playerId: string;
  /** Who the views are about, as the client draws it. */
  readonly head: ChCoachPlayerHead;
  /** The play date of the player's newest completed round that is not a test; null with none. */
  readonly lastRound: string | null;
  readonly [COACH_PLAYER_SCOPE]: true;
};

/**
 * What the scope check answers. `not-member`: not an id, not on this team, or not active on it (one answer for all three, so the
 * page never says whether a player exists). `failed`: a read the check needs did not load, never `not-member`. `coach-off`: CoachHelm
 * is off for the coach (the board's own page). `player-off`: it is off for this player's team; the head is known, nothing else is read.
 */
export type ChCoachPlayerScopeResult =
  | { status: 'ok'; scope: ChCoachPlayerScope }
  | { status: 'not-member' }
  | { status: 'failed' }
  | { status: 'coach-off'; off: Extract<CoachHelmGate, { status: 'off' }>['off'] }
  | { status: 'player-off'; reason: string | null; head: ChCoachPlayerHead };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The play date of the player's newest completed, non-test round; `undefined` when the read failed. */
async function newestRoundDay(supabase: Supabase, playerId: string): Promise<string | null | undefined> {
  const res = await supabase.from('golf_rounds').select('round_date').eq('player_id', playerId).eq('status', 'completed').eq('is_test', false).order('round_date', { ascending: false }).limit(1).maybeSingle();
  if (res.error) {
    log('player.lastRound', res.error);
    return undefined;
  }
  return (res.data as { round_date: string | null } | null)?.round_date ?? null;
}

/**
 * The scope check, in order: the id is a uuid (else `not-member` with no read); CoachHelm is on for the coach; the player is an
 * active member of this team (the session's client, so RLS answers as it does for the board); CoachHelm is on for the player's
 * team; and their newest round, for the header. A read that fails is `failed`, never `not-member`.
 */
export async function loadCoachPlayerScope(input: { coachId: string; teamId: string; playerId: string }, now: Date = new Date()): Promise<ChCoachPlayerScopeResult> {
  const { coachId, teamId, playerId } = input;
  if (!isUuid(playerId)) return { status: 'not-member' };
  const gate = await loadCoachHelmGate(coachId);
  if (gate.status === 'failed') return { status: 'failed' };
  if (gate.status === 'off') return { status: 'coach-off', off: gate.off };
  try {
    const supabase = await createClient();
    const member = await supabase.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('player_id', playerId).eq('status', 'active').maybeSingle();
    if (member.error) {
      log('player.member', member.error);
      return { status: 'failed' };
    }
    if (!member.data) return { status: 'not-member' };
    // The name and class, read as the board reads its roster's names (after the membership, so nothing about a player off this team is read).
    const who = await supabase.from('golf_players').select('id, first_name, last_name, graduation_year').eq('id', playerId).maybeSingle();
    if (who.error) {
      log('player.name', who.error);
      return { status: 'failed' };
    }
    const p = who.data as { first_name: string | null; last_name: string | null; graduation_year: number | null } | null;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || NO_NAME;
    const first = name === NO_NAME ? NO_NAME : firstName(name);
    const [playerGate, lastRound] = await Promise.all([loadPlayerHelmGate(playerId), newestRoundDay(supabase, playerId)]);
    if (playerGate.status === 'failed' || lastRound === undefined) return { status: 'failed' };
    const head: ChCoachPlayerHead = { playerId, name, first, line: coachHeadLine(classYearLabel(p?.graduation_year ?? null, now), lastRound, now) };
    if (playerGate.status === 'off') return { status: 'player-off', reason: playerGate.reason, head };
    return { status: 'ok', scope: { coachId, teamId, playerId, head, lastRound } as ChCoachPlayerScope };
  } catch (err) {
    log('player.scope', err);
    return { status: 'failed' };
  }
}

/** The voice every coach view of this player is in: the player by first name. */
const coachViewer = (scope: ChCoachPlayerScope): Extract<ChViewer, { role: 'coach' }> => ({ role: 'coach', first: scope.head.first });

/** The player's visible reads (the Board's own read: no exposure is recorded) and the team's Tour, for the two views that count reads. */
async function visibleReads(supabase: Supabase, scope: ChCoachPlayerScope) {
  const [visible, tour] = await Promise.all([loadVisible(supabase, [scope.playerId]), coachTour(supabase, scope.teamId)]);
  return { error: visible.error, rows: visible.rows.filter((r) => r.player_id === scope.playerId), tour: tour.baseline };
}

/** How many of the player's current reads are costing strokes and how many are working (the coach's Game profile line). */
async function readSeen(supabase: Supabase, scope: ChCoachPlayerScope): Promise<NonNullable<ChProfile['seen']>> {
  const v = await visibleReads(supabase, scope);
  if (v.error) return { costing: 0, working: 0, error: true };
  return { ...countReads(v.rows, v.tour, scope.lastRound), error: false };
}

/**
 * The coach's Game profile of this player: the genome through the session's client (RLS `genome_coach_read`), shaped by the player's
 * own shaper in the coach's voice, and the one line of what CoachHelm sees. A failed genome read is the failed page.
 */
export async function loadCoachPlayerProfile(input: { scope: ChCoachPlayerScope }, now: Date = new Date()): Promise<ChViewLoad<ChProfile>> {
  const { scope } = input;
  try {
    const supabase = await createClient();
    const [genome, seen] = await Promise.all([loadGenome(supabase, scope.playerId), readSeen(supabase, scope)]);
    return { status: 'ready', data: { ...toChProfile(genome, now, coachViewer(scope)), seen } };
  } catch (err) {
    log('player.profile', err);
    return { status: 'failed' };
  }
}

/** The open read on each metric that has one, by metric id; null when the read failed (the rows then draw no link). */
async function openReads(supabase: Supabase, scope: ChCoachPlayerScope): Promise<Record<string, string> | null> {
  try {
    const v = await visibleReads(supabase, scope);
    if (v.error) return null;
    const out: Record<string, string> = {};
    for (const r of v.rows) {
      const metric = r.evidence?.metric;
      if (metric && !(metric in out) && isOpenFinding(r, v.tour, scope.lastRound)) out[metric] = r.id;
    }
    return out;
  } catch (err) {
    log('player.standing.reads', err);
    return null;
  }
}

/**
 * The coach's Standing of this player: the player's own loader (`loadPlayerStanding`, which reads the standing map through the
 * service client and keeps only this player's rows) given the scope's id and the coach's voice, and the open read behind each metric.
 */
export async function loadCoachPlayerStanding(input: { scope: ChCoachPlayerScope }): Promise<ChViewLoad<ChStanding>> {
  const { scope } = input;
  const supabase = await createClient();
  const [standing, reads] = await Promise.all([loadPlayerStanding({ playerId: scope.playerId, viewer: coachViewer(scope), feed: () => getInsightsForCoach(scope.coachId, { player_id: scope.playerId, limit: PLAYER_FEED_LIMIT, includeMore: true }) }), openReads(supabase, scope)]);
  if (standing.status !== 'ready') return standing;
  return { status: 'ready', data: { ...standing.data, ...(reads ? { reads } : {}) } };
}

/**
 * The coach's Deep dive of this player: every read, as the player's Deep dive draws it (the same shapers), read through the coach
 * feed (`getInsightsForCoach` with `player_id`), with what the Board reads beside a card (the drill text, which reads are assigned or
 * declined, the newest round) so a read can be assigned from here. The coach sees an inferred cause, marked Likely, not measured.
 *
 * The coach feed answers an empty list when its read fails, so an empty feed is told from a first run as the player's is: drawable
 * visible reads on file mean it failed.
 */
export async function loadCoachPlayerDeepDive(input: { scope: ChCoachPlayerScope }): Promise<ChViewLoad<ChDeepDive>> {
  const { scope } = input;
  const { playerId } = scope;
  try {
    const supabase = await createClient();
    // The reads that record nothing as shown run beside the feed: the team's Tour, the plans and the category reads.
    const tourRead = handled(coachTour(supabase, scope.teamId));
    const plansRead = handled(readPlans(supabase, playerId));
    const themesRead = handled(readThemes(playerId, 'coach'));
    let feed: EvidenceInsight[];
    try {
      feed = await getInsightsForCoach(scope.coachId, { player_id: playerId, limit: PLAYER_FEED_LIMIT, includeMore: true });
    } catch (err) {
      log('player.dive.feed', err);
      return { status: 'failed' };
    }
    const tour = await tourRead;
    const tourName: ChDeepDive['tour'] = tour.baseline?.tour === 'lpga' ? 'LPGA Tour' : 'Tour';
    if (feed.length === 0) {
      const visible = await loadVisible(supabase, [playerId]);
      if (visible.error || visible.rows.length > 0) return { status: 'failed' };
      return { status: 'ready', data: EMPTY_DIVE(await countCountableRounds(supabase, playerId), tourName) };
    }
    // The feed is the player's, whatever it returned: a row that is anyone else's is never drawn.
    const drawn = feed.filter((i) => i.player_id === playerId && kindOf(i, tour.baseline) !== 'note');
    if (drawn.length === 0) return { status: 'ready', data: EMPTY_DIVE(await countCountableRounds(supabase, playerId), tourName) };

    const flags = readEngineFlags();
    const now = new Date().toISOString();
    const viewer = coachViewer(scope);
    const shaped = shapeReadsLifecycle(drawn, flags.recheck, viewer, now);
    const ids = drawn.map((i) => i.id);
    const [drills, assigned, declined, newest, rounds, plans, themes, focus] = await Promise.all([
      drillTextByInsight(supabase, drawn),
      assignedByInsight(supabase, ids),
      declinedByInsight(supabase, ids),
      newestRounds(supabase, [playerId], earliestStaleFloor(drawn)),
      readRounds(supabase, playerId, drawn.flatMap((i) => roundIdsToRead(i.evidence))),
      plansRead,
      themesRead,
      readFocusVerdicts(
        supabase,
        shaped.kept.map((i) => i.id),
        flags.verdicts,
      ),
    ]);
    const newestRound = newest.days.get(playerId) ?? null;
    const say = (t: string) => speak(t, viewer);
    const list = orderDive(
      shaped.kept.map((raw) => {
        const base = toChInsight(raw, {
          drillText: drills.texts.get(raw.id) ?? null,
          assigned: assigned.byInsight.get(raw.id) ?? null,
          declined: declined.ids.has(raw.id),
          tour: tour.baseline,
          newestRound,
          viewer,
          engine: { flags, lifecycle: shaped.byId.get(raw.id) ?? null, focus: focus.get(raw.id) ?? null, now, viewer },
        });
        return toChDeepInsight(raw, base, { rounds: rounds ?? new Map(), focusAreas: plans?.focusAreas ?? [], goals: plans?.goals ?? [], themes }, say, 'coach');
      }),
    );
    const missing = boardMissing({ drills: drills.error, assigned: assigned.error, declined: declined.error, newest: newest.error, tour: tour.error });
    return {
      status: 'ready',
      data: {
        list,
        tour: tourName,
        rounds: null,
        themes: themesByCategory(themes, 'coach'),
        roundsFailed: rounds === null,
        plansFailed: plans === null,
        themesFailed: themes === null,
        counts: diveCounts(list),
        ...(missing ? { missing } : {}),
        ...(shaped.clearedReads.length > 0 ? { cleared: shaped.clearedReads.map((c) => toDiveCleared(c.read, c.line)) } : {}),
      },
    };
  } catch (err) {
    log('player.dive', err);
    return { status: 'failed' };
  }
}
