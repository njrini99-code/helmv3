import type { ChCalendarLine, ChDivision } from '../../data/recruiting-calendar';
import type { ChDraftField, ChProspect, ChSort, ChStage } from '../../data/recruiting-shape';
import type { ChRecruitingWrites } from './writes';

/**
 * What `RecruitingView` holds and hands to the desktop and the phone layouts: the list as the page has it, what the
 * coach has narrowed it to, the open prospect, and every intent. Both layouts are the same screen with the same
 * data, writes and catalog; only the structure differs (the phone's detail is a pushed screen, not a panel).
 */
export interface RecCtx {
  writes: ChRecruitingWrites;
  /** C1: the next-step columns exist. False hides the column, the panel field, the row plate, the sort and the head count. */
  nextStep: boolean;
  /** The next step can be edited: the columns exist and the writes store them (`ChRecruitingWrites.nextStepWrites`). */
  nextStepEditable: boolean;
  /** The sorts on offer (Next step due only with `nextStep`). */
  sorts: ReadonlyArray<{ value: ChSort; label: string }>;
  /** "2 visits this month · 1 decision due", or null. */
  nextSummary: string | null;
  /** C2: the recruiting-calendar line for today, the division it reads, and whether the team set it or the coach picks it here. */
  calendar: { line: ChCalendarLine | null; division: ChDivision | null; fromTeam: boolean; setDivision: (d: ChDivision) => void };
  /** A non-blocking hint for Email and Call (Division I's June 15 start), or null. */
  contactHint: (p: ChProspect) => string | null;
  /** B1: the one Committed moment waiting to play, for this prospect, until `endCommitBeat` consumes it. */
  commitBeat: { id: string; n: number } | null;
  endCommitBeat: (n: number) => void;
  prospects: ChProspect[];
  /** The rows after the stage filter, the search and the sort. */
  rows: ChProspect[];
  counts: Record<ChStage, number>;
  shares: Record<ChStage, number> | null;
  total: number;
  query: string;
  setQuery: (q: string) => void;
  stage: ChStage | null;
  setStage: (s: ChStage | null) => void;
  /** Counts the stage changes the coach makes (not the kept stage coming back as the page opens): the list swaps on it (CH-14603). */
  stageTurn: number;
  sort: ChSort;
  setSort: (s: ChSort) => void;
  /** The prospect whose panel (desktop) or detail (phone) is open. */
  open: ChProspect | null;
  select: (id: string) => void;
  /** Phone: closes the pushed detail. */
  closeDetail: () => void;
  now: Date;
  tz: string | undefined;
  /** A stage picked: saved at once, rolled back with a Retry if it doesn't land (CH-14003). */
  moveStage: (p: ChProspect, to: ChStage) => void;
  startAdd: () => void;
  startEdit: (p: ChProspect, focus?: ChDraftField) => void;
  askDelete: (p: ChProspect) => void;
  tryAgain: () => void;
  error: boolean;
  /** Preview and tests only: the upload dialog opens on this file when a prospect's documents draw. */
  initialUpload?: RecInitialUpload;
}

/** A chosen file to open the upload dialog on: its name and size, and whether Storage is to have refused it already. */
export interface RecInitialUpload {
  name: string;
  size: number;
  refused?: 'size' | 'type';
}
