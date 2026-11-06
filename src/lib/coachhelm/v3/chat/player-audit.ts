import { todayIsoInZone } from '@/lib/golf/timezone';
import { MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { auditNumericClaims, coachRequestDates, collectDates, collectEnvelopeNumbers, type AuditPlayer, type ToolEnvelope, type UnsupportedClaim } from './provenance';

/** What the player's own messages say, for the dates in them. */
function askedText(message: unknown): string {
  const m = message as { role?: string; parts?: Array<{ type?: string; text?: string }> };
  if (m?.role !== 'user' || !Array.isArray(m.parts)) return '';
  return m.parts.filter((p) => p?.type === 'text').map((p) => p.text ?? '').join(' ');
}

/** The player's turn through the coach's audit: the same evidence, dates and day pairs, from the same zone. */
export function auditPlayerAnswer(args: { text: string; envelopes: readonly ToolEnvelope[]; messages: readonly unknown[]; timezone: string; roster: readonly AuditPlayer[]; now?: Date }): UnsupportedClaim[] {
  const today = todayIsoInZone(args.timezone, args.now ?? new Date());
  const dates = [...args.envelopes.flatMap((e) => collectDates(e.detail, args.timezone)), ...args.messages.flatMap((m) => coachRequestDates(askedText(m), today))];
  return auditNumericClaims(args.text, args.envelopes.flatMap((e) => e.measurements), args.envelopes.flatMap((e) => e.series), args.envelopes.flatMap(collectEnvelopeNumbers), dates, args.timezone, { players: args.roster });
}

/**
 * The ledger row for a player's turn. The insert this replaces named columns the table does not have (`model`, `input_tokens`,
 * `output_tokens`) and left out required ones, behind an `as never`, so every player turn's row failed. A player's answer streams as it
 * is written, so the audit can't withhold it; recording what it found is what makes the check worth running.
 */
export function playerLedgerRow(args: { playerId: string; promptTokens: number; completionTokens: number; costUsd: number; unsupported: readonly UnsupportedClaim[] }) {
  const grounded = args.unsupported.length === 0;
  return {
    task: 'coach_chat',
    player_id: args.playerId,
    coach_id: null,
    model_id: MODEL_FOR_TASK.coach_chat,
    prompt_hash: args.playerId.slice(0, 16),
    prompt_tokens: args.promptTokens,
    completion_tokens: args.completionTokens,
    cost_usd: args.costUsd,
    citations: grounded ? null : { reason: 'verification_failed', verdict_reason: 'ungrounded_claims', unmatched_tokens: args.unsupported.map((c) => c.text) },
    verified: grounded,
    fallback_to_template: false,
  };
}
