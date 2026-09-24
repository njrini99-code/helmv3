/**
 * Tendencies: the genome vector's character traits, worded for a ledger.
 *
 * These are the dimensions that describe HOW a player plays rather than how
 * well they score a skill, so they have no team or Tour baseline and are never
 * drawn on the strand. Dimensions that duplicate a strand metric are left out
 * (pressure_delta, par3_proficiency), and so is scrambling_rate, whose 90-day
 * window disagrees with the stats-cache scrambling figure under the same name.
 *
 * Values are the stored vector values, re-expressed in plain units. Nothing is
 * recomputed. A retired or uncomputed dimension reads "Needs more rounds"; the
 * weather stub reads "Not tracked" because no amount of golf resolves it.
 */

import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

export type TendencyStatus = 'live' | 'locked' | 'not_tracked';

export interface Tendency {
  id: string;
  label: string;
  status: TendencyStatus;
  /** The dimension's own word ("Bomber", "Fades late"), when live. */
  word: string | null;
  /** The value in plain units, when live. */
  detail: string | null;
  /** 0–1 confidence mapped to a read word. */
  read: string | null;
}

const MINUS = '−';

function signed(n: number, digits: number): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(digits)}`;
}

function confidenceWord(c: number | null | undefined): string | null {
  if (c == null || !Number.isFinite(c)) return null;
  if (c >= 0.8) return 'Solid read';
  if (c >= 0.5) return 'Fair read';
  return 'Early read';
}

interface TendencyDef {
  id: string;
  label: string;
  notTracked?: boolean;
  detail: (v: number) => string;
}

const DEFS: readonly TendencyDef[] = [
  {
    id: 'driver_usage',
    label: 'Driver off the tee',
    detail: (v) => `${Math.round(v * 100)}% of tee shots`,
  },
  {
    id: 'miss_side_bias',
    label: 'Approach miss side',
    // value = (right − left) / side misses, so the right share is (1 + v) / 2.
    detail: (v) => {
      const right = Math.round(((1 + v) / 2) * 100);
      return right >= 50 ? `${right}% of side misses go right` : `${100 - right}% of side misses go left`;
    },
  },
  {
    id: 'back_nine_delta',
    label: 'Back nine',
    detail: (v) => `${signed(v, 2)} strokes a hole vs the front`,
  },
  {
    id: 'scoring_trend',
    label: 'Scoring trend',
    detail: (v) => `${signed(v, 2)} strokes a round, last 30 days vs before`,
  },
  {
    id: 'weather_sensitivity_stub',
    label: 'Weather',
    notTracked: true,
    detail: () => '',
  },
];

export function buildTendencies(vector: GenomeVector | null): Tendency[] {
  return DEFS.map((def) => {
    if (def.notTracked) {
      return { id: def.id, label: def.label, status: 'not_tracked', word: null, detail: null, read: null };
    }
    const r = vector?.[def.id];
    if (!r || typeof r.value !== 'number' || !Number.isFinite(r.value)) {
      return { id: def.id, label: def.label, status: 'locked', word: null, detail: null, read: null };
    }
    return {
      id: def.id,
      label: def.label,
      status: 'live',
      word: r.label ?? null,
      detail: def.detail(r.value),
      read: confidenceWord(r.confidence),
    };
  });
}

/**
 * The archetype line under the player's name, from the two tendencies that
 * describe a player's shape: tee profile and miss side. Null when neither is
 * live, so the masthead never invents a persona.
 */
export function buildArchetype(vector: GenomeVector | null): string | null {
  if (!vector) return null;
  const parts: string[] = [];
  const driver = vector['driver_usage'];
  if (driver && typeof driver.value === 'number' && driver.label) {
    parts.push(driver.label === 'Layback profile' ? 'Lays back off the tee' : `${driver.label} off the tee`);
  }
  const miss = vector['miss_side_bias'];
  if (miss && typeof miss.value === 'number' && miss.label && miss.label !== 'Symmetric') {
    parts.push(`misses ${miss.label.toLowerCase().replace(' bias', '')}`);
  }
  if (parts.length === 0) return null;
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
