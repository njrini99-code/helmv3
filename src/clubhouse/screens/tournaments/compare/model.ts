/**
 * What the comparison reads off a side's rounds (P016 Compare): the engine's metrics (`../metrics.ts`) over a side, the
 * sample state each figure is in, the difference between the sides with its standard error, and the evidence behind a figure.
 * Nothing here recounts a team round: the counting sets arrive on the rounds. Pure; client-safe.
 */
import { TERMS } from '../../../lib/glossary';
import { changeSe, type SampleState } from '../../../lib/stats-signal';
import { exclusionWords, metric, METRICS, tourSampleState, TOUR_FLOORS, type MetricDef, type MetricResult, type TourMetricKey, type TourMetricRound } from '../metrics';
import { formatFixed, formatSigned, formatToPar, NO_DATA, plural, tourDay } from '../format';
import type { ChTourCompareRound, ChTourEvent, ChTourEvidenceRef, ChTourScope } from '../types';

/** The metric groups (the board's strip), each with the catalogue rows that can be read from the loaded rounds. */
export const GROUPS: ReadonlyArray<{ id: string; label: string; keys: readonly TourMetricKey[] }> = [
  { id: 'scoring', label: 'Scoring', keys: ['score_avg', 'to_par_avg', 'vs_field', 'sg_total', 'birdie_rate'] },
  { id: 'counting', label: 'Counting', keys: ['count_rate', 'gap_drop'] },
  { id: 'tee', label: 'Off the tee', keys: ['fir', 'sg_ott'] },
  { id: 'app', label: 'Approach', keys: ['gir', 'sg_app'] },
  { id: 'short', label: TERMS.sgArg.long, keys: ['sg_arg'] },
  { id: 'putt', label: 'Putting', keys: ['putts', 'sg_putt'] },
];

export const groupOf = (id: string | null | undefined) => GROUPS.find((g) => g.id === id) ?? GROUPS[0]!;

/** A loaded round as the metrics engine reads it. Holes are not loaded, so the hole figures read the round's own counts. */
export function toMetricRound(r: ChTourCompareRound, events: readonly ChTourEvent[], failed: { field?: boolean; holes?: boolean } = {}): TourMetricRound {
  const e = r.eventId ? events.find((x) => x.id === r.eventId) : undefined;
  return {
    id: r.id,
    playerId: r.playerId,
    date: r.date,
    context: r.context,
    eventId: r.eventId,
    roundEventId: r.roundEventId,
    roundNumber: r.roundNumber,
    roundsInEvent: e?.rounds.length ?? null,
    holes: r.holes,
    totalOnly: r.totalOnly,
    score: r.score,
    toPar: r.toPar,
    vsField: failed.field ? null : r.vsField,
    counting: r.counting ? { counted: r.counting.counted, tie: r.counting.tie, line: null, drop: r.counting.drop, lineupSize: r.counting.lineupSize } : null,
    sg: r.sg ? { total: r.sg.ott + r.sg.app + r.sg.arg + r.sg.putt, ott: r.sg.ott, app: r.sg.app, arg: r.sg.arg, putt: r.sg.putt } : null,
    cache: failed.holes ? null : { gir: r.stats.gir, girOf: r.holes, fw: r.stats.fw, fwOf: r.stats.fwOf, putts: r.stats.putts, birdiesPlus: r.stats.birdiesPlus },
    role: r.individual ? 'individual' : r.eventId ? 'lineup' : null,
    squad: 'a',
  };
}

/** One figure on one side: the engine's result, the state of its sample, and the per-round values for the strip. */
export interface SideFigure {
  key: TourMetricKey;
  result: MetricResult;
  state: SampleState;
  values: number[];
}

export function sideFigure(key: TourMetricKey, rounds: readonly TourMetricRound[], subject: ChTourScope['subject']): SideFigure {
  const result = metric(key, rounds, { subject: subject.kind === 'player' ? 'player' : 'team' });
  const def = METRICS[key];
  // A share of holes counts its holes against the floor; everything else counts rounds (team rounds for the counting ones).
  const n = def.floor === 'holes' ? (result.of ?? 0) : result.n;
  return { key, result, state: result.value == null ? 'none' : tourSampleState(def.floor, n), values: result.perRound.map((p) => p.value) };
}

/** A side's figures for a group. */
export function sideFigures(keys: readonly TourMetricKey[], rounds: readonly TourMetricRound[], subject: ChTourScope['subject']): Record<string, SideFigure> {
  return Object.fromEntries(keys.map((k) => [k, sideFigure(k, rounds, subject)]));
}

const SIGNED: ReadonlySet<TourMetricKey> = new Set(['to_par_avg', 'vs_field']);

/** A figure the way the row writes it: true minus where it is signed, whole percents, one decimal on strokes, two on strokes gained. */
export function figureText(def: MetricDef, v: number | null): string {
  if (v == null) return NO_DATA;
  if (def.unit === '%') return `${Math.round(v)}%`;
  if (def.unit === 'sg') return formatSigned(v, 2);
  return SIGNED.has(def.key) ? formatSigned(v, 1) : formatFixed(v, 1);
}

/** The sample under a figure, in words: "11 rounds", "46 holes", "Only 2 rounds". */
export function sampleWords(def: MetricDef, f: SideFigure): string {
  const unit = def.floor === 'holes' ? 'hole' : def.floor === 'counting' ? 'team round' : 'round';
  const n = def.floor === 'holes' ? (f.result.of ?? 0) : f.result.n;
  const count = plural(n, unit);
  if (f.state === 'none') return f.result.value == null && def.needs === 'shot data' ? 'No shot data' : 'No data';
  return f.state === 'early' ? `Early read · ${count}` : count;
}

export type Verdict = { kind: 'diff'; diff: number; se: number | null } | { kind: 'none'; why: string };

/** A minus B for a metric, with the standard error of that difference, or why there is none. */
export function verdict(def: MetricDef, a: SideFigure, b: SideFigure): Verdict {
  if (a.result.value == null || b.result.value == null || a.state === 'none' || b.state === 'none') {
    const f = TOUR_FLOORS[def.floor];
    if (a.result.value == null && b.result.value == null && def.needs === 'shot data') return { kind: 'none', why: 'Needs shot data on both sides' };
    if (a.result.value != null && b.result.value != null) return { kind: 'none', why: `Needs ${plural(f.show, f.unit)} on both sides` };
    return { kind: 'none', why: def.needs === 'shot data' ? 'Needs shot data on both sides' : 'No rounds on one side' };
  }
  const kind = def.unit === 'sg' ? 'sg' : def.key === 'score_avg' || def.key === 'to_par_avg' || def.key === 'vs_field' ? 'score' : null;
  return { kind: 'diff', diff: a.result.value - b.result.value, se: changeSe(a.values, b.values, kind, a.result.n, b.result.n) };
}

/** The unit `DeltaChip` writes a difference in. */
export const deltaUnit = (def: MetricDef) => (def.diffUnit === 'pts' ? 'pts' : def.diffUnit === 'sg' ? 'sg' : 'strokes');

/** "Oakmont R3", "Qualifier round", "Practice round", "Practice · 9 holes". */
export function roundLabel(r: ChTourCompareRound, events: readonly ChTourEvent[]): string {
  if (r.eventId) return `${events.find((e) => e.id === r.eventId)?.short ?? 'Event'} R${r.roundNumber ?? ''}`.trim();
  if (r.context === 'qualifier') return 'Qualifier round';
  return r.holes === 9 ? 'Practice · 9 holes' : 'Practice round';
}

/** What a figure rests on, for the evidence drawer: the formula, the sample, every round in the side and why it was left out. */
export function figureEvidence(args: {
  def: MetricDef;
  figure: SideFigure;
  side: 'a' | 'b';
  title: string;
  rounds: readonly ChTourCompareRound[];
  events: readonly ChTourEvent[];
  firstName: (playerId: string) => string;
  courseName: (courseId: string) => string;
}): ChTourEvidenceRef {
  const { def, figure, rounds, events } = args;
  const used = new Map(figure.result.perRound.map((p) => [p.roundId, p.value]));
  const out = new Map(figure.result.excluded.map((x) => [x.roundId, x]));
  const per = (v: number) => (def.unit === '%' ? `${Math.round(v)}%` : def.unit === 'sg' ? formatSigned(v, 2) : formatFixed(v, 1));
  const n = def.floor === 'holes' ? (figure.result.of ?? 0) : figure.result.n;
  return {
    title: `${def.label} · ${args.side.toUpperCase()}`,
    figure: figureText(def, figure.result.value),
    formula: `${def.formula}. ${args.title}.`,
    denominator: def.floor === 'holes' ? `${n} holes` : plural(n, 'round'),
    rounds: [...rounds]
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .map((r) => {
        const value = used.get(r.id);
        const ex = out.get(r.id);
        return {
          key: r.id,
          label: `${roundLabel(r, events)} · ${args.firstName(r.playerId)} · ${args.courseName(r.courseId)} · ${r.score} (${formatToPar(r.toPar)})`,
          date: r.date,
          value: value == null ? NO_DATA : per(value),
          included: value != null,
          reason: null,
          reasonWords: ex ? exclusionWords(ex) : value == null ? 'Not part of this figure' : 'Used',
        };
      }),
  };
}

/** Dates as the timeline writes them. */
export const dayWords = (iso: string) => tourDay(iso, { month: 'short', day: 'numeric' });
