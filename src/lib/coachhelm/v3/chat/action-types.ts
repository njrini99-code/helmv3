/**
 * ============================================================================
 * CoachHelm · chat · action types — what the agent may do, and on what terms
 * ----------------------------------------------------------------------------
 * Kept in a plain module (NOT a `'use server'` file) so both server actions and
 * agent tools can import the shapes without Next's server-action export rules
 * getting in the way.
 *
 * Four classes, and the class decides the gate:
 *
 *   read      — runs automatically. Cannot write.
 *   draft     — produces a preview. Cannot write.
 *   confirm   — writes ONLY after an explicit coach approval.
 *   destructive — same, plus an impact summary the coach must read first.
 *
 * The gate is structural, not advisory: the SDK suspends the call and emits an
 * approval request part, so a prompt-injected "yes, go ahead" reaches the model,
 * not the database.
 *
 * CORRECTED 2026-08-18 — this used to say the gate is `needsApproval: true` in
 * the tool definition. It is not, and looking for it there finds nothing: no
 * tool in agent-tools.ts sets that property, and `needsApproval` appears in this
 * repo only in the AI SDK type shim and in prose like the sentence being
 * corrected. The single live gate is the `toolApproval` callback in
 * src/app/api/coachhelm/v3/chat/stream/route.ts:361, which returns
 * 'user-approval' exactly when `isConfirmRequired(toolName)` is true. That
 * allowlist is therefore the whole mechanism, and
 * agent-tools.confirm-gate.test.ts is what keeps it in step with the tool set.
 * ========================================================================== */

import type { CardDelivery, CardNotReached, CardPerson, CardUndo, CardVisibility, EditableField, ReceiptMissed } from './card-types';

export type { CardDelivery, CardNotReached, CardPerson, CardUndo, CardVisibility, EditableField, ReceiptMissed } from './card-types';

export type ActionClass = 'read' | 'draft' | 'confirm' | 'destructive';

/** One line of a proposal preview: a label and the value the coach must check. */
export interface ProposalFact {
  label: string;
  value: string;
  /** Marks a field the coach still needs to supply (e.g. an unset location). */
  missing?: boolean;
  /** A Read fill's source: the Worked out pill (TASK_FIELDS §1). */
  source?: string;
}

/**
 * Everything the coach sees before approving a mutation.
 *
 * The rule this encodes: nothing is approved implicitly. Every occurrence date,
 * every recipient count, every notification that will fire is on the card. If a
 * field could surprise someone afterwards, it belongs in `facts`.
 */
export type TaskVisual =
  | { kind: 'cal'; date: string; start: string | null; end: string | null; title: string; where: string | null; who: string; rsvp: boolean }
  | { kind: 'msg'; conversationId: string; thread: string; count: number; last: string | null; draft: string; /** Everyone in the thread but the coach, read from the thread; `count` is this list's length plus any member who cannot be named. */ members?: string[] }
  | { kind: 'qual'; title: string; rounds: number; start: string; total: number; picks: number; field: number; deadline: string | null }
  | { kind: 'task'; title: string; due: string | null; who: string[] }
  | { kind: 'goal'; player: string; stat: string; target: number; days: number; /** Where the player stands now on the rounds the goal is measured from; null when there are none. */ current?: number | null; unit?: string; better?: 'up' | 'down' }
  | { kind: 'note'; player: string; note: string; /** The round the note goes on, read from the round. */ round?: { course: string | null; date: string | null; score: number | null } }
  | { kind: 'trip'; from: string | null; to: string; how: string; leave: string; back: string | null }
  | {
      kind: 'lineup';
      seats: Array<{ slot: number | null; name: string; alternate: boolean; id?: string; role?: 'lineup' | 'alternate' | 'individual'; reasoning?: string }>;
      /** The tournament, read from its row. */
      tournament?: { id: string; name: string; date: string; end: string | null };
      /** The lineup saved on the tournament when the card was made, which this one replaces; an empty list when there was none. Absent on a lock card. */
      replaces?: Array<{ slot: number | null; name: string; alternate: boolean; id?: string; role?: 'lineup' | 'alternate' | 'individual' }>;
      /** A lock card: the seats shown are what is locked. */
      locking?: boolean;
    }
  /** Every date of a repeating practice, in order. */
  | { kind: 'series'; title: string; dates: string[]; start: string; end: string | null; where: string | null };

export interface ActionProposal {
  /** A plan's publish: who hears (as coins) and one player's own line, for the card to draw. Every value is also in `facts`. */
  publish?: {
    heading: string;
    coins: Array<{ name: string }>;
    coinsMore?: number;
    tellsLine: string;
    folder: string;
    teamChat?: boolean;
    sample?: { player: string; title: string; body: string } | null;
    /** Everyone told, by name, read from the plan (never a count from the model). Complete: `coins` is its first six players. */
    people?: Array<{ id?: string; name: string; role: 'player' | 'coach' }>;
    /** The Team chat post, word for word; null when it is not posted. */
    chatPost?: string | null;
  };
  /** The real rows this draft lands between (ask/06 E-HS). Read for the card only; nothing is written from them. */
  neighbours?: Array<{ title: string; sub: string }>;
  /** What the quick chat draws in the card. Every value here is also in `facts`. */
  visual?: TaskVisual;
  /** Human-readable action, e.g. 'Create a recurring practice'. */
  action: string;
  /** One-sentence plain-language summary of the effect. */
  summary: string;
  facts: ProposalFact[];
  /** Named entities affected — rendered as mention pills, never as raw ids. */
  affects: { kind: 'player' | 'team' | 'event'; id: string; label: string }[];
  /** Exactly what will be sent, in the coach's words. Empty = nothing sent. */
  notifications: string[];
  /** Anything the coach must supply before this can run. */
  missing: string[];
  /** Retry-safe key. The same key can never produce two writes. */
  idempotency_key: string;
  /** Only set for `destructive` — what is lost, stated plainly. */
  impact?: string;
  /**
   * Where the thing will appear once it is written, known when the card is planned: the kind of thing, the page it
   * lives on (a path of this app, never model text) and, for something on a date, the day. The page behind the chat
   * shows a pending place for it while the write is held. Left out for a task that adds no row to a list.
   */
  lands?: ActionLanding;
  /**
   * Who is sent something, by id and name, resolved by the server. The count on the card is this list's length. Absent on
   * a card stored before 11 Nov 2026; an empty list means nothing is sent to anyone.
   */
  recipients?: CardPerson[];
  /** People named on the card who will not get what is sent, each with the reason ("no account yet"). */
  not_reached?: CardNotReached[];
  /** Exactly what a recipient receives. Null: nothing is sent. Absent: an older card, or words the server cannot show. */
  delivery?: CardDelivery | null;
  /** Who can see the thing once it is saved, and the same in a sentence. */
  visible_to?: CardVisibility;
  visible_note?: string;
  /** Whether it can be taken back: the Undo window, and where it is reversed afterwards (or that it cannot be). */
  undo?: CardUndo;
  /**
   * The fields the coach may change on the card before confirming, each with its type and limits. Absent or empty:
   * nothing on this card is editable in place. An edit goes to the task's `revise`, which plans again; it is never
   * applied to the card by the browser.
   */
  editable?: EditableField[];
}

/** `kind` is one of the page's own row kinds: task, event, blocked_time, focus_area, announcement, message, qualifier, trip, recruit, lineup, plan. */
export interface ActionLanding {
  kind: string;
  home: string;
  /** ISO day, for things that live on a date. */
  day?: string;
}

/** What the coach sees after a mutation ran. Durable; survives reload. */
export interface ActionReceipt {
  /**
   * `held`: the 8 second Undo window, not yet written; the final receipt replaces it.
   * `cancelled`: the coach pressed Undo inside that window and nothing was written (stored from 10 Nov 2026; an older
   * stored turn that was undone still holds its `held` receipt, and the card's own GET says what became of it).
   */
  status: 'completed' | 'failed' | 'partial' | 'held' | 'cancelled';
  /** The instant a held run writes. */
  held_until?: string;
  action: string;
  /** Coach-readable result, e.g. 'Created 8 practices, every Tuesday at 3:00 PM'. */
  summary: string;
  /**
   * What was created: type, count and where it is. `href` goes to the thing itself where the app has an address for it
   * (the Calendar on that day with the event open), else to its section. `id` is the row the task wrote and `ids` every
   * row when it wrote several, so a page can find the new row; ids are only ever of rows the coach who confirmed may
   * read, are never printed, and are left out where the app's own action does not return one.
   */
  created: { kind: string; count: number; href?: string; label?: string; id?: string; ids?: string[] }[];
  /** How notification delivery actually went. */
  notifications: { channel: string; recipients: number; status: 'sent' | 'queued' | 'failed'; /** Who it went to, by name, when the task knows. */ to?: string[] }[];
  /** The thing itself, where the app has an address for it: the same as `created[0].href`. */
  href?: string;
  /** People on the card the send did not reach, by name, with the reason. */
  missed?: ReceiptMissed[];
  /** Populated on `partial` — what succeeded and what did not. */
  partial_failures: string[];
  error?: string;
  /** True when re-running with the same key is safe. */
  retryable: boolean;
  at: string;
}

/** Payload for a `create_recurring_practice` proposal/execution. */
export interface RecurringPracticePlan {
  title: string;
  description: string | null;
  /** IANA zone, resolved server-side from `golf_teams.timezone`. */
  timezone: string;
  /** ISO `YYYY-MM-DD` of the first occurrence. */
  start_date: string;
  /** `HH:mm` local to `timezone`. */
  start_time: string;
  end_time: string | null;
  location: string | null;
  /** Weekday numbers, 0 = Sunday. */
  weekdays: number[];
  /** Bounded, always. An unbounded series is never created silently. */
  occurrence_count: number;
  /** Every date that will be created, resolved before the coach approves. */
  occurrence_dates: string[];
  requires_rsvp: boolean;
  /** ISO instant, or null. */
  rsvp_deadline: string | null;
  invited_player_ids: string[];
  invited_player_names: string[];
  /** The invited players as the card saw them, each with whether they have an account to be told on. Set by the server in `plan`. */
  seen_people?: Array<{ id: string; name: string; account: boolean }>;
}
