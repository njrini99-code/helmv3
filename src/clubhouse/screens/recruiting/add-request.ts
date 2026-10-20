import { newRequestId, type ChRecruitInput } from '../../data/recruiting-shape';

/** The request id an Add sent last: the form opening it was sent from, the prospect it was for, and the id. */
export interface ChAddAttempt {
  nonce: number;
  who: string;
  id: string;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Which prospect an Add is for: the name, however it is spaced or capitalised (as `createRecruit` compares it), and
 * nothing else. A field corrected after a lost reply (an email, a hometown, the class) is the same prospect.
 */
export const addIdentity = (input: Pick<ChRecruitInput, 'first_name' | 'last_name'>) => JSON.stringify([norm(input.first_name), norm(input.last_name)]);

/**
 * The request id for this Add (CH-14915). Retry, Save pressed again, and Save after correcting a field send the id the
 * last attempt did, so a reply lost after the server stored the prospect cannot add them a second time: the server
 * finds the row it stored and brings it up to what was sent. Another name, or another opening of the form after an Add
 * landed, is another prospect and gets a new id.
 */
export function addRequestFor(last: ChAddAttempt | null, nonce: number, input: Pick<ChRecruitInput, 'first_name' | 'last_name'>, make: () => string = newRequestId): ChAddAttempt {
  const who = addIdentity(input);
  if (last && last.nonce === nonce && last.who === who) return last;
  return { nonce, who, id: make() };
}
