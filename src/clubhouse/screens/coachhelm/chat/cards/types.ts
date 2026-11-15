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
  /**
   * Where the thing appears once it is saved, in the app's words ("It appears in Home, under Focus."), and the place's
   * name, so the foot's one line does not name it twice. The shell knows it; absent, the line says only who is told.
   */
  lands?: { app: string; line: string } | null;
  /** A row tap asks for the change in words. Absent, or once Confirm is pressed: rows are not buttons. */
  onAsk?: (text: string) => void;
  /**
   * Edit mode (CAPABILITIES 0.8). The plan declares which fields may change (`proposal.editable`); the body edits each
   * with the app's own control and hands the shell only the fields that changed. The shell sends them, and the server's
   * re-planned, re-sealed proposal replaces this one. Absent: the card offers no edit, whatever the plan declares.
   */
  onEdit?: (patch: Record<string, unknown>) => void;
  /** An edit is with the server: the form is still, its key says so. */
  editing?: boolean;
  /** The server refused the last edit, in a sentence the coach can read. The card is unchanged; the form keeps what was typed. */
  editError?: string | null;
  /** The form is open with changes not yet sent, so the shell holds Confirm: what is on screen is not what would be confirmed. */
  onEditOpen?: (open: boolean) => void;
}

/** A field the coach may change on a waiting card, as the plan declares it (CONTRACT_NOTES, PLANS P11). */
export interface EditableField {
  key: string;
  /** The label of the fact this field shows as on the card. */
  label: string;
  type: 'text' | 'long_text' | 'date' | 'time' | 'datetime' | 'number' | 'choice' | 'toggle' | 'people' | 'list';
  value: string | number | boolean | string[] | null;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  max_length?: number;
  min_length?: number;
  min?: number;
  max?: number;
  step?: number;
  min_items?: number;
  max_items?: number;
}

/** How far a task travels: the three levels of CAPABILITIES 0.3. */
export type Reach = 'sends' | 'visible' | 'private';

/** The states in which nothing reached anyone and nothing was written. */
export const isWithdrawn = (phase: CardPhase): boolean => phase === 'undone' || phase === 'cancelled' || phase === 'superseded' || phase === 'failed' || phase === 'expired';
/** The write is in. */
export const isSaved = (phase: CardPhase): boolean => phase === 'saved' || phase === 'partial';
/** The coach can still ask for a change: only before Confirm. */
export const isOpen = (phase: CardPhase): boolean => phase === 'proposed';
