import type { EditableRoundType } from '@/lib/golf/round-type-options';
import { friendlyReason } from '../../../lib/use-action';

/** A qualifier the player is entered in, as the continue route reads it (`loadRoundTypeOptions`). */
export interface ChQualifierOption {
  id: string;
  name: string;
  /** How many rounds the qualifier is configured for. */
  numRounds: number;
  /** Round numbers the player's OTHER rounds already hold (this round excluded, so it never reads its own slot as taken). */
  takenRoundNumbers: number[];
  /** Finished: still a valid target, but attaching a round moves a published result, so the sheet says so. */
  isCompleted: boolean;
}

/** What the round-type sheet can offer. `readFailed`: an empty list means "couldn't tell", never "none". */
export interface ChRoundTypeOptions {
  qualifiers: ChQualifierOption[];
  readFailed: boolean;
}

/** What the round counts as now, from the page's setup. */
export interface ChRoundTypeCurrent {
  type: EditableRoundType;
  qualifierId: string | null;
  roundNumber: number | null;
}

/** The player's choice, as `updateRoundType` takes it. */
export interface ChRoundTypeChoice {
  type: EditableRoundType;
  qualifierId: string | null;
  roundNumber: number | null;
}

export const ROUND_TYPE_LABEL: Record<EditableRoundType, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
};

/** The round numbers still free in a qualifier, in order (the Fairway editor's rule, which defaulted to a taken 1). */
export function freeRoundNumbers(option: ChQualifierOption | undefined): number[] {
  if (!option) return [];
  const taken = new Set(option.takenRoundNumbers);
  return Array.from({ length: Math.max(option.numRounds, 1) }, (_, i) => i + 1).filter((n) => !taken.has(n));
}

/** Whether a choice would change nothing (the save waits). */
export function sameChoice(current: ChRoundTypeCurrent, choice: ChRoundTypeChoice): boolean {
  if (current.type !== choice.type) return false;
  if (choice.type !== 'qualifier') return true;
  return current.qualifierId === choice.qualifierId && current.roundNumber === choice.roundNumber;
}

/** The success toast: what the round counts toward now. */
export function savedLine(choice: ChRoundTypeChoice, qualifier: ChQualifierOption | undefined): string {
  if (choice.type !== 'qualifier') return `This round now counts as a ${choice.type} round`;
  if (!qualifier || choice.roundNumber == null) return 'This round now counts as a qualifier round';
  return `This round now counts as round ${choice.roundNumber} of ${qualifier.name}`;
}

/**
 * The failure's second line (CH-11020). `updateRoundType` answers in sentences written for a person, which pass
 * through. Its permission refusal does not say why, and the likely reasons for a player are that they are not entered
 * in that qualifier or are no longer an active member of the team (the held qualifier hardening, 20260929200000,
 * makes an entry require an active membership), so that one is said in those words.
 */
export function roundTypeFailure(error: string | undefined): string | undefined {
  if (!error || error === 'busy' || error === 'offline') return undefined;
  if (/permission|active (team )?member|not allowed|forbidden|42501|row-level security/i.test(error)) {
    return 'Your account can’t move this round into that qualifier. You need to be entered in it and an active member of the team. Ask your coach, then try again.';
  }
  if (/add this player to that qualifier/i.test(error)) {
    return 'You couldn’t be added to that qualifier. Only active members of the team can be. Ask your coach, then try again.';
  }
  return friendlyReason(error) ?? undefined;
}
