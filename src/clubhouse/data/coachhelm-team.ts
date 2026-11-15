import 'server-only';
import type { ChStoryRound } from './coachhelm-team-shape';
import { createClient } from '@/lib/supabase/server';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';
import { teamPatternEnabled } from '@/lib/coachhelm/v3/team-pattern/flag';
import { isTrackRecordEnabled } from '@/lib/coachhelm/v3/track-record/flag';
import { toCourseHistory } from '@/lib/coachhelm/v3/team-board/course-shape';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { chLogServer } from '../lib/track-server';
import { isOpenFinding } from './coachhelm-classify';
import { loadCoachBrief } from './coachhelm-coach-brief';
import { loadCoachTrackRecord } from './coachhelm-track-record';
import { readThemes } from './coachhelm-dive';
import { themesByCategory } from './coachhelm-dive-shape';
import { readCorrections } from './coachhelm-corrections';
import { readEngineFlags, readFocusVerdicts } from './coachhelm-engine';
import { isNotEnoughYet, notEnoughOf, notEnoughRead, splitFirm, type ChNotEnoughPlayer } from './coachhelm-firm';
import { toChInsight } from './coachhelm-map';
import {
  assignedByInsight,
  declinedByInsight,
  drillTextByInsight,
  earliestStaleFloor,
  handled,
  loadCoachHelmGate,
  loadVisible,
  newestRounds,
  pulseLater,
  teamPatternsOf,
  tourBaselineOf,
  topInsights,
  type TourRead,
} from './coachhelm';
import { shapeReadsLifecycle } from './coachhelm-engine-shape';
import { boardMissing, firstName, partitionInsights } from './coachhelm-shape';
import {
  courseReads,
  STATIONS,
  stationFigures,
  stationsOfTeamSg,
  worthByRead,
  type ChReadWorth,
  type ChStation,
  type ChTeamBoardData,
  type ChTeamLeg,
  type ChTeamPart,
  type ChTeamPlayer,
  type ChTourRow,
} from './coachhelm-team-shape';
import { roundsForFigures } from './figure-window';
import { toChTeamLegs } from './coachhelm-team-legs';
import { teamLastTenRounds, teamLastTenStrokesGained } from './stats-team-sg';
import { sgPolicyAtSource, sgSourceFor, tourForGender } from './stats-common';
import { sgMixOf } from './stats-sg-mix';
import { holeRounds } from './round-scope';
import { classYearLabel, lastTenFloor, loadSeasonRounds, loadTeamZone, seasonStartDate } from './season';
import { NEEDS_MAX, WORKING_MAX } from './coachhelm-shape';

const log = (what: string, err: unknown) => chLogServer('coachhelm.team', what, err, 'coachhelm');
const NO_NAME = 'Player';
const TOUR_ROWS: ChTourRow['id'][] = ['scoring_par_3', 'scoring_par_4', 'scoring_par_5', 'penalty_rate_per_round', 'big_number_rate', 'opening_hole_delta'];

const noLegs = (): Record<ChStation, ChTeamLeg> => Object.fromEntries(STATIONS.map((s) => [s, { strokes: null, rounds: 0, missing: 'Couldn’t load this part.' }])) as Record<ChStation, ChTeamLeg>;

export function emptyTeamBoard(off: ChTeamBoardData['off'] = null): ChTeamBoardData {
  return {
    off,
    team: { name: '', tourKnown: false, baselineLabel: 'to Tour' },
    roster: { count: 0, error: false },
    players: { list: [], error: false },
    legsError: false,
    stations: stationFigures([]),
    teamTotal: { strokes: null, rounds: 0, seasonRounds: 0 },
    course: { history: null, reads: [], against: null },
    pulse: { rows: [], error: false },
  };
}

/** A part started early: marked handled, never rejecting, and failure is that part's own (02-PLAN 4.5). */
function part<T>(what: string, read: () => Promise<T>): Promise<ChTeamPart<T>> {
  return handled(
    read().then(
      (value): ChTeamPart<T> => ({ status: 'ok', value }),
      (err: unknown): ChTeamPart<T> => {
        log(what, err);
        return { status: 'failed' };
      },
    ),
  );
}

/** A view load's data; anything but ready is that part failing, drawn as its own notice and never as "nothing". */
async function ready<T>(what: string, load: Promise<{ status: string; data?: T }>): Promise<T> {
  const res = await load;
  if (res.status !== 'ready' || res.data === undefined) throw new Error(`${what}: ${res.status}`);
  return res.data;
}

/**
 * The team board's one load (CT0). Read only. One `getTopInsightsForPlayers` call with `limit: 4`; only the reads the board draws count as shown,
 * through `drawnLater`. Follows `loadCoachCoachHelm` step by step, with `flag off` paths untouched there. Parts behind their own flags are absent,
 * not empty, when off.
 */
export async function loadCoachTeamBoard(input: { coachId: string; teamId: string; now?: Date }): Promise<ChTeamBoardData> {
  const supabase = await createClient();
  const now = input.now ?? new Date();

  const gate = await loadCoachHelmGate(input.coachId);
  if (gate.status === 'failed') return { ...emptyTeamBoard(), roster: { count: 0, error: true }, pulse: pulseLater() };
  if (gate.status === 'off') return emptyTeamBoard(gate.off);

  const pulse = pulseLater();
  // One read of the team's row serves its name, its tour and the Tour's values (a second read of the same row is no longer made).
  const teamRow = handled(Promise.resolve(supabase.from('golf_teams').select('name, gender').eq('id', input.teamId).maybeSingle()));
  const tourRead = handled(
    teamRow.then(async (res): Promise<TourRead> => {
      if (res.error) {
        log('team', res.error);
        return { baseline: null, error: true };
      }
      return tourBaselineOf(supabase, res.data as { gender: string | null } | null);
    }),
  );
  const zoneRead = handled(loadTeamZone(supabase, input.teamId, 'coachhelm.team'));
  // A team row that did not load names no tour (lib/sg.ts: an unknown tour claims neither). Awaited only where it is drawn, never in front of a read.
  const teamNamed = handled(
    teamRow.then((info) => {
      const teamData = info.data as { name?: string | null; gender?: string | null } | null;
      return { name: teamData?.name ?? '', tourKnown: false, baselineLabel: 'to Tour', sgTour: teamData ? tourForGender(teamData.gender) : null };
    }),
  );

  const none = emptyTeamBoard();
  // The roster in one read: each member row carries the player it names. A player the coach cannot read comes back null and is left out,
  // as the separate read of `golf_players` left it out.
  const members = await supabase.from('golf_team_members').select('player_id, player:golf_players(id, first_name, last_name, graduation_year)').eq('team_id', input.teamId).eq('status', 'active');
  if (members.error) {
    log('roster', members.error);
    return { ...none, roster: { count: 0, error: true }, pulse };
  }
  const roster = (members.data ?? []).flatMap((m) => {
    const p = m.player as { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null } | null;
    return p ? [{ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || NO_NAME, graduationYear: p.graduation_year }] : [];
  });
  const ids = roster.map((p) => p.id);
  if (!ids.length) return { ...none, team: await teamNamed, roster: { count: 0, error: false }, pulse };

  // What the board draws is known only after the shaping below; the exposures wait for it, and a failed load records nothing.
  let settleDrawn: (ids: readonly string[]) => void = () => {};
  let failDrawn: (err: unknown) => void = () => {};
  const drawn = handled(
    new Promise<readonly string[]>((resolve, reject) => {
      settleDrawn = resolve;
      failDrawn = reject;
    }),
  );

  // Estimated strokes gained (stats-sg-mix.ts): the policy is applied to the rounds as they load, so the hole, the stations and each
  // player's legs follow it. The split for the hole's own window is read as soon as the rounds are in, alongside everything else.
  const roundsRead = handled(
    loadSeasonRounds(supabase, ids, { surface: 'coachhelm.team', since: lastTenFloor(now) }).then(async (res) => {
      const policy = await sgPolicyAtSource(supabase, res.rounds, 'coachhelm.team');
      return { ...res, rounds: policy.rounds, sgEarly: policy.early };
    }),
  );
  const sgSourceRead = handled(roundsRead.then((res) => sgSourceFor(supabase, res.sgEarly, teamLastTenRounds(roundsForFigures(res.rounds), ids), 'coachhelm.team')));
  // The standings need only the ids, and nothing else waits for them: they start with the rounds and are awaited where the Tour comparison
  // is built, instead of after every other read. A failed read is that comparison undrawn (null), never the board's failure.
  const standingsRead = handled(
    loadPlayersStandingMap(ids).catch((err: unknown) => {
      log('standing', err);
      return null;
    }),
  );
  const [visible, heads] = await Promise.all([loadVisible(supabase, ids), topInsights(ids, { limit: NEEDS_MAX + WORKING_MAX, drawnLater: () => drawn })]);
  const rankedAny = [...heads.values()].some((l) => l.length > 0);
  if (visible.error || (visible.rows.length > 0 && !rankedAny)) {
    failDrawn(new Error('the reads did not load'));
    return { ...none, team: await teamNamed, roster: { count: roster.length, error: false }, players: { list: [], error: true }, pulse };
  }

  const flags = readEngineFlags();
  const rowsByPlayer = new Map<string, EvidenceInsight[]>();
  for (const r of visible.rows) rowsByPlayer.set(r.player_id, [...(rowsByPlayer.get(r.player_id) ?? []), r]);
  const heldBack: ChNotEnoughPlayer[] = [];
  const firmByPlayer = new Map<string, EvidenceInsight[]>();
  for (const p of roster) {
    const list = heads.get(p.id) ?? [];
    const split = splitFirm<EvidenceInsight>(list[0], flags.support ? (rowsByPlayer.get(p.id) ?? []) : [], flags.support);
    firmByPlayer.set(p.id, flags.support ? list.filter((r) => !isNotEnoughYet(r.evidence)) : list);
    if (split.held.length > 0) {
      const coach = { role: 'coach', first: p.name === NO_NAME ? NO_NAME : firstName(p.name) } as const;
      heldBack.push({ id: p.id, name: p.name, card: !!split.head, reads: split.held.map((r) => notEnoughRead(r, coach)) });
    }
  }
  const allReads = [...firmByPlayer.values()].flat();
  const readIds = allReads.map((i) => i.id);

  let patternsFailed = false;
  const newestRead = newestRounds(supabase, ids, earliestStaleFloor([...visible.rows, ...allReads]));
  const openRows = Promise.all([newestRead, tourRead]).then(([n, t]) => visible.rows.filter((r) => isOpenFinding(r, t.baseline, n.days.get(r.player_id) ?? null)));
  const [drills, assigned, declined, newest, tourResult, patterns, focus, corrections, seasonRounds, sgSource, zone, team] = await Promise.all([
    drillTextByInsight(supabase, allReads),
    assignedByInsight(supabase, readIds),
    declinedByInsight(supabase, readIds),
    newestRead,
    tourRead,
    teamPatternsOf(supabase, input.teamId, roster, openRows, () => {
      patternsFailed = true;
    }),
    readFocusVerdicts(supabase, readIds, flags.verdicts),
    readCorrections(supabase, { role: 'coach', teamIds: [input.teamId], reads: allReads.map((i) => ({ id: i.id, playerId: i.player_id })) }),
    roundsRead,
    sgSourceRead,
    zoneRead,
    teamNamed,
  ]);
  const tour = tourResult.baseline;
  const iso = now.toISOString();

  const countable = roundsForFigures(seasonRounds.rounds);
  // The legs read each player's last ten across seasons; "this season" figures (the head's count, Courses, the huddle's trails) read from here.
  const seasonStart = seasonStartDate(now, zone);
  const seasonCountable = countable.filter((r) => r.round_date.slice(0, 10) >= seasonStart);
  const legs = toChTeamLegs(countable, ids, seasonStart);
  // The hole's figures and the hero: Team stats' own team figure over the same window (one number, one source).
  const teamSg = teamLastTenStrokesGained(countable, ids);
  // The same rounds, split by where their strokes gained came from: shot-tracked, or estimated from the scorecard.
  const lastTenHoles = holeRounds(teamLastTenRounds(countable, ids));
  const sgMixFor = (playerIds: ReadonlySet<string>) => (seasonRounds.error ? null : sgMixOf(lastTenHoles.filter((r) => playerIds.has(r.player_id)), sgSource));
  const list: ChTeamPlayer[] = roster.map((p) => {
    const first = p.name === NO_NAME ? NO_NAME : firstName(p.name);
    const coach = { role: 'coach', first } as const;
    const newestRound = newest.days.get(p.id) ?? null;
    const own = firmByPlayer.get(p.id) ?? [];
    const shaped = flags.recheck ? shapeReadsLifecycle([...own, ...(rowsByPlayer.get(p.id) ?? []).filter((r) => !own.some((o) => o.id === r.id))], true, coach, iso) : null;
    const cards = own.map((ins) =>
      toChInsight(ins, {
        drillText: drills.texts.get(ins.id) ?? null,
        assigned: assigned.byInsight.get(ins.id) ?? null,
        declined: declined.ids.has(ins.id),
        tour,
        newestRound,
        viewer: p.name === NO_NAME ? undefined : coach,
        engine: { flags, lifecycle: shaped?.byId.get(ins.id) ?? null, focus: focus.get(ins.id) ?? null, now: iso, viewer: coach, corrections: corrections?.get(ins.id) ?? null },
      }),
    );
    const split = partitionInsights(cards);
    const needs = split.focus ? [split.focus, ...split.also] : split.also;
    const leg = legs.get(p.id);
    return {
      id: p.id,
      name: p.name,
      first,
      classYear: classYearLabel(p.graduationYear, undefined, zone) || null,
      rounds: leg?.rounds ?? 0,
      early: leg?.early ?? true,
      legs: seasonRounds.error ? noLegs() : (leg?.legs ?? noLegs()),
      total: seasonRounds.error ? null : (leg?.total ?? null),
      worst: seasonRounds.error ? null : (leg?.worst ?? null),
      first10: seasonRounds.error ? null : (leg?.first10 ?? null),
      sgMix: sgMixFor(new Set([p.id])),
      reads: { needs, working: split.working },
      heldBack: heldBack.find((h) => h.id === p.id)?.reads.length ?? 0,
    };
  });
  // Counted as shown: what the board draws, at most 3 and 1 a player, no note, no measured zero (W-TEAM-4).
  settleDrawn(list.flatMap((p) => [...p.reads.needs, ...p.reads.working].map((r) => r.id)));

  // "Courses this season" stays the season's.
  const history = seasonRounds.error ? null : toCourseHistory(seasonCountable as never, ids, iso.slice(0, 10));
  const names = new Map(roster.map((p) => [p.id, p.name]));
  // One read of each player's themes serves the stories and each drawn read's worth.
  const themed = part('themes', async () => {
    // At most four at a time, only players the reads say are moving (02-PLAN 4.5).
    const themes: Record<string, ReturnType<typeof themesByCategory>> = {};
    const worth: Record<string, ChReadWorth> = {};
    // A theme only tells a story when it is Improving or Slipping; storiesOf drops the rest.
    const candidates = [...names.keys()];
    for (let i = 0; i < candidates.length; i += 4) {
      await Promise.all(
        candidates.slice(i, i + 4).map(async (id) => {
          const t = await readThemes(id, 'coach');
          if (!t) return;
          themes[id] = themesByCategory(t, 'coach');
          const drawn = list.find((p) => p.id === id);
          Object.assign(worth, worthByRead(drawn ? [...drawn.reads.needs, ...drawn.reads.working].map((r) => r.id) : [], t));
        }),
      );
    }
    return { themes, worth };
  });
  const storyRounds = part('storyRounds', async () => {
    // AC-TODAY-04: only a round inside the week earns the strip; a player's newest one.
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: rounds, error } = await supabase.from('golf_rounds').select('id, player_id, round_date, course_name').eq('is_test', false).eq('status', 'completed').in('player_id', [...names.keys()]).gte('round_date', since).order('round_date', { ascending: false });
    if (error) throw error;
    const newest = new Map<string, { id: string; player_id: string; round_date: string; course_name: string | null }>();
    for (const r of rounds ?? []) if (!newest.has(r.player_id)) newest.set(r.player_id, r);
    const roundIds = [...newest.values()].map((r) => r.id);
    if (!roundIds.length) return {};
    const { data: holes, error: holesError } = await supabase.from('golf_holes').select('round_id, hole_number, par, score, putts, fairway_hit, gir').in('round_id', roundIds).order('hole_number', { ascending: true });
    if (holesError) throw holesError;
    const out: Record<string, ChStoryRound> = {};
    for (const r of newest.values()) {
      const mine = (holes ?? []).filter((h) => h.round_id === r.id);
      const name = names.get(r.player_id);
      if (!name || !mine.length) continue;
      out[name] = {
        date: r.round_date,
        course: r.course_name,
        holes: mine.map((h) => ({ n: h.hole_number, toPar: h.score == null ? null : h.score - h.par })),
        tracked: mine.filter((h) => h.putts != null || h.fairway_hit != null || h.gir != null).length,
      };
    }
    return out;
  });

  // The streamed parts above are started first; the Tour comparison (whose read began with the rounds) is the last thing awaited.
  const standings = await standingsRead;
  const against: ChTourRow[] | null = standings
    ? TOUR_ROWS.map((id) => {
        const rows = ids.map((pid) => standings.get(pid)?.get(id as never)).filter((s): s is NonNullable<typeof s> => s != null && s.player_value != null);
        const tourValue = rows.find((s) => s.pga_value != null && !s.pga_omitted)?.pga_value ?? null;
        return { id, team: rows.length ? rows.reduce((a, s) => a + (s.player_value as number), 0) / rows.length : null, tour: tourValue, n: rows.length };
      })
    : null;

  const missing = boardMissing({ drills: drills.error, assigned: assigned.error, declined: declined.error, newest: newest.error, tour: tourResult.error });
  return {
    off: null,
    team: { ...team, tourKnown: !!tour, baselineLabel: 'to Tour' },
    roster: { count: roster.length, error: false },
    players: { list, error: false },
    legsError: seasonRounds.error,
    stations: seasonRounds.error ? stationFigures([]) : stationsOfTeamSg(teamSg),
    teamTotal: { strokes: seasonRounds.error ? null : teamSg.total, rounds: countable.length, seasonRounds: seasonCountable.length, sgMix: sgMixFor(teamSg.ready) },
    course: { history, reads: courseReads(list), against },
    patterns,
    patternsStatus: !teamPatternEnabled() ? 'off' : patternsFailed ? 'failed' : 'ok',
    notEnough: notEnoughOf(heldBack),
    ...(missing ? { missing } : {}),
    pulse,
    ...(isMondayBriefEnabled() ? { brief: part('brief', () => ready('brief', loadCoachBrief({ coachId: input.coachId, teamId: input.teamId, now }))) } : {}),
    ...(isTrackRecordEnabled() ? { record: part('record', () => ready('record', loadCoachTrackRecord({ coachId: input.coachId, teamId: input.teamId, now }))) } : {}),
    storyRounds,
    themes: themed.then((p): ChTeamPart<Record<string, ReturnType<typeof themesByCategory>>> => (p.status === 'ok' ? { status: 'ok', value: p.value.themes } : p)),
    // One read, one worth: the cascade's figure (`closesFor`), which the Read page and the Player file print, from the themes just read.
    worth: themed.then((p): ChTeamPart<Record<string, ChReadWorth>> => (p.status === 'ok' ? { status: 'ok', value: p.value.worth } : p)),
  };
}
