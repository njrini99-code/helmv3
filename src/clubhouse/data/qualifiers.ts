import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { readQualifierSelectionReasons } from '@/lib/golf/qualifier-selection-reasons';
import { loadQualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/loader';
import type { QualifyingWorkspace } from '@/lib/coachhelm/v3/qualifying/types';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName } from './season';
import {
  buildBoard,
  parseSelectionState,
  parseStatus,
  roundPars,
  type ChQBoard,
  type ChQEntrant,
  type ChQFormValues,
  type ChQHole,
  type ChQRound,
  type ChQSelection,
  type ChQSelectionState,
  type ChQStatus,
} from '../screens/qualifiers/model';

/**
 * Qualifiers (Clubhouse), coach and player. Server-read in one pass, final on
 * first paint, every section with its own failure flag. Reads go through the
 * RLS-scoped client, so a player sees only their team's qualifiers and, per
 * RLS, selections only once the coach has confirmed the squad. What players
 * don't see on top of RLS (D-30, D-33) is dropped here, before it reaches the
 * browser: teammates' scorecards and the coach's pick reasoning.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Role = 'coach' | 'player';

const Q_COLUMNS =
  'id, name, description, status, start_date, end_date, entry_deadline, course_name, rules, num_rounds, selection_slots_total, selection_slots_coach_pick, selection_state, is_test';

interface QRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string;
  end_date: string | null;
  entry_deadline: string | null;
  course_name: string | null;
  rules: string | null;
  num_rounds: number;
  selection_slots_total: number;
  selection_slots_coach_pick: number;
  selection_state: string;
  is_test: boolean;
}
type PlayerCols = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
type EntryRow = { qualifier_id: string; player_id: string; player: PlayerCols | null };
type RoundRow = {
  id: string;
  qualifier_id: string | null;
  player_id: string;
  qualifier_round_number: number | null;
  total_score: number | null;
  score_to_par: number | null;
  round_date: string;
  course_name: string | null;
  holes_played: number | null;
};

export interface ChQListItem {
  id: string;
  name: string;
  description: string | null;
  status: ChQStatus;
  startDate: string;
  endDate: string | null;
  course: string | null;
  numRounds: number;
  squad: number;
  picks: number;
  entrants: number;
  submitted: number;
  /** The hero's leaders: the places on score plus the first one out. */
  leaders: Array<{ playerId: string; name: string; position: string; played: number; toPar: number | null }>;
  topScore: number;
  /** A player's own standing; null for a coach. */
  mine: { entered: boolean; position: string | null; toPar: number | null; played: number } | null;
}

export interface ChQList {
  role: Role;
  mode: 'all' | 'mine';
  items: ChQListItem[];
  /** The qualifiers didn't load: shown as a notice, never as "no qualifiers". */
  listError: boolean;
  /** Entries or rounds didn't load: counts and leaders are missing, not zero. */
  standingsError: boolean;
}

export interface ChQRoundCourse {
  number: number;
  course: string | null;
  teeName: string | null;
  par: number | null;
}

export interface ChQDetail {
  role: Role;
  viewerPlayerId: string | null;
  id: string;
  name: string;
  description: string | null;
  status: ChQStatus;
  selectionState: ChQSelectionState;
  startDate: string;
  endDate: string | null;
  deadline: string | null;
  course: string | null;
  rules: string | null;
  numRounds: number;
  squad: number;
  picks: number;
  entrants: number;
  /** Null when the entries or the rounds didn't load: the field is never shown without its scores. */
  board: ChQBoard | null;
  entriesError: boolean;
  roundsError: boolean;
  /** Scorecards by round id, for the rounds this viewer may open. */
  holes: Record<string, ChQHole[]>;
  holesError: boolean;
  roundCourses: ChQRoundCourse[];
  par: number | null;
  coursesError: boolean;
  /** The confirmed squad, or null when not confirmed or not readable. */
  selections: Array<ChQSelection & { name: string }> | null;
  selectionsError: boolean;
}

export interface ChQFormPlayer {
  id: string;
  name: string;
  classYear: string | null;
  /** Why the player can't be taken out: a round in this qualifier (any status), or a selection row. Matches setQualifierEntrants. */
  locked: false | 'round' | 'squad';
  /** Entered but no longer on the active roster. */
  inactive: boolean;
}

export interface ChQFormRoundCourse {
  number: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
  teeName: string | null;
  par: number | null;
}

export interface ChQFormData {
  mode: 'create' | 'edit';
  id: string | null;
  name: string | null;
  initial: ChQFormValues;
  roundCourses: ChQFormRoundCourse[];
  players: ChQFormPlayer[];
  /** The roster (or, editing, the entrants) didn't load: players can't be chosen, so saving is blocked. */
  playersError: boolean;
  /** The per-round courses didn't load: editing them is blocked so a blank can't overwrite one. */
  coursesError: boolean;
  /** Squad size is fixed once the coach has confirmed the squad. */
  squadLocked: boolean;
  /** The highest round number with a score, which the round count can't go below. */
  minRounds: number;
}

function entrantOf(p: PlayerCols, now: Date): ChQEntrant {
  return { playerId: p.id, name: fullName(p), classYear: classYearLabel(p.graduation_year, now) };
}
function roundOf(r: RoundRow): ChQRound {
  return {
    id: r.id,
    playerId: r.player_id,
    number: r.qualifier_round_number ?? 1,
    total: r.total_score,
    toPar: r.score_to_par,
    date: r.round_date,
    course: r.course_name,
    holesPlayed: r.holes_played,
  };
}

const ENTRY_SELECT = 'qualifier_id, player_id, player:golf_players(id, first_name, last_name, graduation_year)';
const ROUND_SELECT = 'id, qualifier_id, player_id, qualifier_round_number, total_score, score_to_par, round_date, course_name, holes_played';

async function readEntries(supabase: Supabase, qualifierIds: string[], surface: string): Promise<{ rows: EntryRow[]; error: boolean }> {
  const rows: EntryRow[] = [];
  for (const chunk of chunkIds(qualifierIds)) {
    const { data, error } = await fetchAllRowsResult<EntryRow>((from, to) =>
      supabase.from('golf_qualifier_entries').select(ENTRY_SELECT).in('qualifier_id', chunk).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<{
        data: EntryRow[] | null;
        error: { message: string } | null;
      }>,
    );
    if (error) {
      chLogServer(surface, 'entries', error, 'qualifiers');
      return { rows, error: true };
    }
    rows.push(...(data ?? []));
  }
  return { rows, error: false };
}

async function readRounds(supabase: Supabase, qualifierIds: string[], surface: string): Promise<{ rows: RoundRow[]; error: boolean }> {
  const rows: RoundRow[] = [];
  for (const chunk of chunkIds(qualifierIds)) {
    const { data, error } = await fetchAllRowsResult<RoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select(ROUND_SELECT)
        .in('qualifier_id', chunk)
        .eq('status', 'completed')
        .eq('is_test', false)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) {
      chLogServer(surface, 'rounds', error, 'qualifiers');
      return { rows, error: true };
    }
    rows.push(...(data ?? []));
  }
  return { rows, error: false };
}

/** The team's qualifiers, newest first. `mine` keeps only the ones the player is entered in. */
export async function loadQualifierList(input: { role: Role; teamId: string; playerId: string | null; mode: 'all' | 'mine' }): Promise<ChQList> {
  const supabase = await createClient();
  const now = new Date();
  const listRes = await supabase
    .from('golf_qualifiers')
    .select(Q_COLUMNS)
    .eq('team_id', input.teamId)
    .eq('is_test', false)
    .order('start_date', { ascending: false })
    .order('id', { ascending: true })
    .limit(1000);
  if (listRes.error) {
    chLogServer('qualifiers', 'list', listRes.error, 'qualifiers');
    return { role: input.role, mode: input.mode, items: [], listError: true, standingsError: false };
  }
  const qs = (listRes.data ?? []) as QRow[];
  const ids = qs.map((q) => q.id);
  const [entries, rounds] = ids.length
    ? await Promise.all([readEntries(supabase, ids, 'qualifiers'), readRounds(supabase, ids, 'qualifiers')])
    : [
        { rows: [], error: false },
        { rows: [], error: false },
      ];
  const standingsError = entries.error || rounds.error;

  const items: ChQListItem[] = qs.map((q) => {
    const status = parseStatus(q.status);
    const qEntries = entries.rows.filter((e) => e.qualifier_id === q.id && e.player);
    const board = buildBoard({
      entrants: qEntries.map((e) => entrantOf(e.player as PlayerCols, now)),
      rounds: rounds.rows.filter((r) => r.qualifier_id === q.id).map(roundOf),
      squad: q.selection_slots_total,
      picks: q.selection_slots_coach_pick,
      status,
      selectionState: parseSelectionState(q.selection_state),
      selections: null,
    });
    const me = input.playerId ? [...board.rows, ...board.unscored].find((r) => r.playerId === input.playerId) : undefined;
    return {
      id: q.id,
      name: q.name,
      description: q.description,
      status,
      startDate: q.start_date,
      endDate: q.end_date,
      course: q.course_name,
      numRounds: q.num_rounds,
      squad: q.selection_slots_total,
      picks: q.selection_slots_coach_pick,
      entrants: qEntries.length,
      submitted: board.submitted,
      topScore: board.topScore,
      leaders: standingsError
        ? []
        : board.rows.slice(0, board.topScore + 1).map((r) => ({
            playerId: r.playerId,
            name: r.name,
            position: (r.tied ? 'T' : '') + r.position,
            played: r.played,
            toPar: r.toPar,
          })),
      mine:
        input.role === 'player'
          ? { entered: !!me, position: me?.position != null ? (me.tied ? 'T' : '') + me.position : null, toPar: me?.toPar ?? null, played: me?.played ?? 0 }
          : null,
    };
  });

  const visible = input.mode === 'mine' ? items.filter((i) => i.mine?.entered) : items;
  // A player's own qualifiers come first within the list order (D-30).
  const ordered = input.role === 'player' ? [...visible.filter((i) => i.mine?.entered), ...visible.filter((i) => !i.mine?.entered)] : visible;
  return { role: input.role, mode: input.mode, items: ordered, listError: false, standingsError };
}

/**
 * One qualifier on this team. Returns null when it doesn't exist or isn't on
 * the viewer's team (RLS returns nothing either way). A failed read of the
 * qualifier itself throws, so the route error view offers a retry instead of
 * a false "not found".
 */
export async function loadQualifierDetail(input: { role: Role; teamId: string; playerId: string | null; qualifierId: string }): Promise<ChQDetail | null> {
  const supabase = await createClient();
  const now = new Date();
  const qRes = await supabase.from('golf_qualifiers').select(`${Q_COLUMNS}, team_id`).eq('id', input.qualifierId).maybeSingle();
  if (qRes.error) {
    chLogServer('qualifiers', 'qualifier', qRes.error, 'qualifiers');
    throw new Error('Clubhouse: the qualifier read failed');
  }
  const q = qRes.data as (QRow & { team_id: string }) | null;
  // A test qualifier is hidden from the list, so a link to one is "not found" too (swap audit §11 reconciliation).
  if (!q || q.team_id !== input.teamId || q.is_test) return null;

  const status = parseStatus(q.status);
  const selectionState = parseSelectionState(q.selection_state);
  const [entries, rounds, coursesRes, selRes, reasonsRes] = await Promise.all([
    readEntries(supabase, [q.id], 'qualifiers'),
    readRounds(supabase, [q.id], 'qualifiers'),
    supabase.from('golf_qualifier_round_courses').select('round_number, course_name, tee_id').eq('qualifier_id', q.id).order('round_number', { ascending: true }),
    selectionState === 'selected'
      ? supabase.from('golf_qualifier_selections').select('player_id, selection_type').eq('qualifier_id', q.id)
      : Promise.resolve({ data: [], error: null }),
    // The pick reasoning is the coach's note (D-35): only a coach asks for it, through the coach-gated reader.
    selectionState === 'selected' && input.role === 'coach'
      ? readQualifierSelectionReasons(supabase, q.id)
      : Promise.resolve({ reasons: new Map<string, string | null>(), error: null }),
  ]);
  if (coursesRes.error) chLogServer('qualifiers', 'roundCourses', coursesRes.error, 'qualifiers');
  if (selRes.error) chLogServer('qualifiers', 'selections', selRes.error, 'qualifiers');
  // Without the reasons the squad still shows; only the coach's notes are missing.
  if (reasonsRes.error) chLogServer('qualifiers', 'reasons', reasonsRes.error, 'qualifiers');

  // Tee pars for the assigned courses (D-33: par per round from the tee, else from the rounds).
  const courseRows = (coursesRes.data ?? []) as Array<{ round_number: number; course_name: string | null; tee_id: string | null }>;
  const teeIds = [...new Set(courseRows.map((c) => c.tee_id).filter((t): t is string => !!t))];
  let tees = new Map<string, { tee_name: string; total_par: number | null }>();
  let teesError = false;
  if (teeIds.length) {
    const teeRes = await supabase.from('golf_course_tees').select('id, tee_name, total_par').in('id', teeIds);
    if (teeRes.error) {
      chLogServer('qualifiers', 'tees', teeRes.error, 'qualifiers');
      teesError = true;
    } else {
      tees = new Map((teeRes.data ?? []).map((t) => [t.id, { tee_name: t.tee_name, total_par: t.total_par }]));
    }
  }

  const qRounds = rounds.rows.map(roundOf);
  const entrants = entries.rows.filter((e) => e.player).map((e) => entrantOf(e.player as PlayerCols, now));
  const nameOf = new Map(entrants.map((e) => [e.playerId, e.name]));
  const selections: Array<ChQSelection & { name: string }> | null =
    selectionState === 'selected' && !selRes.error
      ? ((selRes.data ?? []) as Array<{ player_id: string; selection_type: string }>).map((s) => ({
          playerId: s.player_id,
          type: s.selection_type === 'coach_pick' ? 'coach_pick' : 'top_score',
          // The pick reasoning is the coach's (D-33); a player's payload never carries it.
          reasoning: input.role === 'coach' ? (reasonsRes.reasons.get(s.player_id) ?? null) : null,
          name: nameOf.get(s.player_id) ?? 'A player',
        }))
      : null;

  const board =
    entries.error || rounds.error
      ? null
      : buildBoard({ entrants, rounds: qRounds, squad: q.selection_slots_total, picks: q.selection_slots_coach_pick, status, selectionState, selections });

  // Scorecards: a coach opens every round; a player only their own (D-33).
  const openable = qRounds.filter((r) => input.role === 'coach' || r.playerId === input.playerId).map((r) => r.id);
  const holes: Record<string, ChQHole[]> = {};
  let holesError = false;
  for (const chunk of chunkIds(openable)) {
    const { data, error } = await fetchAllRowsResult<{ round_id: string; hole_number: number; par: number; score: number | null }>((from, to) =>
      supabase.from('golf_holes').select('round_id, hole_number, par, score').in('round_id', chunk).order('id', { ascending: true }).range(from, to),
    );
    if (error) {
      chLogServer('qualifiers', 'holes', error, 'qualifiers');
      holesError = true;
      break;
    }
    for (const h of data ?? []) (holes[h.round_id] ??= []).push({ n: h.hole_number, par: h.par, score: h.score });
  }
  for (const list of Object.values(holes)) list.sort((a, b) => a.n - b.n);

  const byNumber = new Map(courseRows.map((c) => [c.round_number, c]));
  const pars = roundPars({
    numRounds: q.num_rounds,
    teePars: new Map(courseRows.map((c) => [c.round_number, c.tee_id ? (tees.get(c.tee_id)?.total_par ?? null) : null])),
    rounds: qRounds,
  });
  const roundCourses: ChQRoundCourse[] = Array.from({ length: q.num_rounds }, (_, i) => {
    const c = byNumber.get(i + 1);
    return {
      number: i + 1,
      course: c?.course_name ?? q.course_name,
      teeName: c?.tee_id ? (tees.get(c.tee_id)?.tee_name ?? null) : null,
      par: pars.byRound[i] ?? null,
    };
  });

  return {
    role: input.role,
    viewerPlayerId: input.playerId,
    id: q.id,
    name: q.name,
    description: q.description,
    status,
    selectionState,
    startDate: q.start_date,
    endDate: q.end_date,
    deadline: q.entry_deadline,
    course: q.course_name,
    rules: q.rules,
    numRounds: q.num_rounds,
    squad: q.selection_slots_total,
    picks: q.selection_slots_coach_pick,
    entrants: entrants.length,
    board,
    entriesError: entries.error,
    roundsError: rounds.error,
    holes,
    holesError,
    roundCourses,
    par: coursesRes.error || teesError ? null : pars.single,
    coursesError: !!coursesRes.error || teesError,
    selections,
    selectionsError: !!selRes.error,
  };
}

const EMPTY_FORM: ChQFormValues = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  entryDeadline: '',
  rounds: '3',
  oneRoundAck: false,
  course: '',
  rules: '',
  squad: '5',
  picks: '1',
  playerIds: [],
};

/**
 * The create and edit form. Create: the active roster, every player ticked.
 * Edit: the qualifier's values, its round courses and entrants, with players
 * who have a round in it locked in. Returns null when editing a qualifier that
 * isn't on this team.
 */
export async function loadQualifierForm(input: { teamId: string; qualifierId: string | null }): Promise<ChQFormData | null> {
  const supabase = await createClient();
  const now = new Date();
  const rosterRes = await supabase
    .from('golf_team_members')
    .select('player:golf_players(id, first_name, last_name, graduation_year)')
    .eq('team_id', input.teamId)
    .eq('status', 'active');
  if (rosterRes.error) chLogServer('qualifiers', 'roster', rosterRes.error, 'qualifiers');
  const roster = ((rosterRes.data ?? []) as Array<{ player: PlayerCols | null }>).map((m) => m.player).filter((p): p is PlayerCols => !!p);
  const byLast = (a: { name: string }, b: { name: string }) => (a.name.split(' ').slice(-1)[0] ?? '').localeCompare(b.name.split(' ').slice(-1)[0] ?? '') || a.name.localeCompare(b.name);

  if (!input.qualifierId) {
    const players = roster.map((p) => ({ id: p.id, name: fullName(p), classYear: classYearLabel(p.graduation_year, now), locked: false as const, inactive: false })).sort(byLast);
    return {
      mode: 'create',
      id: null,
      name: null,
      initial: { ...EMPTY_FORM, playerIds: players.map((p) => p.id) },
      roundCourses: [],
      players,
      playersError: !!rosterRes.error,
      coursesError: false,
      squadLocked: false,
      minRounds: 1,
    };
  }

  const qRes = await supabase.from('golf_qualifiers').select(`${Q_COLUMNS}, team_id`).eq('id', input.qualifierId).maybeSingle();
  if (qRes.error) {
    chLogServer('qualifiers', 'qualifier', qRes.error, 'qualifiers');
    throw new Error('Clubhouse: the qualifier read failed');
  }
  const q = qRes.data as (QRow & { team_id: string }) | null;
  // A test qualifier is hidden from the list, so a link to one is "not found" too (swap audit §11 reconciliation).
  if (!q || q.team_id !== input.teamId || q.is_test) return null;

  const [entries, usedRes, placedRes, coursesRes] = await Promise.all([
    readEntries(supabase, [q.id], 'qualifiers'),
    // Any round counts, started or not: an entrant with one can't be removed (setQualifierEntrants), and its slot can't be cut.
    supabase.from('golf_rounds').select('player_id, qualifier_round_number').eq('qualifier_id', q.id).limit(1000),
    // So does a selection row, confirmed or not (setQualifierEntrants refuses both).
    supabase.from('golf_qualifier_selections').select('player_id').eq('qualifier_id', q.id),
    supabase.from('golf_qualifier_round_courses').select('round_number, course_id, course_name, tee_id').eq('qualifier_id', q.id).order('round_number', { ascending: true }),
  ]);
  if (usedRes.error) chLogServer('qualifiers', 'usedRounds', usedRes.error, 'qualifiers');
  if (placedRes.error) chLogServer('qualifiers', 'placed', placedRes.error, 'qualifiers');
  if (coursesRes.error) chLogServer('qualifiers', 'roundCourses', coursesRes.error, 'qualifiers');
  const courseRows = (coursesRes.data ?? []) as Array<{ round_number: number; course_id: string | null; course_name: string | null; tee_id: string | null }>;
  const teeIds = [...new Set(courseRows.map((c) => c.tee_id).filter((t): t is string => !!t))];
  let tees = new Map<string, { tee_name: string; total_par: number | null }>();
  let teesError = false;
  if (teeIds.length) {
    const teeRes = await supabase.from('golf_course_tees').select('id, tee_name, total_par').in('id', teeIds);
    if (teeRes.error) {
      chLogServer('qualifiers', 'tees', teeRes.error, 'qualifiers');
      teesError = true;
    } else tees = new Map((teeRes.data ?? []).map((t) => [t.id, { tee_name: t.tee_name, total_par: t.total_par }]));
  }

  const used = (usedRes.data ?? []) as Array<{ player_id: string; qualifier_round_number: number | null }>;
  const roundIds = new Set(used.map((u) => u.player_id));
  const placedIds = new Set(((placedRes.data ?? []) as Array<{ player_id: string }>).map((r) => r.player_id));
  const lockOf = (id: string): ChQFormPlayer['locked'] => (roundIds.has(id) ? 'round' : placedIds.has(id) ? 'squad' : false);
  const entered = entries.rows.filter((e) => e.player).map((e) => e.player as PlayerCols);
  const rosterIds = new Set(roster.map((p) => p.id));
  const players: ChQFormPlayer[] = [
    ...roster,
    ...entered.filter((p) => !rosterIds.has(p.id)),
  ]
    .map((p) => ({ id: p.id, name: fullName(p), classYear: classYearLabel(p.graduation_year, now), locked: lockOf(p.id), inactive: !rosterIds.has(p.id) }))
    .sort(byLast);

  return {
    mode: 'edit',
    id: q.id,
    name: q.name,
    initial: {
      name: q.name,
      description: q.description ?? '',
      startDate: q.start_date,
      endDate: q.end_date ?? '',
      entryDeadline: q.entry_deadline ?? '',
      rounds: String(q.num_rounds),
      oneRoundAck: q.num_rounds === 1,
      course: q.course_name ?? '',
      rules: q.rules ?? '',
      squad: String(q.selection_slots_total),
      picks: String(q.selection_slots_coach_pick),
      playerIds: entered.map((p) => p.id),
    },
    roundCourses: courseRows.map((c) => ({
      number: c.round_number,
      courseId: c.course_id,
      courseName: c.course_name,
      teeId: c.tee_id,
      teeName: c.tee_id ? (tees.get(c.tee_id)?.tee_name ?? null) : null,
      par: c.tee_id ? (tees.get(c.tee_id)?.total_par ?? null) : null,
    })),
    players,
    // Without the entrants, the rounds already played or the squad places, a save could drop a player or cut a scored round.
    playersError: !!rosterRes.error || entries.error || !!usedRes.error || !!placedRes.error,
    coursesError: !!coursesRes.error || teesError,
    squadLocked: parseSelectionState(q.selection_state) === 'selected',
    minRounds: Math.max(1, ...used.map((u) => u.qualifier_round_number ?? 1)),
  };
}

// ── Selection (Manage selections) ──

export interface ChQCandidate {
  playerId: string;
  name: string;
  /** The server's standing (to par, then total strokes); null with no score in. */
  rank: number | null;
  toPar: number | null;
  total: number | null;
  rounds: number;
  /** Inside the places decided on score, so set by the standings when the squad is confirmed. */
  onScore: boolean;
  /** A coach's pick, with the reason given. */
  pick: { reasoning: string | null } | null;
  /** On the confirmed squad (on score or a pick). */
  selected: boolean;
  /** Level with the last place on score and the player after it: the coach gives the places left (Q-114). */
  tiedAtCut?: boolean;
}

export interface ChQSelectionData {
  id: string;
  name: string;
  status: ChQStatus;
  selectionState: ChQSelectionState;
  squad: number;
  picks: number;
  candidates: ChQCandidate[];
  /** A tie at the last place on score (Q-114): places to give among the level players, and how many are given. */
  tie?: { places: number; chosen: number } | null;
}

export type ChQSelectionLoad = { kind: 'ok'; data: ChQSelectionData } | { kind: 'missing' } | { kind: 'error' };

/**
 * Manage selections for one qualifier, coach only. It reads through the same
 * loader the server actions use when they confirm the squad
 * (`loadQualifyingWorkspace`), so the squad shown is the squad committed. A
 * failed read is told apart from a qualifier that isn't on the team.
 */
export async function loadQualifierSelection(input: { teamId: string; qualifierId: string }): Promise<ChQSelectionLoad> {
  const supabase = await createClient();
  const own = await supabase.from('golf_qualifiers').select('id, team_id').eq('id', input.qualifierId).maybeSingle();
  if (own.error) {
    chLogServer('qualifiers', 'selection', own.error, 'qualifiers');
    return { kind: 'error' };
  }
  if (!own.data || own.data.team_id !== input.teamId) return { kind: 'missing' };
  let ws: QualifyingWorkspace | null;
  try {
    ws = await loadQualifyingWorkspace(supabase, input.qualifierId);
  } catch (err) {
    chLogServer('qualifiers', 'selection', err, 'qualifiers');
    return { kind: 'error' };
  }
  if (!ws) {
    // The qualifier was just read, so a null workspace is a failed read, not a missing qualifier.
    chLogServer('qualifiers', 'selection', new Error('the selection workspace did not load'), 'qualifiers');
    return { kind: 'error' };
  }
  const state = parseSelectionState(ws.selection_state);
  return {
    kind: 'ok',
    data: {
      id: ws.qualifier_id,
      name: ws.name,
      status: parseStatus(ws.status),
      selectionState: state,
      squad: ws.selection_slots_total,
      picks: ws.selection_slots_coach_pick,
      candidates: ws.candidates.map((c) => ({
        playerId: c.player_id,
        name: fullName({ first_name: c.player_first_name, last_name: c.player_last_name }),
        rank: c.leaderboard_rank,
        toPar: c.total_to_par,
        total: c.total_score,
        rounds: c.rounds_completed,
        onScore: c.is_top_score_slot,
        pick: c.selection?.selection_type === 'coach_pick' ? { reasoning: c.selection.coach_reasoning } : null,
        selected: state === 'selected' && c.selection != null,
        tiedAtCut: !!c.tied_at_cut,
      })),
      tie: ws.tie_at_cut,
    },
  };
}
