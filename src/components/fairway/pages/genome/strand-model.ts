/**
 * Genome strand model: pure presentation logic for the Genome screen.
 *
 * The Genome answers "what kind of player is this, skill by skill, against a
 * baseline". The strand is built from the standing snapshot
 * (`golf_player_standing`, read through `loadPlayerStandingMap`), which already
 * carries the player value, the team average and the Tour reference for every
 * skill. Nothing here recomputes a stat: it only picks traits, signs the gap by
 * the metric's own improvement direction, and words the read honestly.
 *
 * Deliberately NOT on the strand:
 * - SG approach / putting / total. Where the strokes go is the Fingerprint's
 *   question. SG appears only where no other standing metric measures a
 *   family (off the tee, around the green).
 * - Genome dimensions that duplicate a standing metric (pressure_delta vs
 *   practice_tournament_delta, par3_proficiency vs scoring_par_3) or carry a
 *   different window under the same name (scrambling_rate, 90 days, vs the
 *   stats cache). One number per metric (spec §5).
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { getMetricDirection } from '@/lib/coachhelm/v3/metrics/registry';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

/* ------------------------------------------------------------------------- */
/* Inputs (serializable: the server page maps PlayerStanding into these)      */
/* ------------------------------------------------------------------------- */

/** One standing row, trimmed to what the strand reads. */
export interface StrandStandingInput {
  metric_id: string;
  player_value: number;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  pga_value: number | null;
  pga_omitted?: boolean;
  pga_omitted_reason?: 'no_womens_anchor' | 'basis_mismatch' | null;
  is_womens?: boolean;
}

/** Sample sizes the page loaded for each window the strand prints. */
export interface StrandSamples {
  /** `golf_player_stats_cache.rounds_in_calculation`: every round on file. */
  roundsOnFile: number | null;
  /** Completed rounds in the last 90 days (the round-metric window). */
  rounds90: number | null;
}

export type Baseline = 'team' | 'tour';

/* ------------------------------------------------------------------------- */
/* Trait catalogue                                                            */
/* ------------------------------------------------------------------------- */

export type FamilyId = 'tee' | 'approach' | 'short' | 'putting' | 'scoring' | 'pressure';

export interface Family {
  id: FamilyId;
  label: string;
  /** golf_player_focus_areas.area_type used when a trait becomes a focus. */
  areaType: string;
}

export const FAMILIES: readonly Family[] = [
  { id: 'tee', label: 'Tee', areaType: 'tee_game' },
  { id: 'approach', label: 'Approach', areaType: 'approach' },
  { id: 'short', label: 'Short', areaType: 'short_game' },
  { id: 'putting', label: 'Putting', areaType: 'putting' },
  { id: 'scoring', label: 'Scoring', areaType: 'other' },
  { id: 'pressure', label: 'Pressure', areaType: 'mental' },
];

/** Which population and window a trait's value was computed over. */
export type TraitWindow = 'rounds_on_file' | 'last_90_days' | 'tracked_shots';

type Unit = 'strokes_round' | 'percent' | 'feet' | 'strokes_hole' | 'per_round' | 'strokes';

interface TraitDef {
  id: MetricId;
  family: FamilyId;
  /** Full label for the ledger and the evidence sheet. */
  label: string;
  /** Short label for tight places (the strand readout on 320pt). */
  short: string;
  unit: Unit;
  window: TraitWindow;
}

/** Strand order: tee → approach (near to far) → short game → putting (near to far) → scoring → pressure. */
export const TRAITS: readonly TraitDef[] = [
  { id: 'sg_ott', family: 'tee', label: 'Off the tee', short: 'Tee', unit: 'strokes_round', window: 'rounds_on_file' },

  { id: 'approach_proximity_50_125ft', family: 'approach', label: 'Approach 50–125 yd', short: '50–125 yd', unit: 'feet', window: 'tracked_shots' },
  { id: 'approach_proximity_125_175ft', family: 'approach', label: 'Approach 125–175 yd', short: '125–175 yd', unit: 'feet', window: 'tracked_shots' },
  { id: 'approach_proximity_175_plus_ft', family: 'approach', label: 'Approach 175+ yd', short: '175+ yd', unit: 'feet', window: 'tracked_shots' },
  { id: 'gir_pct', family: 'approach', label: 'Greens in regulation', short: 'GIR', unit: 'percent', window: 'rounds_on_file' },

  { id: 'sg_around_green', family: 'short', label: 'Around the green', short: 'Around green', unit: 'strokes_round', window: 'rounds_on_file' },
  { id: 'scrambling_pct_sand', family: 'short', label: 'Sand saves', short: 'Sand', unit: 'percent', window: 'rounds_on_file' },

  { id: 'putts_made_3_5ft_pct', family: 'putting', label: 'Putts 3–5 ft', short: '3–5 ft', unit: 'percent', window: 'rounds_on_file' },
  { id: 'putts_made_5_10ft_pct', family: 'putting', label: 'Putts 5–10 ft', short: '5–10 ft', unit: 'percent', window: 'rounds_on_file' },
  { id: 'putts_made_10_15ft_pct', family: 'putting', label: 'Putts 10–15 ft', short: '10–15 ft', unit: 'percent', window: 'rounds_on_file' },
  { id: 'putts_made_15_25ft_pct', family: 'putting', label: 'Putts 15–25 ft', short: '15–25 ft', unit: 'percent', window: 'rounds_on_file' },
  { id: 'putts_made_25_plus_ft_pct', family: 'putting', label: 'Putts 25+ ft', short: '25+ ft', unit: 'percent', window: 'rounds_on_file' },

  { id: 'scoring_par_3', family: 'scoring', label: 'Par-3 scoring', short: 'Par 3', unit: 'strokes_hole', window: 'rounds_on_file' },
  { id: 'scoring_par_4', family: 'scoring', label: 'Par-4 scoring', short: 'Par 4', unit: 'strokes_hole', window: 'rounds_on_file' },
  { id: 'scoring_par_5', family: 'scoring', label: 'Par-5 scoring', short: 'Par 5', unit: 'strokes_hole', window: 'rounds_on_file' },
  { id: 'big_number_rate', family: 'scoring', label: 'Doubles or worse', short: 'Doubles+', unit: 'percent', window: 'rounds_on_file' },
  { id: 'penalty_rate_per_round', family: 'scoring', label: 'Penalties', short: 'Penalties', unit: 'per_round', window: 'rounds_on_file' },

  { id: 'practice_tournament_delta', family: 'pressure', label: 'Tournament vs practice', short: 'Tournaments', unit: 'strokes', window: 'last_90_days' },
  { id: 'opening_hole_delta', family: 'pressure', label: 'First hole', short: 'First hole', unit: 'strokes', window: 'last_90_days' },
];

/* ------------------------------------------------------------------------- */
/* Read words (never a percentage; owner decision)                            */
/* ------------------------------------------------------------------------- */

/** Below this many rounds a trait is an early read and draws ghosted. */
export const EARLY_READ_BELOW = 10;
/** At or above this many rounds a trait is a solid read. */
export const SOLID_READ_AT = 20;
/** Below this many team players the team average is itself thin. */
export const TEAM_FLOOR = 5;

export type ReadLevel = 'early' | 'fair' | 'solid';

export function readLevel(n: number | null): ReadLevel {
  if (n == null || n < EARLY_READ_BELOW) return 'early';
  if (n < SOLID_READ_AT) return 'fair';
  return 'solid';
}

export function readWord(level: ReadLevel): string {
  return level === 'early' ? 'Early read' : level === 'fair' ? 'Fair read' : 'Solid read';
}

export function windowLabel(w: TraitWindow): string {
  switch (w) {
    case 'rounds_on_file':
      return 'All rounds on file';
    case 'last_90_days':
      return 'Last 90 days';
    case 'tracked_shots':
      return 'Tracked approach shots';
  }
}

/* ------------------------------------------------------------------------- */
/* Formatting (SF tabular numerals are applied by the view; strings here)     */
/* ------------------------------------------------------------------------- */

const MINUS = '−';

function fixed(n: number, digits: number): string {
  return Math.abs(n).toFixed(digits);
}

function signed(n: number, digits: number): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? '+' : MINUS}${fixed(r, digits)}`;
}

function digitsFor(unit: Unit): number {
  switch (unit) {
    case 'percent':
    case 'feet':
      return 1;
    default:
      return 2;
  }
}

/** A trait's own value with its unit, e.g. "87.5%", "21.8 ft", "+1.98". */
export function formatValue(unit: Unit, v: number): string {
  const d = digitsFor(unit);
  switch (unit) {
    case 'percent':
      return `${fixed(v, d)}%`;
    case 'feet':
      return `${fixed(v, d)} ft`;
    case 'strokes_round':
    case 'strokes':
      return signed(v, d);
    case 'strokes_hole':
    case 'per_round':
      return v.toFixed(d);
  }
}

/** The unit an advantage is counted in, for captions ("pts", "ft", "strokes"). */
export function advantageUnit(unit: Unit): string {
  switch (unit) {
    case 'percent':
      return 'pts';
    case 'feet':
      return 'ft';
    case 'per_round':
      return 'per round';
    case 'strokes_hole':
      return 'per hole';
    default:
      return 'strokes';
  }
}

/** A signed advantage where + always means better than the baseline. */
export function formatAdvantage(unit: Unit, adv: number): string {
  return signed(adv, digitsFor(unit));
}

/* ------------------------------------------------------------------------- */
/* The strand                                                                 */
/* ------------------------------------------------------------------------- */

export interface BaselineRead {
  /** Baseline value, or null when there is none to compare against. */
  value: number | null;
  /** Signed advantage in the metric's own unit (+ = better), or null. */
  advantage: number | null;
  /** Advantage scaled to [-1, 1] by the metric's display range, or null. */
  magnitude: number | null;
  /** True when a baseline exists but is too thin to lean on. */
  thin: boolean;
  /** Why there is no comparison, worded for a caption. */
  missingReason: string | null;
}

export interface StrandTrait {
  id: MetricId;
  family: FamilyId;
  label: string;
  short: string;
  unit: Unit;
  window: TraitWindow;
  /** Null when the player has no standing row for this trait yet. */
  value: number | null;
  valueText: string | null;
  team: BaselineRead;
  tour: BaselineRead;
  /** Team percentile 0–100, or null when the team is cold-start. */
  teamPercentile: number | null;
  teamN: number;
  /** Rounds behind the value (null for shot-tracked traits: not stored). */
  n: number | null;
  read: ReadLevel;
  /** Label of the Tour line ("Tour", or "LPGA" for a women's anchor). */
  tourLabel: string;
}

function halfSpan(id: MetricId): number {
  const cfg = getMetricRenderConfig(id);
  if (!cfg) return 1;
  const span = (cfg.default_scale.max - cfg.default_scale.min) / 2;
  return span > 0 ? span : 1;
}

function baselineRead(
  id: MetricId,
  player: number | null,
  base: number | null,
  thin: boolean,
  missingReason: string | null,
): BaselineRead {
  if (player == null || base == null || !Number.isFinite(base)) {
    return { value: base ?? null, advantage: null, magnitude: null, thin, missingReason };
  }
  const sign = getMetricDirection(id) === 'lower_better' ? -1 : 1;
  const advantage = (player - base) * sign;
  const magnitude = Math.max(-1, Math.min(1, advantage / halfSpan(id)));
  return { value: base, advantage, magnitude, thin, missingReason: null };
}

function tourMissingReason(row: StrandStandingInput): string {
  if (row.pga_omitted_reason === 'basis_mismatch') return 'Not comparable to Tour yet';
  if (row.pga_omitted_reason === 'no_womens_anchor') return 'No LPGA reference';
  return 'No Tour reference';
}

function nFor(window: TraitWindow, samples: StrandSamples): number | null {
  if (window === 'rounds_on_file') return samples.roundsOnFile;
  if (window === 'last_90_days') return samples.rounds90;
  return null;
}

/** Builds every trait in strand order. Traits without a row stay, as gaps. */
export function buildStrand(rows: readonly StrandStandingInput[], samples: StrandSamples): StrandTrait[] {
  const byId = new Map(rows.map((r) => [r.metric_id, r]));
  return TRAITS.map((def) => {
    const row = byId.get(def.id) ?? null;
    const value = row && Number.isFinite(row.player_value) ? row.player_value : null;
    const teamThin = row ? row.team_n < TEAM_FLOOR : false;
    const tourOmitted = row ? row.pga_omitted === true || row.pga_value == null : false;
    const n = nFor(def.window, samples);
    // Shot-tracked traits carry no player n; their read follows the rounds on file.
    const read = readLevel(n ?? samples.roundsOnFile);
    return {
      id: def.id,
      family: def.family,
      label: def.label,
      short: def.short,
      unit: def.unit,
      window: def.window,
      value,
      valueText: value == null ? null : formatValue(def.unit, value),
      team: row
        ? baselineRead(def.id, value, row.team_avg, teamThin, row.team_avg == null ? 'No team average yet' : null)
        : baselineRead(def.id, null, null, false, 'Not measured yet'),
      tour: row
        ? tourOmitted
          ? { value: null, advantage: null, magnitude: null, thin: false, missingReason: tourMissingReason(row) }
          : baselineRead(def.id, value, row.pga_value, false, null)
        : baselineRead(def.id, null, null, false, 'Not measured yet'),
      teamPercentile: row && !teamThin ? row.team_pct : null,
      teamN: row?.team_n ?? 0,
      n,
      read,
      tourLabel: row?.is_womens ? 'LPGA' : 'Tour',
    };
  });
}

export function readFor(t: StrandTrait, baseline: Baseline): BaselineRead {
  return baseline === 'team' ? t.team : t.tour;
}

/** A trait is drawn solid only when it has a comparison and the read is not early. */
export function isGhost(t: StrandTrait, baseline: Baseline): boolean {
  const r = readFor(t, baseline);
  return r.magnitude == null || r.thin || t.read === 'early';
}

/** Traits ranked by advantage (largest edge first, largest gap last). */
export function rankTraits(traits: readonly StrandTrait[], baseline: Baseline): StrandTrait[] {
  const comparable = traits.filter((t) => readFor(t, baseline).magnitude != null);
  const missing = traits.filter((t) => readFor(t, baseline).magnitude == null && t.value != null);
  comparable.sort((a, b) => (readFor(b, baseline).magnitude ?? 0) - (readFor(a, baseline).magnitude ?? 0));
  return [...comparable, ...missing];
}

export interface StrandSummary {
  comparable: number;
  ahead: number;
  behind: number;
  best: StrandTrait | null;
  worst: StrandTrait | null;
}

export function summarize(traits: readonly StrandTrait[], baseline: Baseline): StrandSummary {
  const ranked = rankTraits(traits, baseline).filter((t) => readFor(t, baseline).magnitude != null);
  const ahead = ranked.filter((t) => (readFor(t, baseline).advantage ?? 0) > 0);
  const behind = ranked.filter((t) => (readFor(t, baseline).advantage ?? 0) < 0);
  return {
    comparable: ranked.length,
    ahead: ahead.length,
    behind: behind.length,
    best: ahead[0] ?? null,
    worst: behind.length > 0 ? behind[behind.length - 1] : null,
  };
}

function edgeClause(t: StrandTrait, baseline: Baseline): string {
  const r = readFor(t, baseline);
  return `${t.label.toLowerCase()} (${formatAdvantage(t.unit, r.advantage ?? 0)} ${advantageUnit(t.unit)})`;
}

/**
 * The one-sentence verdict. Built only from the strand; returns null when
 * there is nothing honest to say.
 */
export function buildVerdict(firstName: string, traits: readonly StrandTrait[], baseline: Baseline): string | null {
  const s = summarize(traits, baseline);
  if (s.comparable === 0) return null;
  const who = baseline === 'team' ? 'the team' : traits.find((t) => t.tourLabel === 'LPGA') ? 'the LPGA Tour' : 'the Tour';
  const head = `${firstName} is ahead of ${who} on ${s.ahead} of ${s.comparable} skills`;
  const parts: string[] = [];
  if (s.best) parts.push(`the clearest edge is ${edgeClause(s.best, baseline)}`);
  if (s.worst) parts.push(`the biggest gap is ${edgeClause(s.worst, baseline)}`);
  return parts.length > 0 ? `${head}; ${parts.join(', and ')}.` : `${head}.`;
}

/** Families in order with the traits that belong to each. */
export function groupByFamily(traits: readonly StrandTrait[]): Array<{ family: Family; traits: StrandTrait[] }> {
  return FAMILIES.map((family) => ({ family, traits: traits.filter((t) => t.family === family.id) }));
}

export function familyOf(id: FamilyId): Family {
  return FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];
}

/** Ordinal for a team percentile shown as a rank phrase ("top third"). */
export function percentilePhrase(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= 67) return 'Top third of the team';
  if (pct >= 34) return 'Middle of the team';
  return 'Bottom third of the team';
}

/* ------------------------------------------------------------------------- */
/* Head to head (compare)                                                     */
/* ------------------------------------------------------------------------- */

export interface HeadToHead {
  id: MetricId;
  label: string;
  unit: Unit;
  /** Signed margin in the metric's unit: + means player A is better. */
  margin: number;
  /** Margin scaled to [-1, 1] by the metric's display range. */
  magnitude: number;
}

/** Skill-by-skill margins for two strands built from the same catalogue. */
export function headToHead(a: readonly StrandTrait[], b: readonly StrandTrait[]): HeadToHead[] {
  const bById = new Map(b.map((t) => [t.id, t]));
  const out: HeadToHead[] = [];
  for (const ta of a) {
    const tb = bById.get(ta.id);
    if (!tb || ta.value == null || tb.value == null) continue;
    const sign = getMetricDirection(ta.id) === 'lower_better' ? -1 : 1;
    const margin = (ta.value - tb.value) * sign;
    out.push({
      id: ta.id,
      label: ta.label,
      unit: ta.unit,
      margin,
      magnitude: Math.max(-1, Math.min(1, margin / halfSpan(ta.id))),
    });
  }
  return out.sort((x, y) => Math.abs(y.magnitude) - Math.abs(x.magnitude));
}
