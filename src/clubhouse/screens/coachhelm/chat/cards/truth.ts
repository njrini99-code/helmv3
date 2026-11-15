import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { plural } from './facts';
import type { EditableField, Reach } from './types';

/**
 * What a plan says for certain (CONTRACT_NOTES, PLANS P1 to P11): who is sent something, the words, who can see it, how
 * it is taken back, what may be edited. Every field is optional: a card stored before the server built them has none,
 * and each reader here answers `undefined` for "the plan does not say", which is never the same as "nobody" or "nothing".
 */
export type TruePlan = ActionProposal & { editable?: EditableField[]; revision?: number };

export const editableOf = (p: ActionProposal): EditableField[] => (p as TruePlan).editable ?? [];

/** How far it travels, from the plan itself when it says, else `fallback` (the catalogue's reading of an older card). */
export function reachOf(p: ActionProposal, fallback: Reach): { reach: Reach; mark: string | null } {
  if (p.recipients?.length) return { reach: 'sends', mark: null };
  if (p.visible_to === 'only_you') return { reach: 'private', mark: 'Only you' };
  if (p.visible_to === 'coaches') return { reach: 'private', mark: 'Coaches only' };
  if (p.visible_to === 'team' || p.visible_to === 'recipients') return { reach: 'visible', mark: null };
  // The plan lists nobody and says nothing of who can see it: nothing is sent, and the catalogue's word stands.
  if (p.recipients) return { reach: fallback === 'sends' ? 'private' : fallback, mark: fallback === 'sends' ? 'Nobody is told' : null };
  return { reach: fallback, mark: null };
}

/** "6 players", "6 players and 2 coaches", "Eli Brandt". */
export function recipientWords(people: ReadonlyArray<{ name: string; role?: 'player' | 'coach' }>): string {
  if (people.length === 1) return people[0]!.name;
  const coaches = people.filter((p) => p.role === 'coach').length;
  const players = people.length - coaches;
  return [players ? plural(players, 'player') : null, coaches ? plural(coaches, 'coach', 'coaches') : null].filter(Boolean).join(' and ');
}

const CHANNEL: Record<string, { chip: string; words: string }> = {
  push: { chip: 'Push', words: 'a push' },
  in_app: { chip: 'In the app', words: 'a notice in the app' },
  'in-app': { chip: 'In the app', words: 'a notice in the app' },
  email: { chip: 'Email', words: 'an email' },
  message: { chip: 'Message', words: 'a message' },
};
/** A channel as a coach says it. One the app adds later is printed as it is, in sentence case. */
export const channelChip = (channel: string): string => CHANNEL[channel]?.chip ?? channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, ' ');
/** "a push, an email and a notice in the app". */
export function channelWords(channels: readonly string[]): string {
  const words = channels.map((c) => CHANNEL[c]?.words ?? c.replace(/_/g, ' '));
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** A receipt that failed because the card is no longer true: asking again is the only way on, so there is no Try again. */
export const isOutOfDate = (r: ActionReceipt | null): boolean => r?.error === 'card_out_of_date';
