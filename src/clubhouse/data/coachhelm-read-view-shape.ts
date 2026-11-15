import { formatFixed, formatToPar } from '../lib/format';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { dayOf, refreshedDay } from './coachhelm-classify';
import { formatComparison } from './coachhelm-map';
import { holeToPar, readPoints, roundNote, roundsAfter, TREND_LAST, TREND_MIN, windowFigure, type ChReadExtras } from './coachhelm-read-extras-shape';
import { namesWithheldArm } from '@/lib/coachhelm/reads/player-cause';
import { confidenceTier } from '@/lib/coachhelm/confidence-label';
import { sureSentence } from '@/lib/coachhelm/shared/confidence-reason';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ChReadCalls } from './coachhelm-read-calls';
import type { ChDeepDive, ChDeepInsight, ChDiveHole, ChDivePlan, ChDiveRound, ChDiveTheme } from './coachhelm-dive-shape';
import { areaOf as diveAreaOf, DIVE_AREAS } from './coachhelm-dive-shape';
import type { ChBoardMissing, ChInsight, ChHelmWeek } from './coachhelm-shape';
import type { ChEngineVerdict } from './coachhelm-engine-shape';
import { strokesLine, type ChReadNext, type ChReadWhy } from './coachhelm-read-shape';

/** The CoachHelm read as its own view, pure and client-safe (coachhelm-read 02-PLAN 3.5). Every field is nullable: a card draws only when its data is on the read. */
export interface ChBenchmarkLadder {
  you: { label: string; value: number; display: string };
  lines: Array<{ source: string; label: string; value: number; display: string; note: string | null }>;
  min: number;
  max: number;
}

export interface ChFunnelStep {
  label: string;
  n: number | null;
  /** The step's denominator ("17 of 23": 23), for its bar; null when the statement states none. */
  of: number | null;
  statement: string;
}

export type ChReadCause =
  | { state: 'counted'; track: 2; path: string[]; count: string; eventStrokes: number | null; /** `toPar`: the hole's score against par ("+1"), when the hole is on file. */ holes: Array<ChDiveHole & { toPar?: string | null }>; /** The narrowing's first step as a rate a round, and the rest (`splitOf`). */ split?: ChReadSplit[] | null }
  | { state: 'likely'; track: 1; arms: Array<{ label: string; failures: number; n: number }>; verdict: string | null; range: string | null }
  | {
      state: 'not_traced';
      track: 0;
      gap: { have: number; need: number; text: string } | null;
      countDown: { haveEvents: number; needEvents: number; haveRounds: number; needRounds: number } | null;
      reason: string | null;
      text: string | null;
    };

export interface ChReadSplit {
  /** "Off the tee, per round". */
  label: string;
  /** "0.8". */
  value: string;
  /** How many of the counted events it is. */
  n: number;
}

/**
 * The split under a counted cause: the narrowing's first step as a rate a round, beside everything else ("17 of 23 penalties came off
 * the tee" over 21 rounds is 0.8 a round off the tee and 0.3 everywhere else). Only arithmetic on counts the read already states, and
 * only when it is sound: the read's figure is a count a round, its sample is rounds, and the step counts the same events the cause does.
 */
export function splitOf(step: ChFunnelStep | undefined, events: number | null, rounds: number | null): ChReadSplit[] | null {
  if (!step || step.n == null || step.of == null || events == null || rounds == null || rounds <= 0) return null;
  if (step.of !== events || step.n > step.of || step.n <= 0) return null;
  const rest = step.of - step.n;
  return [
    { label: `${step.label}, per round`, value: formatFixed(step.n / rounds, 1), n: step.n },
    ...(rest > 0 ? [{ label: 'Everywhere else, per round', value: formatFixed(rest / rounds, 1), n: rest }] : []),
  ];
}

export interface ChReadDetail {
  insight: ChInsight;
  stance: string;
  /** The stance pill's class (`ChStance.cls`): high, medium, low, ok, done, stale, note. */
  stanceCls: string;
  /**
   * The head's four lines (7 Nov design): What as a sentence a coach would say (`whatProse`), the Why with its basis, Next and the day
   * the read runs through. The parts are the Deep dive's own (`coachhelm-read-shape.ts`); a player's What never names the team pool.
   */
  four: { what: string; why: ChReadWhy; next: ChReadNext; through: string | null };
  /** What was measured: the number, its label and the window it covers. */
  measured: { label: string; value: string; span: string | null };
  headline: {
    title: string;
    lede: string;
    value: string;
    valueNote: string | null;
    ladder: ChBenchmarkLadder | null;
    worth: { strokes: string; to: 'team' | 'tour' | 'self'; estimated: boolean } | null;
    foot: { sample: string; firm: string | null; rung: string | null; through: string | null };
    stale: string | null;
    /** How many rounds were played after the read was last made; null when it is current or the rounds did not load. */
    newer: number | null;
  };
  funnel: { steps: ChFunnelStep[]; stopped: boolean } | null;
  cause: ChReadCause | null;
  /** A row stored before the engine wrote a cause: today's drivers, in the card's markup. */
  legacy: ChDeepInsight['diagnosis'];
  sure: { word: string | null; rows: Array<{ k: 'Sample' | 'Recent' | 'Shot record'; have: number; need: number; text: string }>; checked: string[]; rung: { word: string; range: string | null } | null };
  moved: { from: number; to: number; text: string; tone: string; ref: { label: string; value: number } | null; theme: ChDiveTheme | null; through: string | null } | null;
  /**
   * The read's own metric round by round, oldest to newest (`coachhelm-read-extras-shape.ts`): the newest eight, and the season when
   * it holds other rounds. Null when the metric has no per-round source or under three rounds carry it: no line is then drawn.
   */
  trend: ChReadTrend | null;
  /** `note`: what the read's metric was in that round ("2 penalties", "9 of 14 fairways"), when it has a per-round source. */
  rounds: { total: number; list: Array<ChDiveRound & { counted: number; note?: string | null }> };
  todo: { drill: ChHelmWeek | null; worth: string | null; startsFrom: string | null; verdict: ChEngineVerdict | null; plan: ChDivePlan };
}

export interface ChReadTrendWindow {
  values: number[];
  /** "1.5 a round over the last 8 rounds": the window's own figure, said. */
  said: string;
}
export interface ChReadTrend {
  /** "Penalties per round, oldest to newest". */
  label: string;
  lowerBetter: boolean | null;
  /** The Tour's figure, dashed across the plot. */
  ref: { label: string; value: number; display: string } | null;
  last: ChReadTrendWindow;
  season: ChReadTrendWindow | null;
}

export interface ChReadsRailRow {
  id: string;
  title: string;
  sub: string;
  value: string;
  tone: 'warn' | 'good' | 'plain';
  /** The row as the Deep dive's ledger draws it: the category, the stance (class and word), how firm, and what the number counts. */
  category: string;
  cls: string;
  word: string;
  firm: string | null;
  unit: string | null;
}

export interface ChReadView {
  /** A player's page only: the coach "Message Coach Reyes" opens a thread with. Absent when it did not load, and for a coach. */
  coach?: { name: string | null; userId: string };
  head: { playerId: string | null; name: string; first: string };
  area: string;
  read: ChReadDetail | null;
  rail: Array<{ label: string; rows: ChReadsRailRow[] }>;
  counts: { insights: number; needs: number };
  missing?: ChBoardMissing;
  failed: { rounds: boolean; plans: boolean; themes: boolean };
  calls: ChReadCalls;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The narrowing's counts live only in the engine's statement text (02-PLAN 10 row 1): "16 of 28 approaches from 175+ yd missed…", "12 of 16 misses
 * came on long par 4s", "on long par 4s 12 of 20 …". The first "n of m" is the step's own. A statement that doesn't parse draws text with no bar.
 */
export function funnelOf(narrowing: { steps?: Array<{ passed: boolean; label: string | null; statement: string }>; stopped_at?: string | null } | null | undefined): ChReadDetail['funnel'] {
  const steps = narrowing?.steps ?? [];
  if (!steps.length) return null;
  const out: ChFunnelStep[] = [];
  for (const s of steps) {
    if (!s.passed) continue;
    const m = s.statement.match(/(\d+) of (\d+)/);
    out.push({ label: s.label ?? 'Step', n: m ? Number(m[1]) : null, of: m ? Number(m[2]) : null, statement: s.statement });
  }
  return out.length ? { steps: out, stopped: narrowing?.stopped_at != null } : null;
}

/**
 * The ladder: the player's figure and each stored comparison; a team line only on a coach's read and only as call 3 allows, and never a
 * college line (Q-88). A player's ladder never carries the team pool, whatever the calls say: it is built without the line, not hidden.
 */
export function benchmarkLadder(ev: Record<string, unknown> | null | undefined, who: string, calls: ChReadCalls, role: 'coach' | 'player' = 'player'): ChBenchmarkLadder | null {
  const you = num(ev?.your_value);
  if (you == null) return null;
  const comparison = ev?.comparison as { lines?: Array<Record<string, unknown>>; primary?: Record<string, unknown> } | undefined;
  const unit = ev?.unit === 'percent' ? '%' : '';
  const fmt = (v: number) => (unit ? `${Math.round(v)}%` : formatFixed(v, Math.abs(v) < 10 ? 1 : 0));
  const all = comparison?.lines ?? (comparison?.primary ? [comparison.primary] : []);
  const lines = all
    .filter((l) => num(l.value) != null && (l.source !== 'team_pool' || (role === 'coach' && calls.teamPool && calls.teamPoolOnLadder === 'when-flag-on')))
    .map((l) => {
      const value = l.value as number;
      const n = num(l.n);
      const players = num(l.players);
      return {
        source: String(l.source ?? ''),
        label: String(l.label ?? 'Tour'),
        value,
        display: fmt(value),
        note: n == null ? null : [`${n} ${String(l.n_noun ?? l.n_unit ?? '')}`.trim(), players ? `${players} teammates` : null].filter(Boolean).join(' · '),
      };
    });
  if (!lines.length) return null;
  const vals = [you, ...lines.map((l) => l.value)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15;
  return { you: { label: who, value: you, display: fmt(you) }, lines, min: lo - pad, max: hi + pad };
}

/** The cause, by viewer. A player's likely cause is never built: no arms, verdict or range reach a player's client (Q3, CR0). */
export function readCauseOf(cause: Record<string, unknown> | null | undefined, where: ChDeepInsight['where'], role: 'coach' | 'player', supportRange: string | null = null): ChReadCause | null {
  if (!cause) return null;
  const state = cause.state as string;
  if (state === 'observed_sequence' || state === 'counted') {
    const path = (cause.path as string[] | null) ?? [];
    const occ = num(cause.occurrences);
    const den = num(cause.denominator);
    return { state: 'counted', track: 2, path, count: where?.counted ?? (occ != null && den != null ? `${occ} of ${den}` : `${occ ?? ''}`), eventStrokes: num(cause.event_strokes), holes: where?.holes ?? [] };
  }
  if ((state === 'inferred_hypothesis' || state === 'likely') && role === 'coach') {
    const alt = ((cause.alternatives as Array<Record<string, unknown>> | undefined) ?? [])[0];
    const arm = (a: unknown, label: string) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const n = num(x.n);
      const f = num(x.failures);
      return n != null && f != null ? { label, failures: f, n } : null;
    };
    const slice = String(alt?.label ?? 'This slice');
    const arms = [arm(alt?.arm_a, slice), arm(alt?.arm_b, 'All other holes')].filter((x): x is { label: string; failures: number; n: number } => !!x);
    const lift = num(alt?.lift);
    return { state: 'likely', track: 1, arms, verdict: lift != null ? `${slice} misses ${formatFixed(lift, 1)} times as often as all other holes.` : null, range: supportRange };
  }
  const gap = cause.data_gap as Record<string, unknown> | null | undefined;
  const cd = cause.count_down as Record<string, number> | undefined;
  const have = num(gap?.have_count);
  const target = num(gap?.target_count);
  return {
    state: 'not_traced',
    track: 0,
    gap: have != null && target != null ? { have, need: have + target, text: String(gap?.prompt ?? '') } : null,
    countDown: cd ? { haveEvents: cd.have_events ?? 0, needEvents: cd.need_events ?? 0, haveRounds: cd.have_rounds ?? 0, needRounds: cd.need_rounds ?? 0 } : null,
    reason: (cause.not_traced_reason as string | undefined) ?? null,
    text: cause.not_traced_reason === 'load_failed' ? 'Shot records could not be read this run' : null,
  };
}

const endStop = (t: string): string => (/[.!?…][”"’)]?$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
/** "Compared with Tour 0.3": a comparison that ends in its figure. */
const NAMED_FIGURE = /^Compared with (.+?) ([+\u2212-]?\d[\d.,]*(?:%| yd| ft| pts)?)$/;

/**
 * The What line as a sentence a coach would say (7 Nov design), from what the read already carries and nothing else:
 *   1. the generator's own first sentence, already in the viewer's voice and, for a player, without a guessed cause (`ChInsight.lede`),
 *      when it states the read's figure; else the label and the figure ("Penalties per round: 1.1 a round over 21 rounds.");
 *   2. the sample, when that sentence did not say it ("Over 75 putts.");
 *   3. the comparison by name ("Tour is 0.3."), or the stored comparison line as written;
 *   4. what closing the gap is worth, only when the row carries a real estimate.
 * No number is computed here and none is said twice. The confidence word stays on the measure and under How sure.
 */
export function whatProse(p: { lede: string; subject: string; value: string; sample: string | null; benchmark: string | null; worth: string | null }): string {
  const lede = p.lede.trim();
  const figure = p.value.match(/\d+(?:\.\d+)?/)?.[0] ?? null;
  const told = !!lede && (!figure || lede.includes(figure));
  const count = p.sample?.match(/\d[\d,]*/)?.[0] ?? null;
  const out: string[] = [];
  if (told) {
    out.push(endStop(lede));
    if (p.sample && count && !lede.includes(count)) out.push(`Over ${p.sample}.`);
  } else {
    const head = p.value ? `${p.subject}: ${p.value}` : p.subject;
    out.push(endStop(p.sample ? `${head} over ${p.sample}` : head));
  }
  if (p.benchmark) {
    const m = NAMED_FIGURE.exec(p.benchmark.trim());
    const name = m ? m[1]!.replace(/^the /i, '') : null;
    out.push(m && name ? `${name.charAt(0).toUpperCase()}${name.slice(1)} is ${m[2]}.` : endStop(p.benchmark));
  }
  if (p.worth) out.push(endStop(p.worth));
  return out.join(' ');
}

function checkedLabels(lines: readonly string[] | undefined, role: 'coach' | 'player'): string[] {
  // What CoachHelm checked is the coach's (7 Nov design, "How sure"): a player's payload carries none of it.
  if (role !== 'coach') return [];
  // The engine's lines start with a level ("length: 16 of 28 …"); the card names what was looked at, and drops the family codes ("A5 …").
  const out: string[] = [];
  for (const l of lines ?? []) {
    if (/^A\d+\b/.test(l)) continue;
    const key = l.match(/^(\w+):/)?.[1];
    const named = key === 'length' ? 'Length of the approach' : key === 'par' ? 'Par and length of the hole' : key === 'shape' ? 'Where the miss finished' : null;
    // A line with no plain name is the engine's own, with its counts: a coach reads it, a player's payload does not carry it.
    if (named) out.push(named);
    else if (role === 'coach') out.push(l);
  }
  return [...new Set(out)];
}

const WORTH_TO: Record<string, 'team' | 'tour'> = { team: 'team', tour: 'tour' };

/** A figure of the read's own metric, as the ladder says it: a whole percent, a signed stroke figure, else one decimal under ten. */
function figureOf(ev: EvidenceInsight['evidence'], v: number): string {
  if (ev.unit === 'percent') return `${Math.round(v)}%`;
  if (ev.unit === 'strokes') return formatComparison(v, 'strokes');
  return formatFixed(v, Math.abs(v) < 10 ? 1 : 0);
}

/** The trend, from the player's own rounds; null when the metric has no per-round source (the registry's word) or too few rounds. */
export function trendOf(raw: EvidenceInsight, label: string, ref: { label: string; value: number } | null, extras: ChReadExtras | null | undefined): { trend: ChReadTrend | null; noteOf: (roundId: string) => string | null } {
  const none = { trend: null, noteOf: () => null };
  const got = extras ? readPoints(raw.evidence.metric, extras) : null;
  if (!extras || !got) return none;
  const byId = new Map(got.points.map((p) => [p.id, p]));
  const noteOf = (roundId: string) => roundNote(got.def, byId.get(roundId));
  const last = got.points.slice(-TREND_LAST);
  const lastFigure = windowFigure(got.def, last);
  if (last.length < TREND_MIN || lastFigure == null) return { trend: null, noteOf };
  const season = got.points.filter((p) => p.date >= extras.seasonSince);
  const seasonFigure = windowFigure(got.def, season);
  const perRoundUnit = raw.evidence.unit === 'count' ? ' a round' : '';
  const dir = raw.evidence.polarity ?? getMetricRenderConfig(raw.evidence.metric)?.direction;
  // The season is its own window only when it is not the same rounds as the last eight.
  const differs = season.length >= TREND_MIN && (season.length !== last.length || season[0]?.id !== last[0]?.id);
  return {
    noteOf,
    trend: {
      label: `${label}, oldest to newest`,
      lowerBetter: dir === 'lower_better' ? true : dir === 'higher_better' ? false : null,
      ref: ref ? { ...ref, display: figureOf(raw.evidence, ref.value) } : null,
      last: { values: last.map((p) => p.value), said: `${figureOf(raw.evidence, lastFigure)}${perRoundUnit} over the last ${last.length} rounds` },
      season: differs && seasonFigure != null ? { values: season.map((p) => p.value), said: `${figureOf(raw.evidence, seasonFigure)}${perRoundUnit} across the season, ${season.length} rounds` } : null,
    },
  };
}

export function toChReadDetail(raw: EvidenceInsight, deep: ChDeepInsight, role: 'coach' | 'player', first: string, calls: ChReadCalls, themes: Record<string, ChDiveTheme>, tour: string = 'Tour', extras: ChReadExtras | null = null): ChReadDetail {
  const ev = raw.evidence as unknown as Record<string, unknown>;
  const base = deep.base;
  const cause = ev.cause as Record<string, unknown> | null | undefined;
  const diagnosis = ev.diagnosis as { basis?: { narrowing?: Parameters<typeof funnelOf>[0]; checked?: string[] } } | null | undefined;
  const support = base.engine?.support as { word?: string; range?: string | null } | undefined;
  const sampleN = num(ev.sample_n);
  const factors = ev.confidence_factors as { sample_adequacy?: number; recency?: number; factors_measured?: boolean } | undefined;
  const rows: ChReadDetail['sure']['rows'] = [];
  if (sampleN != null && factors?.sample_adequacy != null && factors.sample_adequacy > 0) {
    const need = Math.round(sampleN / Math.min(1, factors.sample_adequacy));
    // 06 S-READ.sure: a player reads the count alone. A coach reads whether it is enough (READ-S1: "27 approaches. Enough for a solid read."), in the same tier as the word beside it.
    const noun = (deep.base.evidence.sample ?? '').match(/\d+\s+(.+)$/)?.[1]?.trim() ?? '';
    const said = [String(sampleN), noun].filter(Boolean).join(' ');
    rows.push({ k: 'Sample', have: sampleN, need, text: role === 'player' ? said : sureSentence(said, confidenceTier(num(ev.confidence))) });
  }
  // 03 §9: a real measure only when the engine says it measured it, and said as a share of its own window.
  if (factors?.factors_measured === true && factors.recency != null) rows.push({ k: 'Recent', have: factors.recency, need: 1, text: factors.recency >= 0.5 ? 'Most rounds in the last 45 days' : 'Few rounds in the last 45 days' });
  const checked = cause?.checked as { holes_with_full_record?: number; of?: number; fields_missing?: string[] } | undefined;
  if (checked?.of) {
    const miss = checked.of - (checked.holes_with_full_record ?? 0);
    rows.push({ k: 'Shot record', have: checked.holes_with_full_record ?? 0, need: checked.of, text: `${checked.holes_with_full_record ?? 0} of ${checked.of} holes${miss > 0 && checked.fields_missing?.[0] ? `, ${checked.fields_missing[0]} missing on ${miss}` : ''}` });
  }
  const movement = (raw.metadata as { movement?: { from: number; to: number } } | null)?.movement;
  const tourLine = (ev.comparison as { lines?: Array<{ source?: string; label?: string; value?: number }> } | undefined)?.lines?.find((l) => l.source === 'tour');
  const theme = themes[deep.cat] ?? null;
  const funnelAllowed = role === 'coach' || calls.playerFunnel;
  const funnel = funnelAllowed ? funnelOf(diagnosis?.basis?.narrowing) : null;
  // Call 2 gives a player the observed funnel; Q3 stays either way, so a step that is an arm of a likely cause is not on their copy.
  const playerSteps = funnel?.steps.filter((s) => !namesWithheldArm(`${s.label} ${s.statement}`, ev)) ?? [];
  // The team pool is the coach's. A player's What line is already built without it (`toChRead`), and the board card's pooled figure
  // (`compare.team`, the coach's read sheet) is not on their copy.
  const insight: ChInsight = role === 'player' && base.compare?.team != null ? { ...base, compare: { ...base.compare, team: null } } : base;
  const w = deep.read.what;
  const tourRef = tourLine?.value != null ? { label: tourLine.label ?? tour, value: tourLine.value } : base.compare?.tour != null ? { label: tour, value: base.compare.tour } : null;
  const { trend, noteOf } = trendOf(raw, base.evidence.label || raw.evidence.metric_label, tourRef, calls.pictures ? extras : null);
  const builtCause = readCauseOf(cause, deep.where, role, support?.range ?? null);
  // A count a round over a sample of rounds (the penalty read) whose own figure is the cause's events over those rounds (1.1 over 21
  // rounds is the 23 the cause counts): the only case a step's count is also a rate a round.
  const causeEvents = num(cause?.denominator);
  const figure = num(ev.your_value);
  const roundsCounted =
    raw.evidence.unit === 'count' && /\brounds?$/.test(base.evidence.sample) && sampleN != null && causeEvents != null && figure != null && Math.abs(figure * sampleN - causeEvents) <= sampleN * 0.05 + 1e-9
      ? sampleN
      : null;
  const shownCause: ChReadCause | null =
    builtCause?.state === 'counted'
      ? {
          ...builtCause,
          split: splitOf((role === 'coach' ? funnel?.steps : playerSteps)?.[0], causeEvents, roundsCounted),
          holes: builtCause.holes.map((h) => {
            const toPar = extras ? holeToPar(extras.holes, h.key.slice(0, h.key.lastIndexOf(':')), h.hole) : null;
            return { ...h, toPar: toPar == null ? null : formatToPar(toPar) };
          }),
        }
      : builtCause;
  return {
    insight,
    stance: deep.stance.word,
    stanceCls: deep.stance.cls,
    four: {
      what: whatProse({ lede: base.lede, subject: w.subject, value: w.value, sample: base.evidence.sample || null, benchmark: base.evidence.bars ? null : w.benchmark, worth: w.strokes ? strokesLine(w.strokes, tour, undefined, role) : null }),
      why: deep.read.why,
      next: deep.read.next,
      through: deep.read.when.through,
    },
    measured: deep.measured,
    headline: {
      title: base.title,
      lede: base.lede,
      value: base.value,
      valueNote: base.valueUnit,
      ladder: calls.pictures ? benchmarkLadder(ev, role === 'coach' ? first : 'You', calls, role) : null,
      worth: deep.closes ? { strokes: deep.closes.strokes, to: WORTH_TO[deep.closes.anchor] ?? 'self', estimated: base.stakes != null } : null,
      foot: { sample: base.evidence.sample, firm: base.evidence.read?.word ?? null, rung: role === 'coach' ? (support?.word ?? null) : null, through: base.evidence.asOf },
      stale: base.stale ? `A newer round (${base.stale.newestRound}) is not in this read yet. It is re-read overnight.` : null,
      newer: base.stale && extras ? roundsAfter(refreshedDay(raw) ?? dayOf(raw.evidence.window_end), extras) : null,
    },
    funnel: role === 'coach' || !funnel ? funnel : playerSteps.length ? { ...funnel, steps: playerSteps } : null,
    cause: shownCause,
    legacy: cause ? null : deep.diagnosis,
    sure: {
      word: base.evidence.read?.word ?? null,
      rows,
      checked: checkedLabels(diagnosis?.basis?.checked, role),
      rung: role === 'coach' && support?.word ? { word: support.word, range: support.range ?? null } : null,
    },
    moved: movement && deep.movement ? { from: movement.from, to: movement.to, text: deep.movement.text, tone: String(deep.movement.tone), ref: tourLine?.value != null ? { label: tourLine.label ?? 'Tour', value: tourLine.value } : null, theme, through: base.evidence.asOf } : null,
    trend,
    rounds: {
      total: deep.rounds.total,
      list: deep.rounds.list.map((r) => ({ ...r, counted: (deep.where?.holes ?? []).filter((h) => h.key.startsWith(r.id)).length, note: noteOf(r.id) })),
    },
    todo: { drill: base.week, worth: deep.closes?.strokes ?? null, startsFrom: base.value || null, verdict: (base.engine?.verdict as ChEngineVerdict | undefined) ?? null, plan: deep.plan },
  };
}

const TIER: Record<string, string> = { observed_sequence: 'Counted', counted: 'Counted', inferred_hypothesis: 'Likely', likely: 'Likely', not_traced: 'Not traced' };

export function railOf(list: readonly ChDeepInsight[], role: 'coach' | 'player', raw?: ReadonlyMap<string, EvidenceInsight>): ChReadView['rail'] {
  return DIVE_AREAS.map((a) => ({
    label: a.label,
    rows: list
      .filter((i) => i.area === a.id)
      .map((i) => ({
        id: i.base.id,
        title: i.base.title,
        sub: [typeof i.stance === "object" ? i.stance.word : i.stance, role === 'coach' ? (TIER[String(((raw?.get(i.base.id)?.evidence as unknown as Record<string, unknown> | undefined)?.cause as { state?: string } | undefined)?.state)] ?? i.firmness) : null].filter(Boolean).join(' · '),
        value: i.base.value,
        tone: i.base.strength ? ('good' as const) : i.base.stale ? ('plain' as const) : ('warn' as const),
        category: i.base.category,
        cls: i.stance.cls,
        word: i.stance.word,
        // A coach reads the cause tier or the claim ladder's word; a player only the confidence word, never the ladder.
        firm: role === 'coach' ? (TIER[String(((raw?.get(i.base.id)?.evidence as unknown as Record<string, unknown> | undefined)?.cause as { state?: string } | undefined)?.state)] ?? i.firmness) : (i.base.evidence.read?.word ?? null),
        unit: i.base.value ? i.base.valueUnit : null,
      })),
  })).filter((g) => g.rows.length > 0);
}

export function toChReadView(dive: ChDeepDive, raw: ReadonlyMap<string, EvidenceInsight>, insightId: string, role: 'coach' | 'player', head: ChReadView['head'], calls: ChReadCalls, extras: ChReadExtras | null = null): ChReadView {
  const deep = dive.list.find((i) => i.base.id === insightId) ?? null;
  const row = raw.get(insightId) ?? null;
  const areaLabel = deep ? (DIVE_AREAS.find((a) => a.id === diveAreaOf(deep.cat))?.label ?? '') : '';
  return {
    head,
    area: areaLabel,
    read: deep && row ? toChReadDetail(row, deep, role, head.first, calls, dive.themes, dive.tour, extras) : null,
    rail: railOf(dive.list, role, raw),
    counts: { insights: dive.counts.insights ?? dive.list.length, needs: dive.counts.needs ?? 0 },
    ...(dive.missing ? { missing: dive.missing } : {}),
    failed: { rounds: dive.roundsFailed, plans: dive.plansFailed, themes: dive.themesFailed },
    calls,
  };
}

export type AssignState = 'dismissed' | 'note' | 'assigned' | 'unknown' | 'stale' | 'declined' | 'open';
/** The same gating `FocusActions` runs, branch by branch, as one pure answer. */
export function assignStateOf(ins: ChInsight, flags: { dismissed: boolean; assigned: boolean; missing?: ChBoardMissing }): AssignState {
  if (flags.dismissed) return 'dismissed';
  if (ins.kind === 'note') return 'note';
  if (flags.assigned) return 'assigned';
  if (flags.missing?.assigned || flags.missing?.declined || flags.missing?.newest) return 'unknown';
  if (ins.stale) return 'stale';
  return ins.declined ? 'declined' : 'open';
}
