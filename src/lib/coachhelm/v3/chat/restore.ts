/**
 * ============================================================================
 * CoachHelm · chat · restore — durable history back into UI messages
 * ----------------------------------------------------------------------------
 * Reload/resume. A refreshed conversation has to look like the live one: the
 * same charts, the same mention links, the same approval outcomes, the same
 * receipts — not a transcript of the prose with all the evidence stripped out.
 *
 * `ui_parts` is the durable record, so a row that has it is replayed verbatim.
 * Rows written before that column existed keep working: they render from
 * `content` as a plain text part, which is exactly what they used to render as.
 * A migration that made old conversations unreadable would be a bad trade for
 * a feature about trust.
 *
 * `status: 'failed'` is the one override on top of that (repair plan §14.10,
 * "chat publication"): a rejected turn's TEXT — whether an ungrounded claim
 * or a fragment from a stream that never finished — must never reappear as
 * ordinary, accepted prose just because it happens to survive as `content` or
 * as a `text` part in `ui_parts`. See `computeTurnVerdict`
 * (`chat/verdict.ts`) for how `route.ts` decides that status. An action
 * proposal or receipt on that same turn is NOT prose and is not part of
 * this override (#1997 review) — see `restoreFailedTurn`'s doc comment.
 * ========================================================================== */

import type { UIMessage } from 'ai';
import type { ChatMessage } from './types';
import { STREAM_INCOMPLETE_NOTE } from './verdict';

/** A part shape we are willing to replay. Anything else is dropped. */
const REPLAYABLE = new Set([
  'text',
  'step-start',
  'data-evidence',
  'data-action-proposal',
  'data-action-receipt',
  // The live grounding flag (route.ts's `execute`, N15) is written into the
  // persisted assistant turn's `ui_parts` the same way a receipt is. Without
  // it here, the flag showed only during the original streaming session —
  // reloading the thread silently dropped it and an ungrounded answer read
  // as a normal one again. Kept alongside the newer `data-turn-incomplete`
  // (added for the stream-never-finished reason) rather than renamed or
  // merged: production already has rows carrying this exact part type.
  'data-grounding-flag',
  'data-turn-incomplete',
]);

/** The two reasons `computeTurnVerdict` can reject a turn — see that
 *  function's own doc comment in `chat/verdict.ts`. */
const VERDICT_PART_TYPES = new Set(['data-grounding-flag', 'data-turn-incomplete']);

/**
 * Kept alongside the verdict note on a rejected turn (#1997 review,
 * MUST-1/MUST-2) — a proposal or receipt is a fact about an ACTION, never a
 * claim the numeric/claim audit judges, so the audit rejecting the
 * SURROUNDING prose must not also erase a Confirm card the coach still needs,
 * or a receipt for a write that already ran. See `ChatThread.tsx`'s matching
 * collapse branch for the live-render half of this same rule.
 */
const ACTION_PART_TYPES = new Set(['data-action-proposal', 'data-action-receipt']);

/**
 * A row this repo has no honest verdict note for — one written before this
 * mechanism shipped, or one where `onFinish` synthesized `status: 'failed'`
 * without `execute` ever reaching its own verdict (a disconnect; see
 * `route.ts`'s `turnVerdict` doc comment). Reusing `STREAM_INCOMPLETE_NOTE`
 * rather than inventing a third string: both cases share the same underlying
 * fact from the coach's point of view — this answer never reached a state
 * this app is willing to stand behind.
 */
const GENERIC_FAILURE_NOTE = STREAM_INCOMPLETE_NOTE;

/**
 * Rebuild the UI message list from durable history.
 *
 * Synthetic `tool` ledger rows are skipped: their content is already carried by
 * the assistant turn's parts, and replaying both would double every chart.
 *
 * Progress parts are deliberately NOT replayed. "Reading 28 recorded rounds" is
 * true while it is happening and misleading a day later.
 */
export function restoreUIMessages(messages: ChatMessage[]): UIMessage[] {
  const out: UIMessage[] = [];

  for (const row of messages) {
    if (row.role === 'tool') continue;

    if (row.role === 'assistant' && row.status === 'failed') {
      out.push(restoreFailedTurn(row));
      continue;
    }

    if (Array.isArray(row.ui_parts) && row.ui_parts.length > 0) {
      const parts = row.ui_parts.filter(
        (p): p is { type: string } =>
          Boolean(p) &&
          typeof p === 'object' &&
          typeof (p as { type?: unknown }).type === 'string' &&
          REPLAYABLE.has((p as { type: string }).type),
      );
      if (parts.length > 0) {
        out.push({
          id: row.id,
          role: row.role === 'user' ? 'user' : 'assistant',
          parts: parts as UIMessage['parts'],
        });
        continue;
      }
    }

    // Legacy row, or one whose parts were all filtered out. `status` here is
    // never `'failed'` — that branch already returned above — so this is a
    // legacy pre-status row (`status: null`) or a genuinely empty one, both
    // of which read as a completed answer, unchanged from before.
    if (!row.content) continue;
    out.push({
      id: row.id,
      role: row.role === 'user' ? 'user' : 'assistant',
      parts: [{ type: 'text', text: row.content }],
    });
  }

  return out;
}

/**
 * A rejected turn renders as its failure affordance PLUS any action parts —
 * never its text, never its evidence, regardless of what `ui_parts` or
 * `content` happen to hold. This is deliberately stricter than "hide the
 * text but keep the chart": a chart that streamed before the turn was
 * rejected was never itself vouched for as part of a finished, accepted
 * answer, and a coach re-reading history should see one unambiguous signal
 * about the PROSE — this answer was not accepted — rather than a mix of
 * trusted and untrusted fragments they have to sort out themselves. A
 * proposal or receipt is not prose (see `ACTION_PART_TYPES`'s doc comment)
 * and keeps rendering exactly as it would on an accepted turn.
 *
 * The note shown is whichever verdict part `route.ts` actually persisted
 * (`data-grounding-flag` for an ungrounded claim, `data-turn-incomplete` for
 * a stream that never finished); `GENERIC_FAILURE_NOTE` covers the one case
 * neither wrote — `execute` never reached its own verdict at all, so
 * `onFinish` marked the row `'failed'` without a part to go with it (see
 * `route.ts`'s `turnVerdict` doc comment).
 */
function restoreFailedTurn(row: ChatMessage): UIMessage {
  const parts = Array.isArray(row.ui_parts) ? row.ui_parts : [];
  const verdictPart = parts.find(
    (p): p is { type: string; id?: unknown; data?: { note?: unknown } } =>
      Boolean(p) && typeof p === 'object' && VERDICT_PART_TYPES.has((p as { type?: unknown }).type as string),
  );
  const note =
    (typeof verdictPart?.data?.note === 'string' && verdictPart.data.note) || GENERIC_FAILURE_NOTE;
  const partType = (verdictPart?.type as 'data-grounding-flag' | 'data-turn-incomplete' | undefined) ?? 'data-turn-incomplete';

  const actionParts = parts.filter(
    (p): p is { type: string } =>
      Boolean(p) && typeof p === 'object' && ACTION_PART_TYPES.has((p as { type?: unknown }).type as string),
  );

  return {
    id: row.id,
    role: 'assistant',
    parts: [
      { type: partType, id: 'restored-verdict', data: { note } },
      ...actionParts,
    ] as UIMessage['parts'],
  };
}
