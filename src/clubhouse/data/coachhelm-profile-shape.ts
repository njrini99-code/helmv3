import { confidenceLabel, confidenceTier, type ConfidenceTier } from '@/lib/coachhelm/confidence-label';
import { formatGenomeRefreshed } from '@/lib/coachhelm/v3/genome/format-refreshed';
import type { LoadedGenome } from '@/lib/coachhelm/v3/genome/loader';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { GENOME_WINDOW_DAYS, type DimensionResult } from '@/lib/coachhelm/v3/genome/types';
import { formatSigned } from '../lib/format';

/**
 * The player's Game profile (Clubhouse P013, `?view=profile`): the genome the Fairway page's profile drill reads
 * (`loadGenome`, `derivePersona`, `GENOME_DIMENSIONS`), shaped for the screen. Pure, so the loader, the preview and the tests
 * run this one function.
 *
 * Doctrine carried over from Fairway's own retirement of the radar (`PlayerGenomeProfile`): the radar-normalised 0 to 100 score
 * is never printed. It was a score with no baseline behind it, and read as a grade it is not. Every measure here shows its real
 * value in its own unit, on its own scale; the normalised score decides nothing on screen (the persona's strengths and
 * watch-outs, which use it, are read from `derivePersona` as they are).
 *
 * What is not stored: a measure's own sample size. The genome keeps a value and a 0 to 1 confidence per measure and one
 * `rounds_basis` for the row, so the screen shows those two and the window, and says which of the two it is showing.
 */

export type ChMeasureStance = 'strength' | 'watch';
/** How a measure is coloured: green for what is working, amber for what is not, plain for a profile with no good side. */
export type ChMeasureTone = 'good' | 'warn' | 'plain';

export interface ChMeasureScale {
  min: number;
  max: number;
  /** Where "no difference" sits (zero for a gap), or null for a share, which has none. */
  anchor: number | null;
  /** The words under the two ends of the scale. */
  low: string;
  high: string;
}

export interface ChMeasure {
  id: string;
  /** The measure's own name (`GENOME_DIMENSIONS`). */
  label: string;
  /** The family it belongs to, in plain words ("Miss pattern"). */
  category: string;
  /** Not enough rounds yet, or a value that is not a number: nothing is drawn as if it were known. */
  locked: boolean;
  /** The word the measure itself gave ("Fades late"); null when locked or when it gave none. */
  headline: string | null;
  /** The value in its unit, true minus and all: "+0.31", "71% left", "38%". */
  figure: string | null;
  /** What the figure is a figure of: "strokes per hole, back nine vs front nine". */
  figureNote: string | null;
  /** Set when the stored value sits at the end of the scale it is clamped to: a bound, not a measurement. */
  bound: string | null;
  /** The persona's call (`derivePersona`): in its strengths or in its watch-outs; null for every other measure. */
  stance: ChMeasureStance | null;
  /** The colour: the persona's call when there is one, else the verdict in the word the measure itself gave (`LABEL_TONE`). */
  tone: ChMeasureTone;
  /** What it means, in plain words. */
  meaning: string | null;
  /** How it is measured. */
  measured: string | null;
  /** The least data a read needs. */
  floor: string | null;
  scale: ChMeasureScale | null;
  /** The marker's place on the scale, 0 to 100; null when locked. */
  pos: number | null;
  /** The confidence read, in the canonical words (Solid, Early, Thin); null when the measure has none. */
  read: { level: 1 | 2 | 3; word: string } | null;
}

export interface ChProfileStand {
  id: string;
  label: string;
  /** The measure's own word ("Wizard"). */
  word: string | null;
  figure: string | null;
}

export interface ChProfile {
  /** `empty`: no measure has enough rounds. `partial`: some do. `full`: all of them. */
  state: 'empty' | 'partial' | 'full';
  /** The window every measure reads (`GENOME_WINDOW_DAYS`), in days. */
  windowDays: number;
  /** Completed rounds inside that window (`rounds_basis`); null when there is no row yet. */
  rounds: number | null;
  /** "yesterday", "Sep 30, 2026"; null when the row carries no date. */
  refreshed: string | null;
  /** One sentence on the shape of the game (`derivePersona`); null until there is something to say. */
  courseProfile: string | null;
  strengths: ChProfileStand[];
  watchouts: ChProfileStand[];
  /** Every measure in the registry's order, ready or locked. */
  measures: ChMeasure[];
  /** How many are ready. */
  ready: number;
}

interface MeasureCopy {
  category: string;
  meaning: string;
  measured: string;
  floor: string;
  scale: ChMeasureScale;
  /** The value is stored clamped to plus or minus this (the dimension's own cap). */
  clamp: number | null;
  figure: (v: number) => { figure: string; note: string };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Plain words and scales for the registry's seven measures, written from each dimension's own file
 * (`lib/coachhelm/v3/genome/dimensions/*`): its formula, its clamp and its minimum. A measure the registry gains without an entry
 * here is drawn with its name and the word it gave, and nothing else (`toMeasure`): no unit, so no number.
 */
const COPY: Record<string, MeasureCopy> = {
  miss_side_bias: {
    category: 'Miss pattern',
    meaning: 'Which side your approach misses finish on. An even split is the goal; a lopsided one is a pattern you can aim around.',
    measured: 'Left against right among approach misses that name a side. Short and long misses name no side, so they are not counted.',
    floor: 'At least 30 approach misses that name a side.',
    scale: { min: -1, max: 1, anchor: 0, low: 'Left', high: 'Right' },
    clamp: null,
    figure: (v) => {
      const left = Math.round(((1 - v) / 2) * 100);
      const right = 100 - left;
      if (left === 50) return { figure: 'Even', note: 'left and right split evenly' };
      return left > right ? { figure: `${left}% left`, note: `of the misses that name a side (${right}% right)` } : { figure: `${right}% right`, note: `of the misses that name a side (${left}% left)` };
    },
  },
  pressure_delta: {
    category: 'Under pressure',
    meaning: 'How your scoring changes when it counts: tournaments and qualifiers against practice rounds.',
    measured: 'Average score to par in tournament and qualifier rounds minus practice rounds, on an 18-hole basis. Above zero is a worse score under pressure.',
    floor: 'At least 4 tournament or qualifier rounds and 4 practice rounds in the window.',
    scale: { min: -3, max: 3, anchor: 0, low: 'Scores better', high: 'Scores worse' },
    clamp: 3,
    figure: (v) => ({ figure: formatSigned(v, 2), note: 'strokes per 18 holes, tournaments against practice' }),
  },
  scrambling_rate: {
    category: 'Recovery',
    meaning: 'How often you save par or better after missing the green.',
    measured: 'The share of greens you missed where you still made par or better.',
    floor: 'At least 15 missed greens with a score.',
    scale: { min: 0, max: 1, anchor: null, low: '0%', high: '100%' },
    clamp: null,
    figure: (v) => ({ figure: pct(v), note: 'of missed greens saved for par or better' }),
  },
  par3_proficiency: {
    category: 'Course fit',
    meaning: 'How you score on par 3s against par. It points to the kind of course that suits you.',
    measured: 'Average score to par on par-3 holes, strokes per hole. Below zero is under par.',
    floor: 'At least 16 par-3 holes, about four rounds.',
    scale: { min: -2, max: 2, anchor: 0, low: 'Under par', high: 'Over par' },
    clamp: 2,
    figure: (v) => ({ figure: formatSigned(v, 2), note: 'strokes to par per par 3' }),
  },
  back_nine_delta: {
    category: 'Stamina',
    meaning: 'Whether your scoring holds up over the round.',
    measured: 'Average score to par on holes 10 to 18 minus holes 1 to 9. Above zero is a worse back nine.',
    floor: 'At least 5 rounds in the window.',
    scale: { min: -2, max: 2, anchor: 0, low: 'Closes stronger', high: 'Fades late' },
    clamp: 2,
    figure: (v) => ({ figure: formatSigned(v, 2), note: 'strokes per hole, back nine against front nine' }),
  },
  scoring_trend: {
    category: 'Momentum',
    meaning: 'Whether your scores are moving the right way lately.',
    measured: 'Average score to par over the last 30 days minus the 60 days before. Below zero is improving.',
    floor: 'At least 3 rounds in the last 30 days and 3 in the 60 days before.',
    scale: { min: -2, max: 2, anchor: 0, low: 'Improving', high: 'Regressing' },
    clamp: 2,
    figure: (v) => ({ figure: formatSigned(v, 2), note: 'strokes per round, last 30 days against the 60 before' }),
  },
  driver_usage: {
    category: 'Strategy',
    meaning: 'How often you reach for driver off the tee. A profile of how you play the holes, not a grade.',
    measured: 'The share of tee shots hit with driver. Only driver and not-driver are told apart.',
    floor: 'At least 40 tee shots with a recorded club.',
    scale: { min: 0, max: 1, anchor: null, low: 'Fewer drivers', high: 'More driver' },
    clamp: null,
    figure: (v) => ({ figure: pct(v), note: 'of tee shots with driver' }),
  },
};

/**
 * The verdict inside the words the dimensions give a value (`lib/coachhelm/v3/genome/dimensions/*`, each `label`): a measure is drawn
 * in the colour of its own word when the persona has made no call on it, so "Wizard" is not drawn as plainly as "Mixed". The words
 * a profile has no good side for (a left or right bias, how often driver is used) and the middle ones are plain. The tests read the
 * dimension files, so a word renamed there cannot silently drop out of this list.
 */
export const LABEL_TONE: Readonly<Record<string, ChMeasureTone>> = {
  Wizard: 'good',
  'Under par': 'good',
  'Closes strong': 'good',
  Improving: 'good',
  'Thrives on pressure': 'good',
  Symmetric: 'good',
  Leaky: 'warn',
  'Bleeds shots': 'warn',
  'Fades late': 'warn',
  Regressing: 'warn',
  'Tightens up': 'warn',
};

const READ_LEVEL: Record<ConfidenceTier, 1 | 2 | 3> = { solid: 3, early: 2, thin: 1 };

function readOf(confidence: number | null): ChMeasure['read'] {
  const tier = confidenceTier(confidence);
  const word = confidenceLabel(confidence);
  return tier && word ? { level: READ_LEVEL[tier], word } : null;
}

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));

/** One measure from the registry and what the row stores for it. Exported for the tests, which draw a measure the registry has no copy for. */
export function toMeasure(id: string, label: string, r: DimensionResult | undefined, stance: ChMeasureStance | null): ChMeasure {
  const copy = COPY[id];
  const base = { id, label, category: copy?.category ?? 'Measure', meaning: copy?.meaning ?? null, measured: copy?.measured ?? null, floor: copy?.floor ?? null, scale: copy?.scale ?? null };
  const value = r && typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null;
  if (value == null) return { ...base, locked: true, headline: null, figure: null, figureNote: null, bound: null, stance: null, tone: 'plain', pos: null, read: null };
  // A measure with no copy has no unit to put a number in, so it shows the word it gave and nothing else.
  const shown = copy?.figure(value) ?? null;
  const atEdge = copy?.clamp != null && Math.abs(value) >= copy.clamp;
  return {
    ...base,
    locked: false,
    headline: r?.label?.trim() || null,
    figure: shown?.figure ?? null,
    figureNote: shown?.note || null,
    bound: atEdge ? 'This is the edge of the scale, so the real gap may be larger.' : null,
    stance,
    tone: stance === 'strength' ? 'good' : stance === 'watch' ? 'warn' : (r?.label ? LABEL_TONE[r.label.trim()] : undefined) ?? 'plain',
    pos: copy ? clamp100(((value - copy.scale.min) / (copy.scale.max - copy.scale.min)) * 100) : null,
    read: readOf(r?.confidence ?? null),
  };
}

/** The persona's course-profile sentence, or null while it is only the placeholder for "not enough yet". */
const PLACEHOLDER = /^Not enough rounds yet/;

/**
 * The genome row as the screen draws it. `genome` null is a player with nothing computed (no row, or a row whose measures all
 * refused or were retired: `loadGenome` makes the two the same); `now` is for the "refreshed" wording.
 */
export function toChProfile(genome: LoadedGenome | null, now: Date = new Date()): ChProfile {
  const vector = genome?.vector ?? {};
  const persona = genome ? derivePersona(vector) : null;
  const stanceOf = (id: string): ChMeasureStance | null => (persona?.strengths.some((s) => s.dim_id === id) ? 'strength' : persona?.watchouts.some((w) => w.dim_id === id) ? 'watch' : null);
  const measures = GENOME_DIMENSIONS.map((d) => toMeasure(d.id, d.label, vector[d.id], stanceOf(d.id)));
  const byId = new Map(measures.map((m) => [m.id, m]));
  const stand = (e: { dim_id: string; label: string; qualitative: string | null }): ChProfileStand => {
    const m = byId.get(e.dim_id);
    return { id: e.dim_id, label: e.label, word: e.qualitative, figure: m?.figure ?? null };
  };
  const ready = measures.filter((m) => !m.locked).length;
  return {
    state: ready === 0 ? 'empty' : ready < measures.length ? 'partial' : 'full',
    windowDays: GENOME_WINDOW_DAYS,
    rounds: genome ? genome.rounds_basis : null,
    refreshed: genome ? formatGenomeRefreshed(genome.computed_at, now) : null,
    courseProfile: persona && !PLACEHOLDER.test(persona.course_profile) ? persona.course_profile : null,
    strengths: (persona?.strengths ?? []).map(stand),
    watchouts: (persona?.watchouts ?? []).map(stand),
    measures,
    ready,
  };
}
