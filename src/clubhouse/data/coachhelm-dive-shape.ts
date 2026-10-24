import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { fmtShortDate } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import type { InsightEvidence, InsightMovement, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import { isPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import { isNotTracedCause } from '@/lib/coachhelm/reads/cause-state';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { shortDate } from '@/lib/coachhelm/v3/lifecycle/delivery-shape';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { AssembledThemes, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { formatFixed, formatSG, formatToPar } from '../lib/format';
import { diffSe, halvesTone, POOLED_SD, standardError } from '../lib/stats-signal';
import { rebuiltHref } from '../shell/nav';
import { formatComparison } from './coachhelm-map';
import { toChRead, type ChRead } from './coachhelm-read-shape';
import type { ChViewer } from './coachhelm-voice';
import { stanceOf, type ChBoardMissing, type ChInsight, type ChStance } from './coachhelm-shape';
import { figure } from './coachhelm-standing-shape';
import { plural } from '../lib/plural';

/**
 * The player's Deep dive (Clubhouse P013, `?view=deep-dive`): every insight the Board draws, in full. Each one shows what was
 * measured, the evidence, the rounds behind it, how it has moved, why CoachHelm thinks so, and the focus area or goal it belongs to.
 * The insights are the Board's own (`getInsightsForPlayer`, the same ranking, dedupe, visibility and mapping); nothing here
 * invents a number. Pure, so the loader, the preview and the tests run this one function.
 *
 * Doctrine carried over from the Board: Working (a strength) against needs work (a finding), the confidence words of
 * `lib/coachhelm/confidence-label.ts`, a card that states no finding is not drawn, a read from before the newest round is marked
 * out of date, and no coach control is ever drawn for a player.
 */

/** The most rounds listed under one insight (the newest); the count of the rest is said. */
export const DIVE_ROUNDS_SHOWN = 8;
/** The ids read per insight: a little over what is listed, so a few unreadable rounds do not leave the list short. */
export const DIVE_ROUNDS_READ = 12;

export type ChDiveTone = 'good' | 'warn' | 'plain';

export interface ChDiveRound {
  id: string;
  /** "Sep 28". */
  date: string;
  course: string | null;
  /** "74", or a dash for a round posted with no total. */
  score: string;
  /** "+2", "−1", "E"; null with no score to par. */
  toPar: string | null;
  /** To par on an 18-hole basis, for the strip; null with no score to par. */
  toPar18: number | null;
  nine: boolean;
  /** The round's review, while that screen is rebuilt for a player. */
  href: string | null;
}

export interface ChDiveRounds {
  /** How many rounds the read says it was made from (`source_round_ids`); 0 when it lists none. */
  total: number;
  /** The newest, newest first, up to `DIVE_ROUNDS_SHOWN`; only rounds this player has and that could be read. */
  list: ChDiveRound[];
  /** To par per 18 holes, oldest to newest, for the strip under the list; empty under three rounds. */
  strip: number[];
}

export interface ChDiveMovement {
  /** "From 31% to 23%, down 8 pts": the change in the stat's own unit (points for a share), never a percent of a percent. */
  text: string;
  tone: ChDiveTone;
}

export interface ChDiveOutcome {
  word: 'Improved' | 'No change' | 'Got worse';
  tone: ChDiveTone;
  /** "Sep 28": when it was measured. */
  when: string | null;
}

export interface ChDiveDriver {
  label: string;
  value: string;
  /** What it counted ("n 31"), when the generator said. */
  n: number | null;
}

export interface ChDiveDiagnosis {
  /** The cause, as the generator wrote it. */
  cause: string;
  /** `observed`: seen in a shot sequence. `hypothesis`: inferred from standings, never to be read as fact. */
  level: 'observed' | 'hypothesis';
  drivers: ChDiveDriver[];
  /** Why the confidence is what it is. */
  reason: string | null;
}

export interface ChDivePlan {
  focus: { id: string; title: string; word: string; live: boolean; fromThis: boolean } | null;
  goal: { id: string; title: string; word: string; line: string | null; fromThis: boolean } | null;
}

/** A category's own read (`getThemesForPlayer`): where it stands and, with enough rounds, which way it is moving. */
export interface ChDiveTheme {
  label: string;
  state: 'leak' | 'strength' | 'thin';
  /** Strokes gained per round in the category, when known ("−0.42"). */
  sg: string | null;
  trend: { word: 'Improving' | 'Slipping' | 'No clear change'; tone: ChDiveTone; text: string } | null;
}

/**
 * The five areas the ledger groups reads by (design call §4 "Taxonomy"), in the order a hole is played. Every generator category
 * has a home: pressure, course management, scoring and anything new are Course and scoring.
 */
export type ChDiveArea = 'tee' | 'approach' | 'around' | 'putting' | 'scoring';
export const DIVE_AREAS: ReadonlyArray<{ id: ChDiveArea; label: string }> = [
  { id: 'tee', label: 'Off the tee' },
  { id: 'approach', label: 'Approach' },
  { id: 'around', label: 'Around the green' },
  { id: 'putting', label: 'Putting' },
  { id: 'scoring', label: 'Course and scoring' },
];
const AREA_OF: Record<string, ChDiveArea> = { tee: 'tee', approach: 'approach', short_game: 'around', putting: 'putting' };
/** The ledger area a generator category files under. */
export const areaOf = (category: string | null | undefined): ChDiveArea => AREA_OF[category ?? ''] ?? 'scoring';

/** The most cleared reads the ledger shows before it says "N more cleared" (design call §4 "Ranking and limits"). */
export const DIVE_CLEARED_SHOWN = 3;

/**
 * A read the recheck found cleared, kept in its area as one line (D6): "Cleared Oct 12", what it was about, and the recheck's own
 * numbers. It has no dossier: it left the open list.
 */
export interface ChDiveCleared {
  id: string;
  area: ChDiveArea;
  /** "4–6 ft putts": the read's own metric label, else its title. */
  title: string;
  /** "Cleared Oct 12", or "Cleared" when the recheck stored no date. */
  word: string;
  /** The rest of the recheck's line in the viewer's voice ("22 of your last 29 (76%). That one's fixed. …"). */
  line: string;
  /** When the recheck ran (ISO), for picking the newest to show; null when unknown. */
  at: string | null;
}

/** One hole a counted path was recorded on (chs-38): the round's day and course, the hole, and the path in shot-type words. */
export interface ChDiveHole {
  key: string;
  /** "Sep 28". */
  date: string;
  course: string | null;
  hole: number;
  /** "approach missed → chip to 3–6 ft → 1 putt": the counted path, as the engine stored it. */
  what: string;
  /** The round's review, while that screen is rebuilt for a player. */
  href: string | null;
}

/** Where it happened: the example holes a counted sequence stored, only the ones whose round this player still has. */
export interface ChDiveWhere {
  /** "5 of 7 penalties": how often the path was counted, when the sequence says. */
  counted: string | null;
  holes: ChDiveHole[];
}

export interface ChDeepInsight {
  /** The Board's own card: title, lede, why, evidence (gauge or bars, sample, window, read, as-of), the week's drill and the stance. */
  base: ChInsight;
  /** The generator's category key ("putting"), which the category reads are keyed by. */
  cat: string;
  /** The pill: Priority, Worth closing, Minor, Working, Out of date, Assigned. */
  stance: ChStance;
  measured: {
    /** "Downhill penalty vs level putts (distance-controlled)". */
    label: string;
    /** The generator's display of the headline number. */
    value: string;
    /** "Jul 5 to Oct 3", or "All rounds"; null when the row says neither. */
    span: string | null;
  };
  diagnosis: ChDiveDiagnosis | null;
  movement: ChDiveMovement | null;
  outcome: ChDiveOutcome | null;
  /**
   * What closing the gap is worth, strokes a round ("0.4"), and what it is closed to: the team's average, or the Tour when the
   * cascade had no team average to anchor on (it then carries the whole Tour gap). Null when the cascade carries none.
   */
  closes: { strokes: string; anchor: 'team' | 'tour' } | null;
  rounds: ChDiveRounds;
  plan: ChDivePlan;
  /** The read in four lines, What, Why, Next and When, from the fields above and the Board's card (`coachhelm-read-shape.ts`). */
  read: ChRead;
  /** The ledger area it is listed under. */
  area: ChDiveArea;
  /**
   * How firm the read is, as one word on its ledger row: the claim ladder's word when the support pass is on and the viewer may
   * see it (a coach; the player feed drops the ladder), else the confidence word (Solid, Early or Thin read). Null when neither.
   */
  firmness: string | null;
  /** The example holes behind a counted path (chs-38); null when the stored evidence carries none, and then nothing is drawn. */
  where: ChDiveWhere | null;
}

export interface ChDeepDive {
  list: ChDeepInsight[];
  /** The team's Tour, by name, for a gain closed to it ("LPGA Tour" for a women's team); the Tour without a team. */
  tour: 'Tour' | 'LPGA Tour';
  /** Countable rounds posted, read only when there is nothing to draw, so the empty page can say what to do; null when unknown. */
  rounds: number | null;
  /** The category reads, by category key; empty when they did not load (`themesFailed`). */
  themes: Record<string, ChDiveTheme>;
  /** Each part's own failure: the page draws the insights and says which part is missing, never an empty part. */
  roundsFailed: boolean;
  plansFailed: boolean;
  themesFailed: boolean;
  counts: { insights: number; needs: number; working: number; inPlan: number };
  /** What the reads were drawn without because a read beside them failed (the Tour's values, the drills, which are Assigned, which are out of date). */
  missing?: ChBoardMissing;
  /** Reads the recheck found cleared, each kept in its area (04 example 5, D6; `coachhelm_recheck_v1`). Absent with the flag off or none. */
  cleared?: ChDiveCleared[];
}

/** What the loader reads for the parts beside the insights. */
export interface ChDiveInputs {
  rounds: ReadonlyMap<string, DiveRoundRow>;
  focusAreas: readonly DiveFocusRow[];
  goals: readonly Goal[];
  themes: AssembledThemes | null;
}

export interface DiveRoundRow {
  id: string;
  round_date: string;
  course_name: string | null;
  total_score: number | null;
  score_to_par: number | null;
  holes_played: number | null;
}

export interface DiveFocusRow {
  id: string;
  title: string;
  status: string | null;
  from_insight_id: string | null;
  target_metric: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The source rounds a read names, newest first, to read: the ones listed and a few more, never every one of up to 200. */
export function roundIdsToRead(ev: Pick<InsightEvidence, 'source_round_ids'> | undefined): string[] {
  const ids = ev?.source_round_ids;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, DIVE_ROUNDS_READ) : [];
}

/** `role`: whose page lists the rounds; each links to that role's round review (the coach's, on a coach's page). */
function roundsFor(ev: InsightEvidence | undefined, byId: ReadonlyMap<string, DiveRoundRow>, role: ChViewer['role'] = 'player'): ChDiveRounds {
  const named = Array.isArray(ev?.source_round_ids) ? (ev as InsightEvidence).source_round_ids!.filter((x): x is string => typeof x === 'string') : [];
  const found = roundIdsToRead(ev)
    .map((id) => byId.get(id))
    .filter((r): r is DiveRoundRow => !!r)
    .sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : 0));
  const list = found.slice(0, DIVE_ROUNDS_SHOWN).map((r): ChDiveRound => {
    const holes = num(r.holes_played) ?? 18;
    const toPar = num(r.score_to_par);
    return {
      id: r.id,
      date: fmtShortDate(r.round_date) ?? r.round_date.slice(0, 10),
      course: r.course_name?.trim() || null,
      score: num(r.total_score) != null ? String(r.total_score) : '—',
      toPar: toPar != null ? formatToPar(toPar) : null,
      toPar18: toPar != null && holes > 0 ? (toPar * 18) / holes : null,
      nine: holes <= 9,
      href: rebuiltHref(`/golf/dashboard/rounds/${r.id}`, role),
    };
  });
  const strip = [...list]
    .reverse()
    .map((r) => r.toPar18)
    .filter((v): v is number => v != null);
  return { total: named.length, list, strip: strip.length >= 3 ? strip : [] };
}

/** Whether a metric is better when its value is higher, from the generator's own polarity, else the registry's. */
function higherIsBetter(ev: InsightEvidence): boolean | null {
  const dir = ev.polarity ?? getMetricRenderConfig(ev.metric)?.direction;
  return dir === 'higher_better' ? true : dir === 'lower_better' ? false : null;
}

/** How far a stat moved, in its own unit: points for a share (never a percent of a percent), else the unit's own figure. Null when it rounds to no change. */
function movementChange(from: number, to: number, unit: InsightUnit): string | null {
  const pct = (v: number) => (Math.abs(v) <= 1 ? v * 100 : v);
  const gap = unit === 'percent' ? Math.abs(pct(to) - pct(from)) : Math.abs(to - from);
  const r = Number(gap.toFixed(unit === 'yards' || unit === 'feet' ? 0 : 1));
  if (r === 0) return null;
  switch (unit) {
    case 'percent':
      return `${r} pts`;
    case 'strokes':
      return `${plural(r, 'stroke')}`;
    case 'yards':
      return `${r} yd`;
    case 'feet':
      return `${r} ft`;
    default:
      return String(r);
  }
}

function movementFor(raw: EvidenceInsight): ChDiveMovement | null {
  const m: InsightMovement | undefined = raw.metadata?.movement;
  if (!m || num(m.from) == null || num(m.to) == null || (m.direction !== 'up' && m.direction !== 'down')) return null;
  const unit: InsightUnit = raw.evidence.unit;
  const change = movementChange(m.from, m.to, unit);
  if (!change) return null;
  const hi = higherIsBetter(raw.evidence);
  return { text: `From ${formatComparison(m.from, unit)} to ${formatComparison(m.to, unit)}, ${m.direction} ${change}`, tone: hi == null ? 'plain' : (m.direction === 'up') === hi ? 'good' : 'warn' };
}

const OUTCOME: Record<string, { word: ChDiveOutcome['word']; tone: ChDiveTone }> = {
  improved: { word: 'Improved', tone: 'good' },
  no_change: { word: 'No change', tone: 'plain' },
  worsened: { word: 'Got worse', tone: 'warn' },
};

function outcomeFor(raw: EvidenceInsight): ChDiveOutcome | null {
  const o = raw.outcome_status ? OUTCOME[raw.outcome_status] : undefined;
  return o ? { ...o, when: fmtShortDate(raw.outcome_measured_at ?? null) } : null;
}

function diagnosisFor(ev: InsightEvidence, say: (t: string) => string): ChDiveDiagnosis | null {
  const d = ev.diagnosis;
  const cause = d?.root_cause?.trim();
  if (!d || !cause) return null;
  // The generators' "off its benchmark, cause inferred from the aggregate" line states no cause: no diagnosis is drawn rather than a
  // box that says nothing (and its "sample adequate" reason and the driver the evidence block already shows).
  if (isPlaceholderCause(cause)) return null;
  // CoachHelm Slice 2 (root-cause flag): a counted sequence reads "observed" and a likely-from-totals cause "hypothesis"
  // (players never see it); a not-traced one is a count-down or a data gap, not a cause, so no "Likely" box is drawn for it.
  if (isNotTracedCause(ev)) return null;
  return {
    cause: say(cause),
    level: d.causality_level === 'observed_sequence' ? 'observed' : 'hypothesis',
    drivers: (d.drivers ?? [])
      .filter((x) => num(x.value) != null)
      .map((x) => ({
        label: x.label?.trim() || getMetricRenderConfig(x.metric)?.display_label || x.metric,
        value: formatComparison(x.value, x.unit),
        n: num(x.sample_n) && (x.sample_n as number) > 0 ? (x.sample_n as number) : null,
      })),
    reason: d.confidence_reason?.trim() ? say(d.confidence_reason.trim()) : null,
  };
}

const FOCUS_WORD: Record<string, string> = { proposed: 'Proposed to you', active: 'Active', in_progress: 'In progress', paused: 'Paused', completed: 'Completed' };
const FOCUS_LIVE = new Set(['proposed', 'active', 'in_progress', 'paused']);
const GOAL_WORD: Record<string, string> = { active: 'Active', achieved: 'Achieved' };

function goalLine(g: Goal): string | null {
  const cfg = getMetricRenderConfig(g.metric_id);
  if (!cfg) return null;
  const parts = [
    num(g.current_value) != null ? `Now ${figure(g.metric_id, cfg.unit, g.current_value as number)}` : null,
    num(g.target_value) != null ? `target ${figure(g.metric_id, cfg.unit, g.target_value as number)}` : null,
    g.state === 'active' && g.ends_at ? `by ${fmtShortDate(g.ends_at) ?? g.ends_at.slice(0, 10)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * The focus area and the goal an insight belongs to: the ones made from it first, else one on the same metric (a live focus area before a
 * finished one). `say`: a coach's page puts the focus word in their voice ("Proposed to Jonah"); the player's reads it as written.
 */
function planFor(raw: EvidenceInsight, focusAreas: readonly DiveFocusRow[], goals: readonly Goal[], say: (t: string) => string = (t) => t): ChDivePlan {
  const known = (f: DiveFocusRow) => !!f.status && f.status in FOCUS_WORD;
  const own = focusAreas.find((f) => f.from_insight_id === raw.id && known(f));
  const sameMetric = [...focusAreas].filter((f) => f.target_metric === raw.evidence.metric && known(f)).sort((a, b) => Number(FOCUS_LIVE.has(b.status!)) - Number(FOCUS_LIVE.has(a.status!)))[0];
  const focus = own ?? sameMetric ?? null;
  const ownGoal = goals.find((g) => g.origin_insight_id === raw.id);
  const goal = ownGoal ?? goals.find((g) => g.metric_id === raw.evidence.metric && g.state in GOAL_WORD) ?? null;
  return {
    focus: focus ? { id: focus.id, title: focus.title, word: say(FOCUS_WORD[focus.status!]!), live: FOCUS_LIVE.has(focus.status!), fromThis: focus === own } : null,
    goal: goal ? { id: goal.id, title: goal.title, word: GOAL_WORD[goal.state] ?? goal.state, line: goalLine(goal), fromThis: goal === ownGoal } : null,
  };
}

/**
 * What closing the gap a cascade cause carries is worth, a round: what the cause is worth, never "strokes you are losing". The
 * cascade anchors it on the team's average when it has one (the player's value, the team's and the Tour's all known), and
 * otherwise carries the whole gap to the Tour (`CauseNode.strokesSavedPerRound`), so the page says which.
 */
function closesFor(raw: EvidenceInsight, themes: AssembledThemes | null): ChDeepInsight['closes'] {
  const cause = themes?.themes.flatMap((t) => t.causes).find((c) => c.insight_id === raw.id);
  if (!cause || cause.counterfactualSuppressed || !(cause.strokesSavedPerRound > 0)) return null;
  const team = cause.standingTeamAvgValue != null && cause.standingPlayerValue != null && cause.standingPgaValue != null;
  return { strokes: formatFixed(cause.strokesSavedPerRound, 1), anchor: team ? 'team' : 'tour' };
}

function themeRead(t: ThemeNode, role: ChViewer['role'] = 'player'): ChDiveTheme {
  const trend = t.trend;
  const sg = t.sgPerRound != null ? formatSG(t.sgPerRound) : null;
  if (!trend) return { label: t.displayLabel, state: t.state, sg, trend: null };
  // The engine's direction cuts at a fixed 0.15 with no noise test; the page words and tones the change only past its standard
  // error (A1, the one change rule), each window's rounds at the pooled strokes-gained spread, as every leg on Stats is judged.
  const se = diffSe(standardError(POOLED_SD.sg, trend.recentN), standardError(POOLED_SD.sg, trend.priorN));
  const tone = halvesTone({ delta: trend.recentAvg - trend.priorAvg, se }, false, 1);
  const word = tone === 'is-gain' ? 'Improving' : tone === 'is-loss' ? 'Slipping' : 'No clear change';
  const span = `strokes gained averaged ${formatSG(trend.recentAvg)} a round over ${role === 'coach' ? 'the' : 'your'} last ${trend.recentN} rounds, against ${formatSG(trend.priorAvg)} over the ${trend.priorN} before`;
  return { label: t.displayLabel, state: t.state, sg, trend: { word, tone: tone === 'is-gain' ? 'good' : tone === 'is-loss' ? 'warn' : 'plain', text: `${t.displayLabel}: ${span}` } };
}

/** A read's span: the dates its window covers, or All rounds for a lifetime value. */
function spanOf(ev: InsightEvidence): string | null {
  if (ev.window_basis === 'lifetime') return 'All rounds';
  const a = fmtShortDate(ev.window_start || null);
  const b = fmtShortDate(ev.window_end || null);
  return a && b ? `${a} to ${b}` : null;
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A counted sequence as stored, from whichever field carries it. */
interface StoredSequence {
  what: string;
  occurrences: number | null;
  of: number | null;
  population: string | null;
  refs: Array<{ round_id: string; hole_number: number }>;
}

function holeRefs(v: unknown): StoredSequence['refs'] {
  if (!Array.isArray(v)) return [];
  return v
    .map(rec)
    .filter((r): r is Record<string, unknown> => !!r && !!str(r.round_id) && num(r.hole_number) != null && (r.hole_number as number) > 0)
    .map((r) => ({ round_id: str(r.round_id)!, hole_number: r.hole_number as number }))
    .slice(0, 5);
}

/**
 * The counted sequence a read's evidence stores with its example holes, or null. Only a COUNTED path is read, never a guess:
 *   1. `evidence.cause` (root-cause pass) in the `observed_sequence` state, its `path` and `example_holes`. A cause in any other
 *      state means the why is not counted, and no example holes are drawn even if another field carries some.
 *   2. Else `evidence.diagnosis.basis.sequence` on a `shot_sequence` basis (its `pattern` and `examples`).
 *   3. Else `evidence.detail.sequence` from the insight angles (Slice 5b, #2248), only when it says it meets the Observed floors.
 */
function storedSequence(ev: unknown): StoredSequence | null {
  const e = rec(ev);
  if (!e) return null;
  const cause = rec(e.cause);
  if (cause) {
    if (cause.state !== 'observed_sequence') return null;
    const path = Array.isArray(cause.path) ? cause.path.map(str).filter((x): x is string => !!x) : [];
    if (path.length === 0) return null;
    return { what: path.join(' → '), occurrences: num(cause.occurrences), of: num(cause.denominator), population: str(cause.population), refs: holeRefs(cause.example_holes) };
  }
  const basis = rec(rec(e.diagnosis)?.basis);
  const fromBasis = basis?.kind === 'shot_sequence' ? rec(basis.sequence) : null;
  const angle = rec(rec(e.detail)?.sequence);
  const seq = fromBasis ?? (angle?.meets_observed_floors === true ? angle : null);
  const what = str(seq?.pattern);
  if (!seq || !what) return null;
  return { what, occurrences: num(seq.occurrences), of: num(seq.of), population: str(seq.population), refs: holeRefs(seq.examples) };
}

/** The rounds a read's example holes are on, for the loader to read beside the source rounds. */
export function exampleRoundIds(ev: unknown): string[] {
  return [...new Set(storedSequence(ev)?.refs.map((r) => r.round_id) ?? [])];
}

/** Where it happened, from the stored sequence and the rounds read for it: a hole whose round this player no longer has is left out. */
export function whereFor(ev: unknown, byId: ReadonlyMap<string, DiveRoundRow>, voice: ChViewer['role'] = 'player'): ChDiveWhere | null {
  const seq = storedSequence(ev);
  if (!seq) return null;
  const holes = seq.refs.flatMap((ref): ChDiveHole[] => {
    const r = byId.get(ref.round_id);
    if (!r) return [];
    return [
      {
        key: `${ref.round_id}:${ref.hole_number}`,
        date: fmtShortDate(r.round_date) ?? r.round_date.slice(0, 10),
        course: r.course_name?.trim() || null,
        hole: ref.hole_number,
        what: seq.what,
        href: rebuiltHref(`/golf/dashboard/rounds/${r.id}`, 'player'),
      },
    ];
  });
  if (holes.length === 0) return null;
  const counted =
    seq.occurrences != null && seq.of != null && seq.of > 0 ? `${seq.occurrences} of ${voice === 'player' ? 'your ' : ''}${seq.of}${seq.population ? ` ${seq.population}` : ''}` : null;
  return { counted, holes };
}

/** How firm a read is, in one word (see `ChDeepInsight.firmness`). */
export function firmnessOf(base: Pick<ChInsight, 'engine' | 'evidence'>): string | null {
  return base.engine?.support?.word ?? base.evidence.read?.word ?? null;
}

/**
 * A cleared read as its ledger line. `line` is the recheck's own sentence (`lifecycle/delivery-shape.ts clearedLine`), which opens
 * with "<label> · Cleared — " (a coach's carries the date too); the row says the label and "Cleared <date>" in their own places, so
 * only the rest is kept. A line in any other form is kept whole.
 */
export function toDiveCleared(raw: Pick<EvidenceInsight, 'id' | 'title' | 'category' | 'evidence'>, line: string): ChDiveCleared {
  const e = rec(raw.evidence);
  const title = str(e?.metric_label) ?? str(raw.title) ?? 'This read';
  const at = str(rec(e?.recheck)?.computed_at);
  const when = shortDate(at);
  const head = line.match(/^.*? · Cleared(?: [A-Z][a-z]{2} \d{1,2})? — /);
  return { id: raw.id, area: areaOf(raw.category), title, word: when ? `Cleared ${when}` : 'Cleared', line: head ? line.slice(head[0].length) : line, at };
}

/** The cleared reads the ledger shows at first: the newest few (`DIVE_CLEARED_SHOWN`), by id. */
export function clearedShown(cleared: readonly ChDiveCleared[], all: boolean): Set<string> {
  if (all) return new Set(cleared.map((c) => c.id));
  const newest = [...cleared].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return new Set(newest.slice(0, DIVE_CLEARED_SHOWN).map((c) => c.id));
}

/**
 * One insight in full. `base`: the Board's own mapping of `raw` (`toChInsight`), so the card, its numbers and its words are the Board's;
 * `inputs`: the rounds, focus areas, goals and category reads the loader read beside it. `say` and `role` are the one viewer `base`
 * was mapped for: the Deep dive is the player's own (130104), so the role is the player's unless a coach's rendering says otherwise.
 */
export function toChDeepInsight(
  raw: EvidenceInsight,
  base: ChInsight,
  inputs: Pick<ChDiveInputs, 'rounds' | 'focusAreas' | 'goals' | 'themes'>,
  say: (t: string) => string = (t) => t,
  role: ChViewer['role'] = 'player',
): ChDeepInsight {
  const ev = raw.evidence;
  const diagnosis = diagnosisFor(ev, say);
  const closes = closesFor(raw, inputs.themes);
  const rounds = roundsFor(ev, inputs.rounds, role);
  return {
    base,
    cat: raw.category ?? 'other',
    stance: stanceOf(base),
    measured: { label: base.evidence.label || ev.metric_label, value: base.value, span: spanOf(ev) },
    diagnosis,
    movement: movementFor(raw),
    outcome: outcomeFor(raw),
    closes,
    rounds,
    plan: planFor(raw, inputs.focusAreas, inputs.goals, role === 'coach' ? say : undefined),
    read: toChRead(raw, base, { diagnosis, closes, newestListed: rounds.list[0]?.date ?? null, windowEnd: fmtShortDate(ev.window_end || null), role }, say),
    area: areaOf(raw.category),
    firmness: firmnessOf(base),
    where: whereFor(ev, inputs.rounds, role),
  };
}

/** The category reads by key, from the assembled themes (all seven, with honest `thin` stubs). `role`: whose page they are on. */
export function themesByCategory(themes: AssembledThemes | null, role: ChViewer['role'] = 'player'): Record<string, ChDiveTheme> {
  return Object.fromEntries((themes?.themes ?? []).map((t) => [t.category, themeRead(t, role)]));
}

/** The page's counts, from the insights it draws. */
export function diveCounts(list: readonly ChDeepInsight[]): ChDeepDive['counts'] {
  return {
    insights: list.length,
    needs: list.filter((i) => i.base.kind === 'finding').length,
    working: list.filter((i) => i.base.kind === 'strength').length,
    inPlan: list.filter((i) => i.plan.focus?.live || i.plan.goal?.word === 'Active').length,
  };
}

/** Findings first (a read that is current before one that is out of date, the feed's own order within each), then what is working. The page splits this list by kind and keeps the order. */
export function orderDive(list: readonly ChDeepInsight[]): ChDeepInsight[] {
  const findings = list.filter((i) => i.base.kind === 'finding');
  return [...findings.filter((i) => !i.base.stale), ...findings.filter((i) => i.base.stale), ...list.filter((i) => i.base.kind === 'strength')];
}
