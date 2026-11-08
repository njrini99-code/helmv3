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

/** What the model is told: the audit's own feedback (`repair-feedback.ts`), and a plain list of the refused figures if that returns nothing or throws. */
export function repairMessage(verdict: RejectedVerdict): string | null {
  try {
    return repairFeedback(verdict) ?? plainRepairMessage(verdict);
  } catch {
    return plainRepairMessage(verdict);
  }
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
