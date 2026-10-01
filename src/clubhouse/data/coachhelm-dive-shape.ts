import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { fmtShortDate } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import type { InsightEvidence, InsightMovement, InsightUnit } from '@/lib/coachhelm/v2/insights/types';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { AssembledThemes, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { formatSigned, formatToPar } from '../lib/format';
import { rebuiltHref } from '../shell/nav';
import { formatComparison } from './coachhelm-map';
import { stanceOf, type ChBoardMissing, type ChInsight, type ChStance } from './coachhelm-shape';
import { figure } from './coachhelm-standing-shape';

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
  trend: { word: 'Improving' | 'Slipping' | 'Steady'; tone: ChDiveTone; text: string } | null;
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

function roundsFor(ev: InsightEvidence | undefined, byId: ReadonlyMap<string, DiveRoundRow>): ChDiveRounds {
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
      href: rebuiltHref(`/golf/dashboard/rounds/${r.id}`, 'player'),
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
      return `${r} ${r === 1 ? 'stroke' : 'strokes'}`;
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

/** The focus area and the goal an insight belongs to: the ones made from it first, else one on the same metric (a live focus area before a finished one). */
function planFor(raw: EvidenceInsight, focusAreas: readonly DiveFocusRow[], goals: readonly Goal[]): ChDivePlan {
  const known = (f: DiveFocusRow) => !!f.status && f.status in FOCUS_WORD;
  const own = focusAreas.find((f) => f.from_insight_id === raw.id && known(f));
  const sameMetric = [...focusAreas].filter((f) => f.target_metric === raw.evidence.metric && known(f)).sort((a, b) => Number(FOCUS_LIVE.has(b.status!)) - Number(FOCUS_LIVE.has(a.status!)))[0];
  const focus = own ?? sameMetric ?? null;
  const ownGoal = goals.find((g) => g.origin_insight_id === raw.id);
  const goal = ownGoal ?? goals.find((g) => g.metric_id === raw.evidence.metric && g.state in GOAL_WORD) ?? null;
  return {
    focus: focus ? { id: focus.id, title: focus.title, word: FOCUS_WORD[focus.status!]!, live: FOCUS_LIVE.has(focus.status!), fromThis: focus === own } : null,
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
  return { strokes: cause.strokesSavedPerRound.toFixed(1), anchor: team ? 'team' : 'tour' };
}

function themeRead(t: ThemeNode): ChDiveTheme {
  const trend = t.trend;
  const sg = t.sgPerRound != null ? formatSigned(t.sgPerRound, 2) : null;
  if (!trend) return { label: t.displayLabel, state: t.state, sg, trend: null };
  const word = trend.direction === 'improving' ? 'Improving' : trend.direction === 'declining' ? 'Slipping' : 'Steady';
  const span = `strokes gained averaged ${formatSigned(trend.recentAvg, 2)} a round over your last ${trend.recentN} rounds, against ${formatSigned(trend.priorAvg, 2)} over the ${trend.priorN} before`;
  return { label: t.displayLabel, state: t.state, sg, trend: { word, tone: trend.direction === 'improving' ? 'good' : trend.direction === 'declining' ? 'warn' : 'plain', text: `${t.displayLabel}: ${span}` } };
}

/** A read's span: the dates its window covers, or All rounds for a lifetime value. */
function spanOf(ev: InsightEvidence): string | null {
  if (ev.window_basis === 'lifetime') return 'All rounds';
  const a = fmtShortDate(ev.window_start || null);
  const b = fmtShortDate(ev.window_end || null);
  return a && b ? `${a} to ${b}` : null;
}

/**
 * One insight in full. `base`: the Board's own mapping of `raw` (`toChInsight`), so the card, its numbers and its words are the Board's;
 * `inputs`: the rounds, focus areas, goals and category reads the loader read beside it.
 */
export function toChDeepInsight(raw: EvidenceInsight, base: ChInsight, inputs: Pick<ChDiveInputs, 'rounds' | 'focusAreas' | 'goals' | 'themes'>, say: (t: string) => string = (t) => t): ChDeepInsight {
  const ev = raw.evidence;
  return {
    base,
    cat: raw.category ?? 'other',
    stance: stanceOf(base),
    measured: { label: base.evidence.label || ev.metric_label, value: base.value, span: spanOf(ev) },
    diagnosis: diagnosisFor(ev, say),
    movement: movementFor(raw),
    outcome: outcomeFor(raw),
    closes: closesFor(raw, inputs.themes),
    rounds: roundsFor(ev, inputs.rounds),
    plan: planFor(raw, inputs.focusAreas, inputs.goals),
  };
}

/** The category reads by key, from the assembled themes (all seven, with honest `thin` stubs). */
export function themesByCategory(themes: AssembledThemes | null): Record<string, ChDiveTheme> {
  return Object.fromEntries((themes?.themes ?? []).map((t) => [t.category, themeRead(t)]));
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
