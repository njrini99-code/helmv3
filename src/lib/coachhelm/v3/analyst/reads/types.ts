/**
 * CoachHelm reads: the saved card a coach sees for one player (stored in the held table `golf_coach_reads`).
 *
 * A read is built from the analyst's fact sheet and notability (`../fact-sheet.ts`, `../notability.ts`) with no model.
 * Every number a coach reads is formatted ONCE into `figures` and the words are assembled from those strings, so a test
 * can check that every number in the text is a number in the payload (`__tests__/words.test.ts`).
 *
 * Coach-only blocks are `{ audience: 'coach_only', ... }`. `forPlayer` (player-card.ts) removes them, the same rule as
 * the fact sheet's `withoutCoachOnly`: a player never sees a teammate's figure.
 *
 * Pure types.
 */
import type { Certainty } from '../notability';

/** Bumped when the payload's meaning changes; stored as `golf_coach_reads.analyst_version`. */
export const READS_ANALYST_VERSION = 'reads-1';

export type ReadTrigger = 'round' | 'nightly' | 'manual';

/** The four parts of the game, by their strokes-gained measure id. */
export type PartId = 'strokes_gained_off_the_tee' | 'strokes_gained_approach' | 'strokes_gained_around_the_green' | 'strokes_gained_putting';

/** A block a player must never see: built from teammates' figures. */
export interface CoachOnly<T> {
  audience: 'coach_only';
  value: T;
}

/** One shot that carries the read in an evidence round. Ids and counted facts only. */
export interface EvidenceShot {
  shot_id: string;
  hole_number: number | null;
  /** "Hole 7: from 152 yards, finished 41 feet away, missed short". */
  text: string;
  /** This shot's strokes gained (negative is a loss), 2 decimals. */
  strokes_gained: number;
}

/** One round behind a read: where it cost the most. Opens the round. */
export interface EvidenceRound {
  round_id: string;
  /** YYYY-MM-DD. */
  date: string;
  date_text: string;
  course: string | null;
  total_score: number | null;
  score_to_par: number | null;
  /** "74 (+2)", or null with no score. */
  score_text: string | null;
  /** Shots of the read's scope in this round. */
  shots: number;
  /** Strokes gained in scope this round (negative is a loss). */
  strokes_gained: number;
  /** "3 approach shots from 125 to 175 yards, 1.9 strokes lost". */
  line: string;
  /** Hole numbers the shots were on, in order. */
  holes: number[];
  /** The shots that carry it, worst first (at most EVIDENCE_SHOTS). */
  carry: EvidenceShot[];
}

/** The pattern a card leads with, as counted. */
export interface ReadPattern {
  id: string;
  /** "31 of 44 misses with a side recorded went short". */
  text: string;
  value: number;
  unit: 'percent' | 'feet';
  count: number;
  of: number;
}

/** Where the strokes go: one card per player once five rounds with every shot logged exist this season. */
export interface PriorityCard {
  /** Stable across runs while the area is the same: what memory (stage 4) follows. */
  key: string;
  area: PartId;
  /** "Approach", "Putting". */
  area_label: string;
  certainty: Certainty;
  /** "Clear", "Likely", "Leaning". */
  certainty_word: string;
  /** "Approach costs the most: 1.4 strokes a round." */
  headline: string;
  /** One level down, in a sentence. */
  where_text: string;
  where: { finding: 'band' | 'spread_evenly' | 'not_traced'; band: string | null; band_label: string | null };
  pattern: ReadPattern | null;
  /** "How we found this": always three sentences. */
  how_we_found: [string, string, string];
  /** "What would change this": one sentence. */
  what_would_change: string;
  /** Against the team. Coach-only. */
  team: CoachOnly<{ text: string; pattern_median: number | null; differs: boolean; direction: 'above' | 'below' | null }> | null;
  evidence: EvidenceRound[];
  /** The raw numbers behind the card, for the parity test and memory. Strokes per round lost is positive. */
  numbers: {
    rounds: number;
    shots: number;
    lost_per_round: number;
    lost_low: number;
    lost_high: number;
    against_other_parts: number;
    against_other_parts_low: number;
    against_other_parts_high: number;
    /** All four parts' season means (strokes gained per round, negative is a loss). */
    parts: Record<PartId, number>;
  };
}

/** No priority yet: what is missing, said plainly. */
export interface MissingRead {
  /** "Needs 5 rounds with every shot logged this season; has 3." */
  text: string;
  needs: number | null;
  has: number | null;
}

/** The Stage 3 seam: the model's paragraph, checked by code, written by the writer (analyst/writer/). Absent: the Stage 1 card stands. */
export interface WrittenRead {
  what: string;
  rules_in_out: string;
  this_week: string;
  watch: string;
  model: string;
  checked_at: string;
}

/** Freshness, on every card. */
export interface ReadFreshness {
  /** "Through 13 Oct, 12 rounds". */
  through_text: string;
  /** "No new rounds since 13 Oct." when the newest round is three weeks old or more; else null. */
  stale_text: string | null;
}

export interface ReadPayload {
  version: 1;
  team_id: string;
  player_id: string;
  /** The day the read was built for (YYYY-MM-DD). Left out of the content hash. */
  as_of: string;
  season_start: string;
  /** The newest counted round this season (YYYY-MM-DD); null with none. */
  through_date: string | null;
  /** Counted rounds this season. */
  n_rounds: number;
  freshness: ReadFreshness;
  priority: PriorityCard | null;
  missing: MissingRead | null;
  /** Each formatted number, by name, that the words above use. */
  figures: Record<string, string>;
  /** Stage 2: the four parts side by side (parts.ts). */
  parts?: import('./parts').PartRead[];
  /** Stage 2: counted reads that cleared their test, at most three, one per family (catalogue.ts). */
  signals?: import('./catalogue').SignalRead[];
  /** Stage 4: memory, what changed since the last saved read, history (memory.ts). */
  memory?: import('./memory').ReadMemory;
  /** Stage 4: the focus a coach set from this card, and how it went (focus.ts). */
  focus?: import('./focus').FocusRead;
  /** Stage 3 seam. */
  written?: WrittenRead;
}
