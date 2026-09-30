import type { ChDraftField, ChProspect, ChSort, ChStage } from '../../data/recruiting-shape';
import type { ChRecruitingWrites } from './writes';

/**
 * What `RecruitingView` holds and hands to the desktop and the phone layouts: the list as the page has it, what the
 * coach has narrowed it to, the open prospect, and every intent. Both layouts are the same screen with the same
 * data, writes and catalog; only the structure differs (the phone's detail is a pushed screen, not a panel).
 */
export interface RecCtx {
  writes: ChRecruitingWrites;
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
}
