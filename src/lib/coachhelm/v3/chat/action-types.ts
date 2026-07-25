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
 * The gate is structural, not advisory. `confirm` and `destructive` tools have
 * `needsApproval: true` in the AI SDK tool definition, so the model literally
 * cannot execute them; the SDK suspends the call and emits an approval request
 * part. A prompt-injected "yes, go ahead" reaches the model, not the database.
 * ========================================================================== */

export type ActionClass = 'read' | 'draft' | 'confirm' | 'destructive';

/** One line of a proposal preview: a label and the value the coach must check. */
export interface ProposalFact {
  label: string;
  value: string;
  /** Marks a field the coach still needs to supply (e.g. an unset location). */
  missing?: boolean;
}

/**
 * Everything the coach sees before approving a mutation.
 *
 * The rule this encodes: nothing is approved implicitly. Every occurrence date,
 * every recipient count, every notification that will fire is on the card. If a
 * field could surprise someone afterwards, it belongs in `facts`.
 */
export interface ActionProposal {
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
}

/** What the coach sees after a mutation ran. Durable; survives reload. */
export interface ActionReceipt {
  status: 'completed' | 'failed' | 'partial';
  action: string;
  /** Coach-readable result, e.g. 'Created 8 practices, every Tuesday at 3:00 PM'. */
  summary: string;
  /** What was created — type + count + in-app links. Never raw ids in copy. */
  created: { kind: string; count: number; href?: string; label?: string }[];
  /** How notification delivery actually went. */
  notifications: { channel: string; recipients: number; status: 'sent' | 'queued' | 'failed' }[];
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
}
