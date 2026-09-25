/**
 * Player detail (coach /golf/dashboard/roster/[id]): serializable view model.
 *
 * Everything the client screen renders is computed on the server by
 * `buildPlayerDetailModel` and crosses the RSC boundary as plain data. Every
 * section carries its own `state`, so a failed read never renders as
 * "nothing here yet".
 */

export type SectionState = 'ready' | 'empty' | 'unavailable';

export type ScopeKey = 'last5' | 'last10' | 'season';

export interface PlayerIdentity {
  id: string;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
  graduationYear: number | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string | null;
}

/** One countable round, newest first in every list. */
export interface RoundPoint {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** "Aug 2" (built from the date string, never from a Date in a zone). */
  dateLabel: string;
  course: string;
  holes: number;
  score: number;
  toPar: number | null;
  roundType: string | null;
  putts: number | null;
  fairways: { hit: number; total: number } | null;
  greens: { hit: number; total: number } | null;
  scrambles: { made: number; attempts: number } | null;
  sg: {
    total: number | null;
    tee: number | null;
    approach: number | null;
    aroundGreen: number | null;
    putting: number | null;
  } | null;
}

export interface LedgerStat {
  key: 'scoring' | 'sg' | 'fir' | 'gir' | 'scrambling' | 'putts';
  label: string;
  /** Display value, already formatted (e.g. "74.4", "+0.4", "63%"). */
  value: string | null;
  /** Secondary value on the same line (e.g. "+2.4" to par). */
  aside: string | null;
  /** Ink: good (green), bad (amber) or neutral. */
  tone: 'good' | 'bad' | 'neutral';
  /** The sample line: "5 rounds", "88 of 140 fairways". */
  sample: string;
  /** True when the sample is too small for a confident read. */
  thin: boolean;
}

export interface ScopeView {
  key: ScopeKey;
  label: string;
  /** Printed under the strip: "Last 5 rounds", "2026 season". */
  windowLabel: string;
  /** 18-hole countable rounds in this window, newest first. */
  rounds: RoundPoint[];
  /** 9-hole countable rounds in the window that the strip does not plot. */
  nineHoleRounds: number;
  ledger: LedgerStat[];
}

export interface WaterfallPreview {
  state: SectionState;
  /** Per-round SG by category, in play order. Null = not measured. */
  steps: Array<{ key: 'tee' | 'approach' | 'aroundGreen' | 'putting'; label: string; value: number | null }>;
  total: number | null;
  rounds: number;
}

export interface StrandPreview {
  state: SectionState;
  /** Normalised 0..1 per dimension (0.5 = midline), null = locked. */
  dims: Array<{ id: string; label: string; norm: number | null }>;
  live: number;
  roundsBasis: number;
}

export interface ScoutingPreview {
  state: SectionState;
  headline: string | null;
  openReads: number;
}

export interface PlanItem {
  id: string;
  kind: 'focus' | 'goal';
  title: string;
  /** 0..1 progress from baseline to target, null when it can't be measured. */
  progress: number | null;
  detail: string | null;
}

export interface PlayerDetailModel {
  /** State of the rounds read itself. */
  roundsState: SectionState;
  /** Completed rounds on file (countable or not). */
  completedRounds: number;
  /** Completed rounds left out by the countable rule. */
  excludedRounds: number;
  /** Masthead status line, e.g. "Last round Aug 2 · 74 (+2)". */
  statusLine: string | null;
  /** Extra note when a newer round was left out. */
  statusNote: string | null;
  verdict: string | null;
  scopes: ScopeView[];
  defaultScope: ScopeKey;
  /** Every countable round (any length), newest first, for the full list. */
  allRounds: RoundPoint[];
  bestRoundId: string | null;
  waterfall: WaterfallPreview;
  strand: StrandPreview;
  scouting: ScoutingPreview;
  planState: SectionState;
  plan: PlanItem[];
}
