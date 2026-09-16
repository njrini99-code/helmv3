import { LIE_LABELS, lieDisplayPolicy, type LieClass, type LieDisplay, type LiePosteriorEntry } from './lie-classifier';

/** Presentation-level lie copy (master plan §45–48). The stored posterior is
 * mathematical evidence and is never altered here; this only chooses the
 * words a golfer reads. §45: ≥ .90 reads clean, .70–.90 reads "Likely",
 * under .70 with two dominant classes reads both. §46: a tee/rough split at
 * hole start is "Near tee edge". §47: the phone sits with the golfer, not
 * with a ball in the water, so water reads "Near water" and asks for the
 * penalty/drop workflow instead of declaring the lie. §48: a boundary call
 * on an unreviewed feature is "Surface uncertain", not a confident split. */
export type LieRule = 'clean' | 'likely' | 'dual' | 'tee_edge' | 'near_water' | 'weak_source' | 'unmapped';
export interface LiePresentationContext {
  /** Derived shots completed on the hole before this mark; 0 is hole start. */
  completedShots: number;
  /** Review state of the primary feature; null when unknown (derived bands). */
  primaryReviewed: boolean | null;
}
export interface LiePresentation {
  label: string;
  primary: LieClass;
  secondary: LieClass | null;
  display: LieDisplay;
  rule: LieRule;
  pMax: number;
  /** §47: a hazard call that needs the penalty/drop workflow before it is a lie. */
  needsPenaltyWorkflow: boolean;
}
/** PROVISIONAL — CALIBRATE ON PEEK'N PEAK: the share of water that earns "Near water",
 * and the share a second class needs to be named beside the first. */
export const LIE_PRESENTATION = Object.freeze({ waterOverlapP: .2, secondClassP: .15 });
const lower = (lie: LieClass) => LIE_LABELS[lie].toLowerCase();
const ROUGH: readonly LieClass[] = ['primary_rough', 'secondary_rough', 'fairway', 'woods'];
export function presentLie(posterior: readonly LiePosteriorEntry[], primaryLie: LieClass, context: LiePresentationContext): LiePresentation {
  const sorted = [...posterior].sort((a, b) => b.p - a.p);
  const pMax = sorted.find(e => e.lieClass === primaryLie)?.p ?? sorted[0]?.p ?? 0;
  const display = lieDisplayPolicy(pMax);
  const second = sorted.find(e => e.lieClass !== primaryLie) ?? null;
  const secondary = second && second.p >= LIE_PRESENTATION.secondClassP ? second.lieClass : null;
  const base = { primary: primaryLie, secondary, display, pMax, needsPenaltyWorkflow: false };
  if (primaryLie === 'UNKNOWN') return { ...base, label: LIE_LABELS.UNKNOWN, rule: 'unmapped', secondary: null };
  const water = sorted.find(e => e.lieClass === 'water')?.p ?? 0;
  if (primaryLie === 'water' || water >= LIE_PRESENTATION.waterOverlapP) {
    const dry = sorted.find(e => e.lieClass !== 'water' && e.lieClass !== 'UNKNOWN') ?? null;
    return { ...base, label: 'Near water', rule: 'near_water', secondary: dry?.lieClass ?? null, needsPenaltyWorkflow: true };
  }
  if (context.completedShots === 0 && display !== 'clean' && secondary) {
    const pair = [primaryLie, secondary];
    if (pair.includes('tee') && pair.some(l => ROUGH.includes(l))) return { ...base, label: 'Near tee edge', rule: 'tee_edge' };
  }
  if (display === 'clean') return { ...base, label: LIE_LABELS[primaryLie], rule: 'clean', secondary: null };
  if (display === 'cue' || !secondary) return { ...base, label: `Likely ${lower(primaryLie)}`, rule: 'likely', secondary: display === 'cue' ? null : secondary };
  if (context.primaryReviewed === false) return { ...base, label: 'Surface uncertain', rule: 'weak_source' };
  return { ...base, label: `${LIE_LABELS[primaryLie]} / ${lower(secondary)}`, rule: 'dual' };
}
