/**
 * CoachHelm chat: what a task card can say for certain, as types.
 *
 * Every field here is built by the server in `plan`, from the database, with the signed-in session client. None is
 * ever taken from the model's input. They are optional on `ActionProposal` and `ActionReceipt` (action-types.ts), so a
 * card stored before 11 Nov 2026 still renders: a card without `recipients` simply has none to draw.
 *
 * Plain data only: a proposal is stored as JSON, sealed, and handed back to `commit` unchanged.
 */

/** A person a task reaches or changes. `id` is the player's or the coach's own row id, never an account id. */
export interface CardPerson {
  id: string;
  name: string;
  role: 'player' | 'coach';
}

/** Someone named on the card who will not get what is sent, and why, in words a coach reads ("no account yet"). */
export interface CardNotReached extends CardPerson {
  reason: string;
}

/**
 * Exactly what a recipient receives. `title` and `body` are the notification as a phone shows it, produced by the code
 * that sends it (or pinned to it by a test, where that code cannot be called without sending).
 */
export interface CardDelivery {
  /** How it arrives, in the app's own three words: `push`, `in_app` (the bell), `email`, or `message` for a Messages bubble. */
  channels: string[];
  title: string;
  body: string;
  /** The same notice on another channel where its words differ (the bell row beside the push). */
  variants?: Array<{ channel: string; title: string; body: string }>;
  /** When recipients do not all get the same words: each person's own body, in the order of `recipients`. `body` above is then the first person's. */
  each?: Array<{ id: string; name: string; body: string }>;
  /** What the card cannot quote, said plainly (an email's layout, a player's own notification settings). */
  note?: string;
}

/**
 * Who can see the thing once it is saved, when nothing is sent or beyond who is sent it.
 *   only_you    the coach who confirmed, nobody else
 *   coaches     this team's coaches; players never see it
 *   recipients  the people named on the card and this team's coaches
 *   team        every player and coach on the team
 */
export type CardVisibility = 'only_you' | 'coaches' | 'recipients' | 'team';

/** Whether a confirmed write can be taken back. `window: false` writes on the press. `after` says where it is reversed later, or that it cannot be. */
export interface CardUndo {
  window: boolean;
  after: string;
}

/** A recipient the send missed, on the receipt, by name. */
export interface ReceiptMissed {
  name: string;
  reason: string;
}
