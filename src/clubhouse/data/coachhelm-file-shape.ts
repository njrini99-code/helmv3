import { partsWith } from '../lib/dates';
import { pluralWord } from '../lib/plural';
import type { ChProposal } from './coachhelm-shape';
import { FIELD_DAY_LABEL, type FieldDayEntry } from '@/lib/coachhelm/v3/field-day/field';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { NARRATIVE_GOAL_PRESENTATION, type AlertPosture, type NarrativeGoal } from '@/lib/coachhelm/v3/intent/types';
import type { ChDeepInsight, ChDiveCleared } from './coachhelm-dive-shape';
import type { ChLadder } from './coachhelm-ladder-shape';
import type { ChCoachPlayerHead } from './coachhelm-views-shape';
import type { ChHelmLifecycle } from './coachhelm-shape';
import { formatSigned, formatFixed } from '../lib/format';
import { plural } from '../lib/plural';
import type { ChFigures, ChLegKey } from './figure-window';
import type { ChSgMix } from './stats-sg-mix';

/** The file's shapes, pure and client-safe (coachhelm-lenses 02-PLAN 2.3). A coach-only card is simply absent from every shape built for a player or the lens. */

export type ChFileStage = 'none' | 'suggested' | 'shown' | 'accepted' | 'declined';

export interface ChFileSgRow {
  id: string;
  label: string;
  /** Strokes a round against the Tour, as stored; null with nothing measured. */
  strokes: number | null;
  /** "−0.91", or "—". */
  figure: string;
  tone: 'gain' | 'loss' | 'none';
  /** The team's average on this leg, only with a team of five or more. */
  team: number | null;
}

export interface ChFileSg {
  rows: ChFileSgRow[];
  hasTeam: boolean;
  /** "Against the Tour, off the tee costs Eli 0.9 a round; against the team, 0.7." */
  note: string | null;
  /** "Last 10 rounds · strokes per round": the rounds the figures read. */
  source: string;
  /** The Standing page's own window ("All time", "This season"), said on the link to it: its legs are that window's, not these. */
  standing?: string | null;
  /** Totals-only rounds: every row is "—" and the note says why. */
  needsHoles: boolean;
  /** Of the rounds the legs read, how many were shot-tracked and how many estimated from the scorecard (stats-sg-mix.ts); null or absent when unread. */
  mix?: ChSgMix | null;
}

/**
 * The card from the Standing ladder's rows (`golf_player_standing`, a season or all time). The loaders no longer call this: the file
 * reads `toChFileSgOver`, the rounds' own figures, so its legs are the hole's and Stats'. Kept for the Standing-sourced fixtures and tests.
 */
export function toChFileSg(ladder: ChLadder, rows: readonly PlayerStanding[], who: { you: boolean; first: string }, source: { window: string; rounds: number | null }): ChFileSg {
  const metric: Record<string, string> = { tee: 'sg_ott', approach: 'sg_approach', short_game: 'sg_around_green', putting: 'sg_putting' };
  const byMetric = new Map(rows.map((r) => [r.metric_id as string, r]));
  const out: ChFileSgRow[] = ladder.rows.map((r) => {
    const st = byMetric.get(metric[r.id] ?? '');
    const strokes = st ? st.player_value : null;
    const value = r.strokes == null ? null : strokes;
    return {
      id: r.id,
      label: r.label,
      strokes: value,
      figure: r.strokes ?? '—',
      tone: value == null || r.sense == null || r.sense === 'level' ? 'none' : r.sense,
      team: st && st.team_n >= 5 && st.team_avg != null ? st.team_avg : null,
    };
  });
  const known = out.filter((r) => r.strokes != null);
  const worst = known.length ? known.reduce((a, b) => ((b.strokes as number) < (a.strokes as number) ? b : a)) : null;
  const costs = (v: number) => formatFixed(Math.abs(v), 1);
  const whom = who.you ? 'you' : who.first;
  let note: string | null = null;
  if (worst && (worst.strokes as number) < 0) {
    note = `Against the Tour, ${worst.label.toLowerCase()} costs ${whom} ${costs(worst.strokes as number)} a round`;
    note += worst.team != null ? `; against the team, ${costs((worst.strokes as number) - worst.team)}.` : '.';
  }
  return {
    rows: out,
    hasTeam: out.some((r) => r.team != null),
    note,
    source: `${source.window}${source.rounds != null ? ` · ${source.rounds} rounds` : ''} · strokes per round`,
    needsHoles: known.length === 0,
  };
}

/** The team's tick on the file needs this many players at the strokes-gained floor (S-FILE 14, 02 13.11). */
export const FILE_TEAM_FLOOR = 5;

const FILE_LEGS: ReadonlyArray<{ id: string; label: string; key: ChLegKey }> = [
  { id: 'tee', label: 'Off the tee', key: 'tee' },
  { id: 'approach', label: 'Approach', key: 'approach' },
  { id: 'short_game', label: 'Around the green', key: 'around' },
  { id: 'putting', label: 'Putting', key: 'putting' },
];

/** The window line under the card: the rounds the figures really read, so it can never be taken for another screen's window. */
export function fileSgSource(fig: Pick<ChFigures, 'rounds' | 'holeRounds'>): string {
  if (fig.rounds === 0) return 'No counted rounds yet · strokes per round';
  const window = fig.rounds >= 10 ? 'Last 10 rounds' : `Last ${plural(fig.rounds, 'round')}`;
  return `${window}${fig.holeRounds < fig.rounds ? ` · ${fig.holeRounds} with hole scores` : ''} · strokes per round`;
}

/**
 * "Where the strokes go" from the one strokes-gained source (owner rule: one number, one source). `fig` is `playerStrokesGained` over
 * the player's rounds: their newest ten counted 18-hole rounds, which CoachHelm Team, Home, the roster and Stats' default all read, so
 * a leg here is the leg on the hole and in Stats on Last 10, to the decimal. `team` is `teamStrokesGained` over the roster's same
 * window, drawn only with five players at the floor; null for a player's own page, which never carries a figure built from teammates'
 * rounds. Figures print to one decimal, as the hole and Stats print them.
 */
export function toChFileSgOver(fig: ChFigures, team: { legs: ReadonlyArray<number | null>; ready: { size: number } } | null, who: { you: boolean; first: string }): ChFileSg {
  const teamLegs = team && team.ready.size >= FILE_TEAM_FLOOR ? team.legs : null;
  const out: ChFileSgRow[] = FILE_LEGS.map((a, i) => {
    const value = fig.legs[a.key];
    const printed = value == null ? 0 : Number(value.toFixed(1));
    return { id: a.id, label: a.label, strokes: value, figure: value == null ? '—' : formatSigned(value), tone: value == null || printed === 0 ? 'none' : printed > 0 ? 'gain' : 'loss', team: value == null ? null : (teamLegs?.[i] ?? null) };
  });
  const known = out.filter((r) => r.strokes != null);
  const worst = known.length ? known.reduce((x, y) => ((y.strokes as number) < (x.strokes as number) ? y : x)) : null;
  const costs = (v: number) => formatFixed(Math.abs(v), 1);
  let note: string | null = null;
  if (worst && Number((worst.strokes as number).toFixed(1)) < 0) {
    note = `Against the Tour, ${worst.label.toLowerCase()} costs ${who.you ? 'you' : who.first} ${costs(worst.strokes as number)} a round`;
    // "Against the team" only when the player is behind the team there, and by a figure that prints.
    const gap = worst.team == null ? null : (worst.strokes as number) - worst.team;
    note += gap != null && Number(gap.toFixed(1)) < 0 ? `; against the team, ${costs(gap)}.` : '.';
  }
  return { rows: out, hasTeam: out.some((r) => r.team != null), note, source: fileSgSource(fig), needsHoles: known.length === 0 };
}

/** The team's figure for one metric, with its floor (S-FILE 14): null below five. */
export function teamFigureOf(rows: readonly PlayerStanding[], metric: string): number | null {
  const r = rows.find((x) => (x.metric_id as string) === metric);
  return r && r.team_n >= 5 && r.team_avg != null ? r.team_avg : null;
}

export interface ChFileHandshake {
  suggested: string | null;
  /** The date, 'unknown' with no source read (a dash, never a tick), or null when not yet. */
  shown: string | 'unknown' | null;
  accepted: string | null;
  declined: string | null;
}

export interface ChFileGoal {
  title: string;
  line: string;
  word: 'Improved' | 'No change' | 'Worse' | null;
  target: number | null;
  points: Array<{ label: string; value: number }>;
  /** The newest check-in is on the wrong side of the goal. */
  worse: boolean;
}

export interface ChFilePlan {
  stage: ChFileStage;
  focusId: string | null;
  title: string | null;
  fromInsight: string | null;
  since: string | null;
  handshake: ChFileHandshake;
  goal: ChFileGoal | null;
  practice: { drill: string | null; count: number } | null;
  coach: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 5", in the team's zone. */
export function fileDay(iso: string | null | undefined, zone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partsWith(d, { month: 'numeric', day: 'numeric', timeZone: iso.length === 10 ? 'UTC' : zone });
  const m = Number(p.find((x) => x.type === 'month')?.value ?? 1);
  return `${MONTHS[m - 1]} ${p.find((x) => x.type === 'day')?.value}`;
}

export interface ChFocusRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  started_at: string | null;
  updated_at?: string | null;
  from_insight_id: string | null;
}

export function stageOf(row: ChFocusRow | null, shown: string | 'unknown' | null): ChFileStage {
  if (!row) return 'none';
  if (row.status === 'declined') return 'declined';
  if (row.status === 'proposed') return shown && shown !== 'unknown' ? 'shown' : 'suggested';
  return 'accepted';
}

export function toChFilePlan(row: ChFocusRow | null, shownAt: string | null, goal: Goal | null, practice: ChFilePlan['practice'], coach: string, zone: string): ChFilePlan {
  const shown: string | 'unknown' | null = !row ? null : !row.from_insight_id ? 'unknown' : fileDay(shownAt, zone);
  const stage = stageOf(row, shownAt ?? (row && !row.from_insight_id ? 'unknown' : null));
  const handshake: ChFileHandshake = {
    suggested: fileDay(row?.created_at, zone),
    shown,
    accepted: stage === 'accepted' ? fileDay(row?.started_at ?? row?.created_at, zone) : null,
    declined: stage === 'declined' ? fileDay(row?.updated_at ?? row?.created_at, zone) : null,
  };
  return { stage, focusId: row?.id ?? null, title: row?.title ?? null, fromInsight: row?.from_insight_id ?? null, since: handshake.accepted, handshake, goal: goal && stage === 'accepted' ? toFileGoal(goal, row, zone) : null, practice: stage === 'accepted' ? practice : null, coach };
}

function toFileGoal(g: Goal, row: ChFocusRow | null, zone: string): ChFileGoal {
  const from = row?.started_at?.slice(0, 10) ?? '';
  const points = (g.snapshots ?? [])
    .filter((s) => s.date.slice(0, 10) >= from)
    .map((s) => ({ label: fileDay(s.date, zone) ?? '', value: s.value }));
  const last = points[points.length - 1]?.value ?? null;
  const base = g.baseline_value;
  const target = g.target_value;
  const lowerBetter = target != null && base != null ? target < base : true;
  const worse = last != null && target != null ? (lowerBetter ? last > target : last < target) : false;
  const word = last == null || base == null ? null : last === base ? 'No change' : (lowerBetter ? last < base : last > base) ? 'Improved' : 'Worse';
  return { title: g.title, line: `${points.length} check-in${pluralWord(points.length, '', 's')}`, word, target, points, worse };
}

export interface ChFileField {
  /** "Better than the field", "Level with the field", "Behind the field". */
  head: string;
  band: 'better' | 'level' | 'behind';
  /** "−2.4". */
  figure: string;
  sentence: string;
  /** Other players' per-18 values: coach only, values only. Null for a player and the lens at every size (SHARED-11). */
  dots: number[] | null;
  me: number;
  mean: number;
  /** Ends of the strip, whole strokes, at least twelve wide. */
  scale: [number, number];
  /** "Oct 26 · Pinehurst No. 2". */
  meta: string;
  caption: string;
  label: string;
}

export const FIELD_PLAYER_FLOOR = 5;

const signedOne = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatFixed(Math.abs(v), 1)}`;

/** Numbers straight from `FieldDayEntry`: the mean and relative include the player, and the copy says so. No card for a player under five: the mean would give away teammates' sum (02 13.3). */
export function toChFileField(entry: FieldDayEntry | null, others: readonly number[], view: { role: 'coach'; first: string } | { role: 'player'; first?: string }, round: { date: string; course: string | null; score: number | null }, zone: string): ChFileField | null {
  if (!entry) return null;
  if (view.role === 'player' && entry.field_n < FIELD_PLAYER_FLOOR) return null;
  const me = entry.field_mean + entry.relative;
  const band = entry.relative <= -1 ? 'better' : entry.relative >= 1 ? 'behind' : 'level';
  const head = band === 'better' ? 'Better than the field' : band === 'behind' ? 'Behind the field' : 'Level with the field';
  const mates = entry.field_n - 1;
  const who = view.role === 'coach' ? view.first : 'you';
  const shot = view.role === 'coach' ? `${view.first} shot` : 'You shot';
  const sentence = `${shot}${round.score != null ? ` ${round.score}` : ` ${signedOne(me)}`}. ${mates} ${pluralWord(mates, 'teammate', 'teammates')} played; the field, ${who} included, averaged ${signedOne(entry.field_mean)}.`;
  const vals = [me, entry.field_mean, ...(view.role === 'coach' ? others : [])];
  let lo = Math.floor(Math.min(...vals));
  let hi = Math.ceil(Math.max(...vals));
  if (hi - lo < 12) {
    const pad = 12 - (hi - lo);
    lo -= Math.floor(pad / 2);
    hi += Math.ceil(pad / 2);
  }
  return {
    head,
    band,
    figure: signedOne(entry.relative),
    sentence,
    dots: view.role === 'coach' ? [...others].sort((a, b) => a - b) : null,
    me,
    mean: entry.field_mean,
    scale: [lo, hi],
    meta: [fileDay(round.date, zone), round.course].filter(Boolean).join(' · '),
    caption: `${view.role === 'coach' ? view.first : 'You'} ${signedOne(me)} · field ${signedOne(entry.field_mean)}`,
    label: FIELD_DAY_LABEL,
  };
}

export const FILE_AIMS: ReadonlyArray<{ id: NarrativeGoal; label: string }> = (['breakout', 'develop', 'maintain', 'bubble', 'rehabilitate'] as const).map((id) => ({ id, label: NARRATIVE_GOAL_PRESENTATION[id].label }));
export const FILE_ALERTS: ReadonlyArray<{ id: AlertPosture; label: string }> = [
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'conservative', label: 'Conservative' },
  { id: 'silent', label: 'Silent' },
];
export const FILE_AREAS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'tee', label: 'Off the tee' },
  { id: 'approach', label: 'Approach' },
  { id: 'short_game', label: 'Around the green' },
  { id: 'putting', label: 'Putting' },
  { id: 'course_management', label: 'Course management' },
];

export interface ChFileIntent {
  aim: NarrativeGoal;
  alerts: AlertPosture;
  watching: string[];
  note: string | null;
}

export const fileAimLabel = (id: string) => FILE_AIMS.find((a) => a.id === id)?.label ?? id;
export const fileAlertLabel = (id: string) => FILE_ALERTS.find((a) => a.id === id)?.label ?? id;
export const fileAreaLabel = (id: string) => FILE_AREAS.find((a) => a.id === id)?.label ?? id;

export interface ChFileTrackRow {
  id: string;
  title: string;
  word: 'Improved' | 'No change' | 'Got worse' | null;
  meta: string;
}

export interface ChFileTrack {
  assigned: number;
  improved: number;
  noChange: number;
  /** Assigned with no measured outcome yet. */
  open: number;
  rows: ChFileTrackRow[];
}

const OUTCOME: Record<string, ChFileTrackRow['word']> = { improved: 'Improved', no_change: 'No change', worsened: 'Got worse' };

/** Counts, and one row per measured focus. A delta only at three rounds after; nothing measured is "Not measured yet" on the card, never a zero that reads as a failure. */
export function toChFileTrack(rows: ReadonlyArray<{ id: string; title: string; outcome_status: string | null; completed_at: string | null; from_insight_id: string | null }>, attribution: ReadonlyArray<{ insight_id: string; baseline_value: number; post_value: number; n_rounds_after: number }>, zone: string): ChFileTrack {
  const byInsight = new Map(attribution.filter((a) => a.n_rounds_after >= 3).map((a) => [a.insight_id, a]));
  const out: ChFileTrackRow[] = [];
  let improved = 0;
  let noChange = 0;
  for (const r of rows) {
    const word = OUTCOME[r.outcome_status ?? ''] ?? null;
    if (word === 'Improved') improved++;
    if (word === 'No change') noChange++;
    if (!word) continue;
    const a = r.from_insight_id ? byInsight.get(r.from_insight_id) : undefined;
    const delta = a ? `${formatSigned(a.baseline_value).replace('+', '')} to ${formatSigned(a.post_value).replace('+', '')}` : null;
    out.push({ id: r.id, title: r.title, word, meta: [delta, fileDay(r.completed_at, zone)].filter(Boolean).join(' · ') });
  }
  return { assigned: rows.length, improved, noChange, open: rows.length - out.length, rows: out };
}

export interface ChFileDismissed {
  id: string;
  title: string;
  lifecycle: ChHelmLifecycle;
}

export interface ChFileCards {
  feat: ChDeepInsight | null;
  /** Team on the top read's own metric; null below five. */
  featTeam: number | null;
  /**
   * Where `featTeam` comes from when the read carries no team figure of its own: the standing rows' window ("all time", or "this
   * season" once the season table is used). The Team cell says it, so it is never read as Team stats' window figure.
   */
  featTeamBasis?: string | null;
  reads: ChDeepInsight[];
  cleared: ChDiveCleared[];
  dismissed: ChFileDismissed[];
  working: ChDeepInsight[];
  /** Reads past the Board's caps, for the player's card note. */
  more: number;
  sg: ChFileSg | null;
  plan: ChFilePlan | null;
  field: ChFileField | null;
  intent?: ChFileIntent | null;
  track?: ChFileTrack | null;
}

export interface ChFileRosterRow {
  id: string;
  name: string;
  first: string;
  line: string;
}

export interface ChPlayerFile {
  head: ChCoachPlayerHead;
  cards: ChFileCards;
  /** "As {first} sees it", sent with the page so the toggle needs no request. Absent when the file failed. */
  lens: ChFileCards | null;
  failed: { reads?: true; sg?: true; plan?: true; field?: true; intent?: true; track?: true };
  /** Rounds that count, and how many more until reads start. */
  rounds: number | null;
  roundsToGo: number | null;
  /** Whether the Read page and the team pool are on (server-only flags). */
  readOn: boolean;
  /** Last 8 countable rounds' penalties, oldest first. */
  penalties: Array<{ label: string; value: number }> | null;
}

/** The player's own CoachHelm with the flag on (S-BOARD). No coach-only card, nobody else's name. */
export interface ChPlayerWeek {
  cards: ChFileCards;
  proposals: { list: ChProposal[]; error: boolean };
  rounds: number | null;
  roundsToGo: number | null;
  readOn: boolean;
  penalties: Array<{ label: string; value: number }> | null;
  refreshed: string | null;
  failed: { sg?: true; field?: true };
}

/** The player's words on the feature card, by stage (06 12.1). */
export function playerKicker(stage: ChFileStage, coach: string): string {
  if (stage === 'accepted') return 'Your focus';
  if (stage === 'suggested' || stage === 'shown') return `${coach} suggests this as your focus`;
  return 'Top of your list';
}

export const FILE_SIGN = (v: number) => (v > 0 ? `+${formatFixed(Math.abs(v), 1)}` : v < 0 ? `−${formatFixed(Math.abs(v), 1)}` : formatFixed(Math.abs(v), 1));
