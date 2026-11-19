/**
 * What the model is shown, and therefore what the checker accepts.
 *
 * One projection (`payloadFor`) feeds both the prompt and the checker's pool of numbers and dates: a number the model
 * never saw can never pass, and in the player view a teammate's figure is not in the projection, so it is neither in
 * the prompt nor accepted in the text. The projection carries no ids (rounds go by date) and no test statistics
 * (p-values, degrees of freedom): only what a coach could be told.
 *
 * Pure: no model, no database, no clock.
 */
import type { Candidate, CandidateRef, Notability, PriorityWhere, Reason } from '../notability';
import { withoutCoachOnly, type FactSheet, type MeasureArea, type PatternFact, type WindowFigure } from '../types';
import type { AdviceArea, WriterView } from './types';

const r2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export interface PayloadPattern {
  label: string;
  unit: 'percent' | 'feet';
  value: number | null;
  count: number;
  of: number;
  not_traced?: string;
  /** Coach view only. */
  team_median?: number | null;
}

export interface PayloadFigure {
  window: string;
  rounds: number;
  value: number | null;
  attempts: number;
  withheld?: string;
}

export interface PayloadMeasure {
  label: string;
  unit: string;
  direction: string;
  last10: PayloadFigure;
  previous10: PayloadFigure | null;
  season: PayloadFigure;
  /** Coach view only: the teammates' median over their own last 10 rounds. */
  team_median?: number | null;
  team_size?: number;
}

export interface PayloadReason {
  rule: 'changed' | 'stands_out_in_team' | 'biggest_cost';
  verdict: 'worse' | 'better';
  compared_with: string;
  player: number;
  against: number;
  difference: { value: number; low: number; high: number };
  strokes_per_round: { value: number; low: number; high: number } | null;
}

export interface PayloadCandidate {
  label: string;
  area: MeasureArea;
  rank: number;
  reasons: PayloadReason[];
  supporting: string[];
}

export interface WriterPayload {
  view: WriterView;
  as_of: string;
  season_start: string;
  tour: 'pga' | 'lpga';
  windows: { last10: { rounds: number; from: string | null; to: string | null }; season: { rounds: number; from: string | null; to: string | null } };
  priority: {
    label: string;
    area: MeasureArea;
    measured_rounds: number;
    strokes_lost_per_round: { value: number; low: number; high: number };
    certainty: 'clear' | 'likely' | 'leaning';
    certainty_why: string;
    against_own_other_areas: { value: number; low: number; high: number };
    areas: Array<{ label: string; strokes_gained_per_round: number }>;
    where: {
      finding: PriorityWhere['finding'];
      why: string;
      bands: Array<{ band: string; label: string; shots: number; rounds: number; strokes_lost_per_round: number }>;
      named_band: { band: string; label: string; named: boolean; strokes_lost_per_round: number } | null;
      patterns: PayloadPattern[];
      lead_pattern: (PayloadPattern & { differs_from_team?: boolean; direction?: 'above' | 'below' | null }) | null;
      /** The rounds behind it, by date (no ids). */
      evidence: Array<{ date: string; shots: number; strokes_gained: number }>;
    };
    /** Coach view only. */
    team_shape?: { team_worst_area: string; same_as_team: boolean; team_median: number; teammates: number; difference: number; verdict: string };
  };
  candidates: PayloadCandidate[];
  good_news: Array<{ label: string; area: MeasureArea; reasons: PayloadReason[] }>;
  measures: PayloadMeasure[];
  notes: string[];
  /** The advice areas `this_week` may be about: the priority's and the candidates'. */
  advice_areas: AdviceArea[];
}

const AREA_LABEL: Record<string, string> = {
  strokes_gained_off_the_tee: 'off the tee',
  strokes_gained_approach: 'approach shots',
  strokes_gained_around_the_green: 'around the green',
  strokes_gained_putting: 'putting',
};

const COMPARED: Record<Reason['compared']['with'], string> = {
  own_previous_window: "the player's own 10 rounds before these",
  team_median: "the teammates' median",
  own_other_areas: "the player's own other three areas",
};

function figure(f: WindowFigure): PayloadFigure {
  return { window: f.window.label, rounds: f.window.rounds, value: f.value === null ? null : r2(f.value), attempts: f.sample.attempts, ...(f.withheld ? { withheld: f.withheld } : {}) };
}

function pattern(p: PatternFact, view: WriterView): PayloadPattern {
  return {
    label: p.label,
    unit: p.unit,
    value: p.value === null ? null : r2(p.value),
    count: p.count,
    of: p.of,
    ...(p.not_traced ? { not_traced: p.not_traced } : {}),
    ...(view === 'coach' && p.team ? { team_median: p.team.median === null ? null : r2(p.team.median) } : {}),
  };
}

function reason(r: Reason): PayloadReason {
  const s = r.strokes_at_stake;
  return {
    rule: r.rule,
    verdict: r.verdict,
    compared_with: COMPARED[r.compared.with],
    player: r2(r.compared.player.value),
    against: r2(r.compared.against.value),
    difference: { value: r2(r.difference.value), low: r2(r.difference.low), high: r2(r.difference.high) },
    strokes_per_round: s ? { value: r2(s.per_round), low: r2(s.low), high: r2(s.high) } : null,
  };
}

/** The reasons a view may see: a player never sees a comparison with teammates. */
const visibleReasons = (reasons: readonly Reason[], view: WriterView): Reason[] => (view === 'coach' ? [...reasons] : reasons.filter((r) => r.rule !== 'stands_out_in_team'));

const ADVICE_AREA: Partial<Record<MeasureArea, AdviceArea>> = {
  off_the_tee: 'off_the_tee',
  approach: 'approach',
  around_the_green: 'around_the_green',
  putting: 'putting',
  scoring: 'scoring',
  pressure: 'scoring',
  course_management: 'scoring',
};

/**
 * The projection. Null when there is nothing to write about (no priority). In the player view the sheet is passed
 * through `withoutCoachOnly` again whatever the caller handed in, and every coach-only part of the notability is left
 * out: the priority's team shape, the patterns' team medians, whether the lead pattern differs from the team, and every
 * reason that compares with teammates (a candidate or good news left with no reason is dropped).
 */
export function payloadFor(sheetIn: FactSheet, n: Notability, view: WriterView): WriterPayload | null {
  const p = n.priority;
  if (!p) return null;
  const sheet = view === 'player' ? withoutCoachOnly(sheetIn) : sheetIn;

  const candidates: PayloadCandidate[] = n.candidates
    .map((c: Candidate) => ({ c, reasons: visibleReasons(c.reasons, view) }))
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ c, reasons }) => ({
      label: c.label,
      area: c.area,
      rank: c.rank,
      reasons: reasons.map(reason),
      supporting: c.supporting.filter((s) => visibleReasons(s.reasons, view).length > 0).map((s) => s.label),
    }));
  const goodNews = n.good_news
    .map((g: CandidateRef) => ({ g, reasons: visibleReasons(g.reasons, view) }))
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ g, reasons }) => ({ label: g.label, area: g.area, reasons: reasons.map(reason) }));

  const areas = new Set<MeasureArea>([p.area, ...candidates.map((c) => c.area)]);
  const supportingIds = new Set(n.candidates.flatMap((c) => [c.measure_id, ...c.supporting.map((s) => s.measure_id)]));
  const measures: PayloadMeasure[] = sheet.measures
    .filter((m) => !m.estimated && (areas.has(m.area) || supportingIds.has(m.id)))
    .map((m) => ({
      label: m.label,
      unit: m.unit,
      direction: m.direction,
      last10: figure(m.current),
      previous10: m.previous ? figure(m.previous) : null,
      season: figure(m.season),
      ...(view === 'coach' && m.team ? { team_median: m.team.median === null ? null : r2(m.team.median), team_size: m.team.n } : {}),
    }));

  const w = p.where;
  const lead = w.lead_pattern;
  const advice = new Set<AdviceArea>();
  for (const a of areas) {
    const mapped = ADVICE_AREA[a];
    if (mapped) advice.add(mapped);
  }

  return {
    view,
    as_of: sheet.as_of,
    season_start: sheet.season_start,
    tour: sheet.tour,
    windows: {
      last10: { rounds: sheet.windows.last10.rounds, from: sheet.windows.last10.from, to: sheet.windows.last10.to },
      season: { rounds: sheet.windows.season.rounds, from: sheet.windows.season.from, to: sheet.windows.season.to },
    },
    priority: {
      label: p.label,
      area: p.area,
      measured_rounds: p.rounds,
      strokes_lost_per_round: { value: r2(p.strokes_per_round.value), low: r2(p.strokes_per_round.low), high: r2(p.strokes_per_round.high) },
      certainty: p.certainty,
      certainty_why: p.certainty_why,
      against_own_other_areas: { value: r2(p.against_own_other_areas.value), low: r2(p.against_own_other_areas.low), high: r2(p.against_own_other_areas.high) },
      areas: p.areas.map((a) => ({ label: AREA_LABEL[a.measure_id] ?? a.measure_id, strokes_gained_per_round: r2(a.strokes_gained_per_round) })),
      where: {
        finding: w.finding,
        why: w.why,
        bands: w.bands.map((b) => ({ band: b.band, label: b.label, shots: b.shots, rounds: b.rounds, strokes_lost_per_round: r2(b.strokes_per_round.value) })),
        named_band: w.band ? { band: w.band.band, label: w.band.label, named: w.band.named, strokes_lost_per_round: r2(w.band.strokes_per_round.value) } : null,
        patterns: w.patterns.map((x) => pattern(x, view)),
        lead_pattern: lead
          ? { ...pattern(lead, view), ...(view === 'coach' ? { differs_from_team: lead.differs_from_team, direction: lead.direction } : {}) }
          : null,
        evidence: w.evidence.map((e) => ({ date: e.date, shots: e.shots, strokes_gained: r2(e.strokes_gained) })),
      },
      ...(view === 'coach' && p.team_shape
        ? {
            team_shape: {
              team_worst_area: AREA_LABEL[p.team_shape.team_worst_area] ?? p.team_shape.team_worst_area,
              same_as_team: p.team_shape.same_as_team,
              team_median: r2(p.team_shape.player_vs_team.team_median),
              teammates: p.team_shape.player_vs_team.teammates,
              difference: r2(p.team_shape.player_vs_team.difference),
              verdict: p.team_shape.player_vs_team.verdict,
            },
          }
        : {}),
    },
    candidates,
    good_news: goodNews,
    measures,
    notes: [...sheet.notes],
    advice_areas: [...advice].sort(),
  };
}

// ── What the checker reads off the payload ─────────────────────────────────────────────────────────────────────────

/** Every number the payload states, as absolute values (a loss of 3.2 may be written "costs 3.2"). */
export function numberPool(payload: WriterPayload): number[] {
  const pool = new Set<number>([100]);
  const visit = (node: unknown): void => {
    if (typeof node === 'number' && Number.isFinite(node)) pool.add(Math.abs(node));
    else if (typeof node === 'string') {
      // Numbers written inside labels and reasons ("125 to 175 yards", "needs 10 putts"), dates aside.
      for (const m of node.replace(/\d{4}-\d{2}-\d{2}/g, ' ').matchAll(/\d+(?:\.\d+)?/g)) pool.add(Number(m[0]));
    } else if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') Object.values(node).forEach(visit);
  };
  visit(payload);
  return [...pool].sort((a, b) => a - b);
}

/** Every calendar date the payload states (YYYY-MM-DD). */
export function datePool(payload: WriterPayload): string[] {
  const dates = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node === 'string') for (const m of node.matchAll(/\d{4}-\d{2}-\d{2}/g)) dates.add(m[0]);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') Object.values(node).forEach(visit);
  };
  visit(payload);
  return [...dates].sort();
}

/** The labels the payload names: a banned cause word is allowed when one of these names it (a counted fact does). */
export function factLabels(payload: WriterPayload): string[] {
  const labels: string[] = [payload.priority.label, ...payload.priority.where.bands.map((b) => b.label), ...payload.priority.where.patterns.map((p) => p.label)];
  if (payload.priority.where.lead_pattern) labels.push(payload.priority.where.lead_pattern.label);
  for (const c of payload.candidates) labels.push(c.label, ...c.supporting);
  for (const m of payload.measures) labels.push(m.label);
  return labels;
}

/** True when the facts support a claim of change in this direction (rule (a) fired, in a candidate or good news). */
export function changeSupported(payload: WriterPayload, verdict: 'worse' | 'better'): boolean {
  return [...payload.candidates, ...payload.good_news].some((c) => c.reasons.some((r) => r.rule === 'changed' && r.verdict === verdict));
}

/**
 * The distances advice may prescribe, per unit. A distance must sit inside a band of an area the advice may be about;
 * when the priority names one band, the priority area's distances must sit inside THAT band.
 */
const BAND_BOUNDS: Record<string, Record<string, { unit: 'feet' | 'yards'; low: number; high: number }>> = {
  putting: {
    '0_3': { unit: 'feet', low: 0, high: 3 },
    '3_5': { unit: 'feet', low: 3, high: 5 },
    '5_10': { unit: 'feet', low: 5, high: 10 },
    '10_15': { unit: 'feet', low: 10, high: 15 },
    '15_25': { unit: 'feet', low: 15, high: 25 },
    '25_plus': { unit: 'feet', low: 25, high: 120 },
  },
  approach: {
    under_50: { unit: 'yards', low: 0, high: 50 },
    '50_125': { unit: 'yards', low: 50, high: 125 },
    '125_175': { unit: 'yards', low: 125, high: 175 },
    '175_plus': { unit: 'yards', low: 175, high: 300 },
    layup: { unit: 'yards', low: 175, high: 600 },
  },
};

/** Whole-area ranges for areas whose bands are not distances. */
const AREA_RANGE: Record<string, Array<{ unit: 'feet' | 'yards'; low: number; high: number }>> = {
  around_the_green: [
    { unit: 'yards', low: 0, high: 50 },
    { unit: 'feet', low: 0, high: 150 },
  ],
  off_the_tee: [{ unit: 'yards', low: 150, high: 400 }],
};

export function distanceAllowed(payload: WriterPayload, value: number, unit: 'feet' | 'yards'): boolean {
  const named = payload.priority.where.finding === 'band' ? payload.priority.where.named_band?.band ?? null : null;
  for (const area of payload.advice_areas) {
    const bands = BAND_BOUNDS[area];
    if (bands) {
      const allowed = area === payload.priority.area && named && bands[named] ? [bands[named]!] : Object.values(bands);
      if (allowed.some((b) => b.unit === unit && value >= b.low && value <= b.high)) return true;
    }
    if ((AREA_RANGE[area] ?? []).some((b) => b.unit === unit && value >= b.low && value <= b.high)) return true;
  }
  return false;
}
