import { greenComplexProbability, type LiePosterior } from './lie-classifier';
import { holeStatus, type HoleStatus } from './hole-lifecycle';
import type { ShotAnchor, TerminalMethod } from './shot-anchor';

/** Master design §80: the hole integrity model. Flags are derived from the
 * anchors on record — never stored, never edited by hand — so the device,
 * the round ledger and a later review reach the same verdict from the same
 * marks. A CLEAN hole needs no editing and its completion card fades (§19);
 * a flagged hole exposes Review. Nothing here invents a mark: a missing cup
 * stays missing and a missing tee shot stays missing. */
export type HoleIntegrity = 'CLEAN' | 'MISSING_START' | 'MISSING_CUP' | 'LOW_LOCATION_QUALITY' | 'UNKNOWN_SURFACE' | 'PENALTY_UNRESOLVED' | 'SEQUENCE_ANOMALY';
export type HoleIntegrityFlag = Exclude<HoleIntegrity, 'CLEAN'>;
/** Review order: what changes the score first, what weakens the distances last. */
export const INTEGRITY_FLAG_ORDER: readonly HoleIntegrityFlag[] = Object.freeze(['MISSING_CUP', 'MISSING_START', 'PENALTY_UNRESOLVED', 'SEQUENCE_ANOMALY', 'UNKNOWN_SURFACE', 'LOW_LOCATION_QUALITY']);
export const INTEGRITY_RULES = Object.freeze({
  /** The first mark is the start when the tee is at least this plausible in its posterior (a tee-edge split still counts). */
  startTeeProbability: .25,
  /** A mark is weak when its calibrated σ is beyond the good-location threshold (location-quality goodAccuracyM). */
  weakSigmaM: 8,
  /** LOW_LOCATION_QUALITY when at least this share of the marks is weak … */
  weakShare: .5,
  /** … or any single mark has no honest position at all. */
  poorSigmaM: 15,
  /** A cup mark whose green-complex posterior is below this is a sequence anomaly. */
  cupGreenProbability: .5,
});
export interface HoleIntegrityContext {
  /** The round moved on past this hole: an open hole with marks behind the golfer has no cup. */
  expectClosed?: boolean;
  /** Penalty events (§ exceptions) that still wait for their drop mark. */
  unresolvedPenalties?: number;
  rules?: typeof INTEGRITY_RULES;
}
export interface HoleIntegrityReport {
  status: HoleStatus;
  terminalMethod: TerminalMethod | null;
  /** Shots on record: segments between consecutive marks (never strokes). */
  shots: number;
  flags: HoleIntegrityFlag[];
  /** CLEAN, or the flag that heads the review. */
  integrity: HoleIntegrity;
  /** Finalized marks on the hole and how many of them are weak, for the review copy. */
  markCount: number;
  weakMarks: number;
}
export const INTEGRITY_COPY: Readonly<Record<HoleIntegrityFlag, { title: string; detail: string }>> = Object.freeze({
  MISSING_CUP: { title: 'No cup mark', detail: 'The hole closed without a mark at the cup, so the last shot has no end point.' },
  MISSING_START: { title: 'No tee mark', detail: 'The first mark was not on the tee, so the tee shot is not on record.' },
  PENALTY_UNRESOLVED: { title: 'Penalty without a drop', detail: 'A penalty was added but the drop was never marked.' },
  SEQUENCE_ANOMALY: { title: 'Marks out of order', detail: 'A mark sits after the cup mark, or the cup mark is off the green.' },
  UNKNOWN_SURFACE: { title: 'Mark off the map', detail: 'A mark sits outside the mapped course.' },
  LOW_LOCATION_QUALITY: { title: 'Weak location', detail: 'Most marks had a weak GPS fix, so the distances are rough.' },
});

function finalizedInOrder(anchors: readonly ShotAnchor[]): ShotAnchor[] {
  return anchors.filter(a => !a.deletedAt && !a.provisional).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}
export function teeProbability(anchor: Pick<ShotAnchor, 'liePosterior'>): number {
  return anchor.liePosterior.filter(c => c.lieClass === 'tee').reduce((s, c) => s + c.p, 0);
}
function cupOffGreen(terminal: ShotAnchor, rules: typeof INTEGRITY_RULES): boolean {
  return terminal.terminalMethod === 'CUP_MARK' && greenComplexProbability({ classes: terminal.liePosterior } as LiePosterior) < rules.cupGreenProbability;
}
function sequenceAnomaly(marks: readonly ShotAnchor[], rules: typeof INTEGRITY_RULES): boolean {
  const terminal = marks.find(a => a.terminal);
  if (terminal && marks.some(a => a.sequence > terminal.sequence)) return true;
  for (let i = 1; i < marks.length; i++) if (Date.parse(marks[i]!.tapTimestamp) < Date.parse(marks[i - 1]!.tapTimestamp)) return true;
  return !!terminal && cupOffGreen(terminal, rules);
}
export function isWeakMark(anchor: Pick<ShotAnchor, 'sigmaM' | 'estimatorSummary'>, rules = INTEGRITY_RULES): boolean {
  return anchor.sigmaM > rules.weakSigmaM || anchor.estimatorSummary?.poorAccuracy === true;
}
/** The verdict for one hole from its anchors. Pure: the same record always
 * yields the same flags, in review order. */
export function assessHoleIntegrity(anchors: readonly ShotAnchor[], context: HoleIntegrityContext = {}): HoleIntegrityReport {
  const rules = context.rules ?? INTEGRITY_RULES;
  const marks = finalizedInOrder(anchors);
  const { status, terminalMethod, strokes } = holeStatus(anchors);
  const present = new Set<HoleIntegrityFlag>();
  if (status === 'COMPLETE' ? terminalMethod !== 'CUP_MARK' : !!context.expectClosed && marks.length > 0) present.add('MISSING_CUP');
  const first = marks[0];
  if (first && teeProbability(first) < rules.startTeeProbability) present.add('MISSING_START');
  if ((context.unresolvedPenalties ?? 0) > 0) present.add('PENALTY_UNRESOLVED');
  if (sequenceAnomaly(marks, rules)) present.add('SEQUENCE_ANOMALY');
  if (marks.some(a => a.primaryLie === 'UNKNOWN')) present.add('UNKNOWN_SURFACE');
  const weakMarks = marks.filter(a => isWeakMark(a, rules)).length;
  if (marks.length > 0 && (weakMarks / marks.length >= rules.weakShare || marks.some(a => a.sigmaM > rules.poorSigmaM))) present.add('LOW_LOCATION_QUALITY');
  const flags = INTEGRITY_FLAG_ORDER.filter(f => present.has(f));
  return { status, terminalMethod, shots: strokes, flags, integrity: flags[0] ?? 'CLEAN', markCount: marks.length, weakMarks };
}
