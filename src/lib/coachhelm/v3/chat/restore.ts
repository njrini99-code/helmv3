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
 * ========================================================================== */

import type { UIMessage } from 'ai';
import type { ChatMessage } from './types';

/** A part shape we are willing to replay. Anything else is dropped. */
const REPLAYABLE = new Set([
  'text',
  'step-start',
  'data-evidence',
  'data-action-proposal',
  'data-action-receipt',
]);

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

    // Legacy row, or one whose parts were all filtered out.
    if (!row.content) continue;
    out.push({
      id: row.id,
      role: row.role === 'user' ? 'user' : 'assistant',
      parts: [{ type: 'text', text: row.content }],
    });
  }

  return out;
}
