import type { LanguageModelUsage } from 'ai';
import type { TurnVerdict } from './verdict';
import { repairFeedback } from './repair-feedback';

/**
 * The one automatic repair pass for a coach turn the audit rejected.
 *
 * The route makes ONE more model call, handing the model what was refused and why, audits the new answer, and releases it only if it is
 * accepted; otherwise the withheld card is shown as before. A turn that never finished (`stream_incomplete`) is not repaired: there is no
 * answer to correct.
 */
export type RejectedVerdict = Extract<TurnVerdict, { outcome: 'rejected' }>;

export function isRepairable(verdict: TurnVerdict): verdict is RejectedVerdict {
  return verdict.outcome === 'rejected' && (verdict.reason === 'ungrounded_claims' || verdict.reason === 'claim_validation_failed');
}

const MAX_LISTED = 8;

const MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const WORD_COUNT = /^(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;

/**
 * How the repair is made. `rewrite` (the default): the model is handed its own answer and what was refused, may read nothing, and writes one
 * corrected version (a refused figure fixed from the reads already in front of it, or left out), which is one short step. `read`: only when a
 * refusal is a figure no read holds (not a date, a count, a moved figure, a small sample or a cause), where the honest repair may need a source.
 */
export type RepairMode = 'rewrite' | 'read';

export function repairMode(verdict: RejectedVerdict): RepairMode {
  const needsSource = verdict.unsupported.some((u) => !u.misattributed && !MONTH.test(u.text) && !WORD_COUNT.test(u.text) && !(/^\d{1,2}$/.test(u.text) && Number.isInteger(u.value) && u.value >= 3 && u.value <= 12));
  return needsSource ? 'read' : 'rewrite';
}

const READ_SENTENCE = 'If you need a figure you do not have, read it first; if you cannot get it, say so instead of estimating.';
const REWRITE_SENTENCE = 'You cannot read anything more now: use only the figures already in your reads above, and where you do not have one, leave it out or say you do not have it.';

/** What the model is told: the audit's own feedback (`repair-feedback.ts`), and a plain list of the refused figures if that returns nothing or throws. */
export function repairMessage(verdict: RejectedVerdict, mode: RepairMode = 'read'): string | null {
  let text: string | null;
  try {
    text = repairFeedback(verdict) ?? plainRepairMessage(verdict);
  } catch {
    text = plainRepairMessage(verdict);
  }
  if (text === null || mode === 'read') return text;
  return text.includes(READ_SENTENCE) ? text.replace(READ_SENTENCE, REWRITE_SENTENCE) : `${text}\n${REWRITE_SENTENCE}`;
}

/** Names the refused figures and claims, never ids or tool names. */
export function plainRepairMessage(verdict: RejectedVerdict): string | null {
  const items: string[] = [];
  for (const u of verdict.unsupported.slice(0, MAX_LISTED)) items.push(`"${u.text}" is in no read from this turn`);
  for (const r of (verdict.rejectedClaims ?? []).slice(0, MAX_LISTED)) items.push(`the claim on ${r.claim.metric_id} was refused: ${r.reason}`);
  if (items.length === 0) return null;
  return [
    'Your answer was checked against what your reads returned, and it was not accepted:',
    ...items.map((i) => `- ${i}`),
    'Write the answer again. Use only figures a read returned this turn (read again if you need one), keep the window and the number of rounds beside each figure, and leave out a cause you cannot back with a figure.',
  ].join('\n');
}

const sum = (a?: number, b?: number): number | undefined => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));

/** Two passes' token usage as one, for the ledger and the budget. */
export function addUsage(a: LanguageModelUsage, b: LanguageModelUsage): LanguageModelUsage {
  return {
    ...a,
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    inputTokenDetails: {
      noCacheTokens: sum(a.inputTokenDetails?.noCacheTokens, b.inputTokenDetails?.noCacheTokens),
      cacheReadTokens: sum(a.inputTokenDetails?.cacheReadTokens, b.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: sum(a.inputTokenDetails?.cacheWriteTokens, b.inputTokenDetails?.cacheWriteTokens),
    },
    outputTokenDetails: {
      textTokens: sum(a.outputTokenDetails?.textTokens, b.outputTokenDetails?.textTokens),
      reasoningTokens: sum(a.outputTokenDetails?.reasoningTokens, b.outputTokenDetails?.reasoningTokens),
    },
  };
}
