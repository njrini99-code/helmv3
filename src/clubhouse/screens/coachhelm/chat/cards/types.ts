import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

/**
 * The seam between the task card's shell and a capability's body (docs/clubhouse/coachhelm-chat-v3/CAPABILITIES.md, 0.1).
 * The shell owns the frame, the head, the buttons, the ring and the receipt, and derives the phase. A body draws what a
 * coach checks, from the stored plan, and nothing else.
 */
export type CardPhase =
  | 'proposed'
  | 'confirming'
  | 'held'
  | 'undoing'
  | 'committing'
  | 'saved'
  | 'partial'
  | 'undone'
  | 'cancelled'
  | 'superseded'
  | 'failed'
  | 'expired';

export const CARD_PHASES: readonly CardPhase[] = ['proposed', 'confirming', 'held', 'undoing', 'committing', 'saved', 'partial', 'undone', 'cancelled', 'superseded', 'failed', 'expired'];

export type CardDensity = 'full' | 'compact';

export interface CardPerson {
  id: string;
  name: string;
}

export interface CardBodyProps {
  /** `TaskProposal.tool`. */
  tool: string;
  /** The stored plan, untouched. A body reads facts, affects, notifications, visual, publish, neighbours and missing; never `input`. */
  proposal: ActionProposal;
  /** Held, final, or none yet. */
  receipt: ActionReceipt | null;
  phase: CardPhase;
  /** Ask draws full; quick chat draws compact. */
  density: CardDensity;
  roster?: readonly CardPerson[];
  team?: string;
  /** A row tap asks for the change in words. Absent, or once Confirm is pressed: rows are not buttons. */
  onAsk?: (text: string) => void;
}

/** How far a task travels: the three levels of CAPABILITIES 0.3. */
export type Reach = 'sends' | 'visible' | 'private';

/** The states in which nothing reached anyone and nothing was written. */
export const isWithdrawn = (phase: CardPhase): boolean => phase === 'undone' || phase === 'cancelled' || phase === 'superseded' || phase === 'failed' || phase === 'expired';
/** The write is in. */
export const isSaved = (phase: CardPhase): boolean => phase === 'saved' || phase === 'partial';
/** The coach can still ask for a change: only before Confirm. */
export const isOpen = (phase: CardPhase): boolean => phase === 'proposed';
