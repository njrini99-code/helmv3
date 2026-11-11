/**
 * CoachHelm chat: a task's life after the model asks for it.
 *
 * The model can only ask. `proposeTask` builds the real plan and records it in the action ledger; nothing is written to
 * the domain. The coach's Confirm reaches `confirmTask`, which claims the ledger row (so two Confirms cannot both run),
 * holds it for the Undo window and commits the STORED plan. Cancel reaches `declineTask`. Each returns the sentence the
 * model is told, which states what actually happened: the receipt card, not the model's prose, is the record.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logServerError } from '@/lib/server-error-logger';
import { getServiceRoleKey } from '@/lib/supabase/admin';
import type { ActionProposal, ActionReceipt } from '../action-types';
import { claimForExecution, isStoredProposal, readRun, recordDenial, recordOutcome, recordProposal, type StoredProposal } from '../action-runs';
import { holdForExecution, releaseHeld } from '../undo-hold';
import type { TaskTool, ToolContext } from './tool';

export interface TaskDeps {
  /** The ledger's owner. Tasks are a coach's: a player context never gets a `TaskDeps`. */
  coachId: string;
  teamId: string;
  timezone: string;
  /** Runs work after the response is sent (`after()` in a route). The hold's release goes here. */
  defer: (work: () => Promise<unknown>) => void;
}

/** A proposal as the card and the ledger hold it: the tool's plan, its key made unique to this one request by the model, and the tool's name. */
export type CardProposal = ActionProposal & { tool: string };

/**
 * The planner's key names the intent (team, title, …) and repeats when a coach asks for the same thing again next week.
 * A request by the model is one `tool_use` block in one conversation, so hashing those two in makes a retried Confirm of
 * one card one key and a later identical request a new one.
 */
export function scopedKey(plannerKey: string, conversationId: string, toolUseId: string): string {
  let h = 0x811c9dc5;
  const text = `${conversationId}|${toolUseId}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${plannerKey.slice(0, 110)}:${h.toString(36)}`;
}

/** JSON with object keys in a fixed order: a jsonb column returns keys in its own order, and the seal must not depend on it. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * The server's seal on a recorded proposal.
 *
 * The ledger's policy lets a coach write their own rows, and Confirm commits the STORED plan without building it again.
 * Without a seal, a row written by hand (straight to the API, not through the chat) would be committed as if the planner
 * had produced it, skipping every check `plan` makes (the roster, the team, the limits). The seal is an HMAC over the
 * coach, the key and the plan with a secret only the server holds, so only a plan this server's planner produced, for
 * this coach and this card, can be committed. Null when the server has no secret to seal with.
 */
export function proposalSeal(coachId: string, key: string, proposal: unknown): string | null {
  const secret = getServiceRoleKey();
  if (!secret) return null;
  return createHmac('sha256', secret).update(`coachhelm-action-proposal-v1\n${coachId}\n${key}\n${canonical(proposal)}`).digest('hex');
}

export function proposalIsSealed(coachId: string, key: string, stored: StoredProposal): boolean {
  const expected = proposalSeal(coachId, key, stored.proposal);
  if (!expected || typeof stored.seal !== 'string') return false;
  const given = Buffer.from(stored.seal);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

const failedReceipt = (action: string, summary: string, error: string | undefined, retryable: boolean): ActionReceipt => ({
  status: 'failed',
  action,
  summary,
  created: [],
  notifications: [],
  partial_failures: [],
  ...(error ? { error } : {}),
  retryable,
  at: new Date().toISOString(),
});

const clock = (iso: string, timezone: string): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export type ProposeResult = { ok: true; proposal: CardProposal } | { ok: false; message: string };

/** Build the plan and record it. No card is shown unless the ledger holds the proposal: a Confirm with nothing to claim could only fail. */
export async function proposeTask(deps: TaskDeps, tool: TaskTool<unknown>, ctx: ToolContext, input: unknown, toolUseId: string, resume?: unknown): Promise<ProposeResult> {
  let planned: ActionProposal;
  try {
    planned = await tool.plan(ctx, input);
  } catch (err) {
    void logServerError(`coachhelm task plan failed: ${tool.name}`, { action: `coachhelm.tool.${tool.name}.propose`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true, skipSentry: true }, 'warning');
    return { ok: false, message: err instanceof Error && err.message ? err.message : 'That could not be prepared.' };
  }
  const proposal: CardProposal = { ...planned, idempotency_key: scopedKey(planned.idempotency_key, ctx.conversationId, toolUseId), tool: tool.name };
  const seal = proposalSeal(deps.coachId, proposal.idempotency_key, proposal);
  if (!seal) {
    // A card that could never be confirmed must not be shown.
    void logServerError('coachhelm task proposal not sealed: the server secret is not available', { action: `coachhelm.tool.${tool.name}.propose`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'error');
    return { ok: false, message: 'That could not be prepared safely, so nothing is offered to confirm. Nothing was written.' };
  }
  const stored: StoredProposal = { v: 2, input, proposal, seal, ...(resume === undefined ? {} : { resume }) };
  const recorded = await recordProposal(ctx.sb, {
    coach_id: deps.coachId,
    team_id: deps.teamId,
    conversation_id: ctx.conversationId,
    tool_name: tool.name,
    proposed_input: stored,
    idempotency_key: proposal.idempotency_key,
  });
  if ('error' in recorded) {
    void logServerError(`coachhelm task proposal not recorded: ${tool.name}`, { action: `coachhelm.tool.${tool.name}.propose`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'error');
    return { ok: false, message: 'That could not be prepared safely, so nothing is offered to confirm. Nothing was written.' };
  }
  return { ok: true, proposal };
}

export interface DecisionOutcome {
  /** The receipt card, when there is one to show. */
  receipt: ActionReceipt | null;
  /** What the model is told. The real state, in plain words. */
  result: string;
  isError: boolean;
}

/** Confirm. Runs the stored plan at most once, however many times it is called for one key. */
export async function confirmTask(deps: TaskDeps, tool: TaskTool<unknown> | undefined, ctx: ToolContext, key: string): Promise<DecisionOutcome> {
  const run = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  const gone: DecisionOutcome = {
    // A receipt, so the card shows that it failed instead of reading as confirmed with nothing under it.
    receipt: failedReceipt(tool?.name ?? 'Action', 'That didn’t go through. Nothing was saved.', undefined, false),
    result: 'Failed: this card can no longer be confirmed. Nothing was written. Offer to prepare it again.',
    isError: true,
  };
  if (!run || !tool || run.tool_name !== tool.name || !isStoredProposal(run.proposed_input)) return gone;
  if (!proposalIsSealed(deps.coachId, key, run.proposed_input)) {
    void logServerError(`coachhelm task refused: the stored proposal does not carry this server's seal (${tool.name})`, { action: `coachhelm.tool.${tool.name}.confirm`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'error');
    return gone;
  }
  const proposal = run.proposed_input.proposal as CardProposal;

  const claim = await claimForExecution(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (claim.kind === 'already_completed') return { receipt: claim.receipt, result: `Already done earlier: ${claim.receipt.summary} Nothing new was written.`, isError: false };
  if (claim.kind === 'in_flight') return { receipt: null, result: 'This action is already running from an earlier Confirm. Nothing new was started.', isError: false };
  if (claim.kind === 'stale_failed') return { receipt: failedReceipt(proposal.action, claim.message, undefined, false), result: `Failed: ${claim.message}`, isError: true };
  if (claim.kind === 'error') {
    return { receipt: failedReceipt(proposal.action, 'That didn’t go through. Nothing was saved.', undefined, true), result: 'Failed: the action could not be started safely. Nothing was written.', isError: true };
  }

  const commit = async (): Promise<ActionReceipt> => {
    try {
      return await tool.commit(ctx, proposal);
    } catch (err) {
      return failedReceipt(proposal.action, 'Could not finish that.', err instanceof Error ? err.message : String(err), false);
    }
  };

  let noUndo = false;
  if (!tool.immediate) {
    const held = await holdForExecution(ctx.sb, { run_id: claim.run_id });
    if (held.kind === 'held') {
      const receipt: ActionReceipt = { status: 'held', held_until: held.run_at, action: proposal.action, summary: proposal.summary, created: [], notifications: [], partial_failures: [], retryable: false, at: new Date().toISOString() };
      deps.defer(() => releaseHeld(ctx.sb, { run_id: claim.run_id, run_at: held.run_at, run: commit }));
      return {
        receipt,
        result: `Held until ${clock(held.run_at, deps.timezone)}: it is written then unless the coach presses Undo first, so it is not done yet. ${proposal.summary}`,
        isError: false,
      };
    }
    if (held.kind === 'error') {
      // The coach was promised an Undo window; without it nothing goes through.
      const refused = failedReceipt(proposal.action, 'That didn’t go through. Nothing was saved.', undefined, true);
      await recordOutcome(ctx.sb, { run_id: claim.run_id, receipt: refused });
      return { receipt: refused, result: 'Failed: the action could not be held for Undo, so it was not run. Nothing was written.', isError: true };
    }
    noUndo = true;
  }

  const ran = await commit();
  const receipt: ActionReceipt = noUndo && ran.status === 'completed' ? { ...ran, summary: `${ran.summary} Undo isn’t on here yet.` } : ran;
  const recorded = await recordOutcome(ctx.sb, { run_id: claim.run_id, receipt });
  if (!recorded) {
    void logServerError(`coachhelm task outcome not recorded: ${tool.name}`, { action: `coachhelm.tool.${tool.name}.outcome`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true, extra: { status: receipt.status } }, 'error');
  }
  if (receipt.status === 'completed') return { receipt, result: `Committed. ${receipt.summary}`, isError: false };
  if (receipt.status === 'partial') return { receipt, result: `Partly done. ${receipt.summary} Not done: ${receipt.partial_failures.join('; ') || 'see the receipt'}.`, isError: false };
  return { receipt, result: `Failed: ${receipt.error ?? receipt.summary}`, isError: true };
}

/** Cancel, or a new question asked while the card was still waiting. `commit` is never called. */
export async function declineTask(deps: TaskDeps, ctx: ToolContext, key: string, why: 'declined' | 'superseded'): Promise<DecisionOutcome> {
  const recorded = await recordDenial(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (!recorded) {
    void logServerError('coachhelm task denial not recorded', { action: 'coachhelm.tool.denial', feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'warning');
  }
  return {
    receipt: null,
    result: why === 'declined' ? 'Declined by the coach. Nothing was written.' : 'The coach asked something else instead of confirming. Nothing was written.',
    isError: false,
  };
}
