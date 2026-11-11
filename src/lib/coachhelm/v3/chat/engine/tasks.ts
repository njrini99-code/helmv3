/**
 * CoachHelm chat: a task's life after the model asks for it.
 *
 * The model can only ask. `proposeTask` builds the real plan and records it in the action ledger; nothing is written to
 * the domain. The coach's Confirm reaches `startConfirm`, which claims the ledger row (so two Confirms cannot both run),
 * holds it for the Undo window and commits the STORED plan. Cancel reaches `declineTask`. Each returns the sentence the
 * model is told, which states what actually happened: the receipt card, not the model's prose, is the record.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logServerError } from '@/lib/server-error-logger';
import { getServiceRoleKey } from '@/lib/supabase/admin';
import type { ActionProposal, ActionReceipt } from '../action-types';
import { claimForExecution, isStoredProposal, readRun, recordDenial, recordOutcome, recordProposal, releaseClaim, replaceProposal, type StoredProposal } from '../action-runs';
import { holdForExecution, releaseHeld, runTaken, takeHeldMany } from '../undo-hold';
import type { TaskTool, ToolContext } from './tool';

export interface TaskDeps {
  /** The ledger's owner. Tasks are a coach's: a player context never gets a `TaskDeps`. */
  coachId: string;
  teamId: string;
  timezone: string;
  /** Runs work after the response is sent (`after()` in a route). The hold's release goes here. */
  defer: (work: () => Promise<unknown>) => void;
}

/**
 * A proposal as the card and the ledger hold it: the tool's plan, its key made unique to this one request by the model, and the
 * tool's name. `revision` counts the coach's edits to the card (absent on a card never edited): a Confirm says which revision the
 * coach was looking at, so a card changed in another tab is never confirmed as the one on screen.
 */
export type CardProposal = ActionProposal & { tool: string; revision?: number };
export const revisionOf = (proposal: { revision?: unknown } | null | undefined): number => (typeof proposal?.revision === 'number' && proposal.revision > 0 ? proposal.revision : 0);

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

/** The receipt of a write the coach undid inside the window: the stored card then says undone, not held. Nothing was written. */
const undoneReceipt = (action: string): ActionReceipt => ({ status: 'cancelled', action, summary: 'Undone. Nothing was written.', created: [], notifications: [], partial_failures: [], retryable: false, at: new Date().toISOString() });
const UNDONE_RESULT = 'The coach pressed Undo before it was written. Nothing was written.';

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

/** What the model is told about a receipt. A failed commit's own sentence is passed on as written: it says whether anything was saved. */
function outcomeOf(receipt: ActionReceipt): DecisionOutcome {
  if (receipt.status === 'completed') return { receipt, result: `Committed. ${receipt.summary}`, isError: false };
  if (receipt.status === 'partial') return { receipt, result: `Partly done. ${receipt.summary} Not done: ${receipt.partial_failures.join('; ') || 'see the receipt'}.`, isError: false };
  return { receipt, result: `Failed. ${receipt.summary}`, isError: true };
}

/**
 * Confirm, in two parts.
 *
 * `done`: there is nothing to wait for (it ran at once, was already done, or could not start).
 * `held`: the action is held for the Undo window. `receipt` is the held state to show at once; `finish()` waits the
 * window out IN THE REQUEST THAT IS ALREADY OPEN, then writes, and resolves with what really happened: committed,
 * undone by the coach, or failed. Only then is the model asked for its closing words, so the stored sentence can never
 * say "done" about something the coach undid, and the write does not wait for the coach's next request.
 * `in_flight`: another request already holds this card (a second press, or a retry while the window is open). That
 * request writes it, tells the model and stores the turn; this one must change nothing.
 * `changed`: the stored card is not the revision the coach was looking at (it was edited in another tab). Nothing is claimed or
 * written; `proposal` is the card as it stands, to show in place of the stale one.
 */
export type ConfirmStart =
  | { kind: 'done'; outcome: DecisionOutcome }
  | { kind: 'held'; receipt: ActionReceipt; finish: () => Promise<DecisionOutcome> }
  | { kind: 'in_flight' }
  | { kind: 'changed'; proposal: CardProposal };

/** A card that is ready to be written: its row is claimed (nothing else can run or edit it), and `commit` writes the claimed plan. */
interface Claimed {
  kind: 'claimed';
  run_id: string;
  proposal: CardProposal;
  /** The task writes on Confirm, with no Undo window. */
  immediate: boolean;
  commit: () => Promise<ActionReceipt>;
}
type Prepared = { kind: 'done'; outcome: DecisionOutcome } | { kind: 'in_flight' } | { kind: 'changed'; proposal: CardProposal } | Claimed;

/**
 * The first half of a Confirm, for one card: the stored plan must carry this server's seal and be the revision the coach saw, and
 * the row is claimed so that exactly one request can run it. Nothing is written to the domain here.
 */
async function prepareConfirm(deps: TaskDeps, tool: TaskTool<unknown> | undefined, ctx: ToolContext, key: string, seen?: number): Promise<Prepared> {
  const done = (outcome: DecisionOutcome): Prepared => ({ kind: 'done', outcome });
  const run = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  const gone: DecisionOutcome = {
    // A receipt, so the card shows that it failed instead of reading as confirmed with nothing under it.
    receipt: failedReceipt(tool?.name ?? 'Action', 'That didn’t go through. Nothing was saved.', undefined, false),
    result: 'Failed: this card can no longer be confirmed. Nothing was written. Offer to prepare it again.',
    isError: true,
  };
  if (!run || !tool || run.tool_name !== tool.name || !isStoredProposal(run.proposed_input)) return done(gone);
  if (!proposalIsSealed(deps.coachId, key, run.proposed_input)) {
    void logServerError(`coachhelm task refused: the stored proposal does not carry this server's seal (${tool.name})`, { action: `coachhelm.tool.${tool.name}.confirm`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'error');
    return done(gone);
  }
  let proposal = run.proposed_input.proposal as CardProposal;
  // Only a card still waiting can have changed under the coach; one already decided is answered below with what happened to it.
  if (run.status === 'proposed' && revisionOf(proposal) !== (seen ?? 0)) return { kind: 'changed', proposal };

  const claim = await claimForExecution(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (claim.kind === 'already_completed') return done({ receipt: claim.receipt, result: `Already done earlier: ${claim.receipt.summary} Nothing new was written.`, isError: false });
  if (claim.kind === 'in_flight') return { kind: 'in_flight' };
  if (claim.kind === 'stale_failed') return done({ receipt: failedReceipt(proposal.action, claim.message, undefined, false), result: `Failed: ${claim.message}`, isError: true });
  if (claim.kind === 'error') {
    return done({ receipt: failedReceipt(proposal.action, 'That didn’t go through. Nothing was saved.', undefined, true), result: 'Failed: the action could not be started safely. Nothing was written.', isError: true });
  }

  // The plan that runs is the one the row held at the instant it was claimed. An edit can land between the read above and the
  // claim; after the claim it cannot. So the claimed plan is checked again: this server's seal, and the revision the coach saw.
  if (claim.proposed_input !== undefined) {
    const taken = claim.proposed_input;
    if (!isStoredProposal(taken) || !proposalIsSealed(deps.coachId, key, taken)) {
      await recordOutcome(ctx.sb, { run_id: claim.run_id, receipt: gone.receipt as ActionReceipt });
      return done(gone);
    }
    const now = taken.proposal as CardProposal;
    if (revisionOf(now) !== (seen ?? 0)) {
      if (await releaseClaim(ctx.sb, { run_id: claim.run_id })) return { kind: 'changed', proposal: now };
      const refused = failedReceipt(now.action, 'That didn’t go through. Nothing was saved.', undefined, true);
      await recordOutcome(ctx.sb, { run_id: claim.run_id, receipt: refused });
      return done({ receipt: refused, result: 'Failed: the card changed while it was being confirmed, so it was not run. Nothing was written.', isError: true });
    }
    proposal = now;
  }

  // The write is the coach's decision, already made: it is not tied to the browser staying connected.
  const writeContext: ToolContext = { ...ctx, signal: new AbortController().signal };
  const plan = proposal;
  const commit = async (): Promise<ActionReceipt> => {
    try {
      return await tool.commit(writeContext, plan);
    } catch (err) {
      return failedReceipt(plan.action, 'Could not finish that.', err instanceof Error ? err.message : String(err), false);
    }
  };
  return { kind: 'claimed', run_id: claim.run_id, proposal, immediate: tool.immediate === true, commit };
}

const heldReceipt = (proposal: CardProposal, until: string): ActionReceipt => ({ status: 'held', held_until: until, action: proposal.action, summary: proposal.summary, created: [], notifications: [], partial_failures: [], retryable: false, at: new Date().toISOString() });

/** What happened to a held row this request did not get to write: the coach undid it, or it was opened early by the card's own request. */
async function notTaken(deps: TaskDeps, ctx: ToolContext, key: string, proposal: CardProposal): Promise<DecisionOutcome> {
  const after = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (after?.status === 'cancelled') return { receipt: undoneReceipt(proposal.action), result: UNDONE_RESULT, isError: false };
  if (after?.result) return outcomeOf(after.result);
  return { receipt: null, result: `It is being written by another request (opened early at ${clock(new Date().toISOString(), deps.timezone)}). The card shows the outcome; do not say it is done.`, isError: false };
}

/**
 * Confirm. Runs the stored plan at most once, however many times it is called for one key. `seen` is the revision of the card the
 * coach pressed Confirm on (absent from a browser that knows nothing of revisions, which can only have seen an unedited card).
 */
export async function startConfirm(deps: TaskDeps, tool: TaskTool<unknown> | undefined, ctx: ToolContext, key: string, seen?: number): Promise<ConfirmStart> {
  const done = (outcome: DecisionOutcome): ConfirmStart => ({ kind: 'done', outcome });
  const prepared = await prepareConfirm(deps, tool, ctx, key, seen);
  if (prepared.kind !== 'claimed') return prepared;
  const { proposal, commit } = prepared;
  const claim = { run_id: prepared.run_id };

  let noUndo = false;
  if (!prepared.immediate) {
    const held = await holdForExecution(ctx.sb, { run_id: claim.run_id });
    if (held.kind === 'held') {
      const finish = async (): Promise<DecisionOutcome> => {
        // Waits until `run_at`, then takes the row only if it is still held; the write starts only after the take.
        const written = await releaseHeld(ctx.sb, { run_id: claim.run_id, run_at: held.run_at, run: commit });
        // Not held any more: the coach pressed Undo, or opened it early (which wrote it from the card's own request).
        return written ? outcomeOf(written) : notTaken(deps, ctx, key, proposal);
      };
      return { kind: 'held', receipt: heldReceipt(proposal, held.run_at), finish };
    }
    if (held.kind === 'error') {
      // The coach was promised an Undo window; without it nothing goes through.
      const refused = failedReceipt(proposal.action, 'That didn’t go through. Nothing was saved.', undefined, true);
      await recordOutcome(ctx.sb, { run_id: claim.run_id, receipt: refused });
      return done({ receipt: refused, result: 'Failed: the action could not be held for Undo, so it was not run. Nothing was written.', isError: true });
    }
    noUndo = true;
  }

  return done(outcomeOf(await writeNow(deps, ctx, prepared, noUndo)));
}

/** Write a claimed card that has no Undo window, and record what happened. */
async function writeNow(deps: TaskDeps, ctx: ToolContext, card: Claimed, noUndo: boolean): Promise<ActionReceipt> {
  const ran = await card.commit();
  const receipt: ActionReceipt = noUndo && ran.status === 'completed' ? { ...ran, summary: `${ran.summary} Undo isn’t on here yet.` } : ran;
  const recorded = await recordOutcome(ctx.sb, { run_id: card.run_id, receipt });
  if (!recorded) {
    void logServerError(`coachhelm task outcome not recorded: ${card.proposal.tool}`, { action: `coachhelm.tool.${card.proposal.tool}.outcome`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true, extra: { status: receipt.status } }, 'error');
  }
  return receipt;
}

/** One card of an "approve all", as it stands when the batch starts. */
export type BatchCard =
  /** Held for the batch's one Undo window. `receipt` is the held state to show at once. */
  | { key: string; state: 'held'; receipt: ActionReceipt }
  /** Going ahead with no Undo window (the task writes on Confirm, or this database has no hold); written in its turn. */
  | { key: string; state: 'queued' }
  /** Settled before anything was held: already done earlier, or it could not be started. */
  | { key: string; state: 'done'; outcome: DecisionOutcome }
  /** Another request is confirming it; this batch leaves it alone. */
  | { key: string; state: 'skipped' };
/** How a card of the batch ended. `reopened`: an earlier card failed, so this one was not run and waits for the coach again. */
export type BatchEnd = { key: string; outcome: DecisionOutcome } | { key: string; reopened: true };
export type ConfirmAllStart = { kind: 'changed'; cards: Array<{ key: string; proposal: CardProposal }> } | { kind: 'started'; cards: BatchCard[]; finish: () => Promise<BatchEnd[]> };

/**
 * "Approve all": confirm several waiting cards of one turn, in the order they were proposed.
 *
 * One shared Undo window: every card that can be held is held until the same moment, so the coach has one stretch of time to
 * undo any of them (each card's own Undo, as ever). When it closes the batch is taken whole and written one card at a time, in
 * order. A card the coach undid is skipped and is not a failure. THE FIRST FAILURE STOPS THE BATCH: the cards after it are not
 * run; their rows go back to waiting and the coach decides again, knowing what failed.
 *
 * Nothing is confirmed unless every card is the revision the coach saw (`changed`): "approve all" over a card that was edited in
 * another tab would confirm something that was never on screen.
 */
export async function startConfirmAll(deps: TaskDeps, ctx: ToolContext, wanted: Array<{ key: string; tool: TaskTool<unknown> | undefined; seen?: number }>): Promise<ConfirmAllStart> {
  // Before any row is touched: is every card the one on the coach's screen?
  const changed: Array<{ key: string; proposal: CardProposal }> = [];
  for (const card of wanted) {
    const run = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: card.key });
    if (!run || run.status !== 'proposed' || !isStoredProposal(run.proposed_input) || !proposalIsSealed(deps.coachId, card.key, run.proposed_input)) continue;
    const proposal = run.proposed_input.proposal as CardProposal;
    if (revisionOf(proposal) !== (card.seen ?? 0)) changed.push({ key: card.key, proposal });
  }
  if (changed.length > 0) return { kind: 'changed', cards: changed };

  // Claim in order. A card that cannot be started is the batch's first failure: nothing after it is touched.
  const cards: BatchCard[] = [];
  const claimed = new Map<string, Claimed>();
  const handBack = async () => {
    for (const taken of claimed.values()) await releaseClaim(ctx.sb, { run_id: taken.run_id });
  };
  for (const card of wanted) {
    const prepared = await prepareConfirm(deps, card.tool, ctx, card.key, card.seen);
    if (prepared.kind === 'changed') {
      // An edit slipped in after the check above. Nothing has been held or written: every claim is handed back.
      await handBack();
      return { kind: 'changed', cards: [{ key: card.key, proposal: prepared.proposal }] };
    }
    if (prepared.kind === 'in_flight') {
      cards.push({ key: card.key, state: 'skipped' });
      continue;
    }
    if (prepared.kind === 'done') {
      cards.push({ key: card.key, state: 'done', outcome: prepared.outcome });
      if (prepared.outcome.isError) break;
      continue;
    }
    claimed.set(card.key, prepared);
    cards.push({ key: card.key, state: 'queued' });
  }

  // One window for all of them: the same moment is written on every row that can be held.
  const now = Date.now();
  let noUndo = false;
  let until: string | null = null;
  for (const [at, card] of cards.entries()) {
    const taken = claimed.get(card.key);
    if (!taken || taken.immediate || noUndo) continue;
    const held = await holdForExecution(ctx.sb, { run_id: taken.run_id, now });
    if (held.kind === 'held') {
      until = held.run_at;
      cards[at] = { key: card.key, state: 'held', receipt: heldReceipt(taken.proposal, held.run_at) };
    } else if (held.kind === 'no_column') {
      // This database has no Undo hold: the batch is written at once, in order, and each receipt says so.
      noUndo = true;
    } else {
      // The coach was promised an Undo window; without it this card does not go through, and the batch stops here.
      const refused = failedReceipt(taken.proposal.action, 'That didn’t go through. Nothing was saved.', undefined, true);
      await recordOutcome(ctx.sb, { run_id: taken.run_id, receipt: refused });
      claimed.delete(card.key);
      cards[at] = { key: card.key, state: 'done', outcome: { receipt: refused, result: 'Failed: the action could not be held for Undo, so it was not run. Nothing was written.', isError: true } };
      for (const later of cards.splice(at + 1)) {
        const untouched = claimed.get(later.key);
        if (untouched) await releaseClaim(ctx.sb, { run_id: untouched.run_id });
        claimed.delete(later.key);
      }
      break;
    }
  }

  const finish = async (): Promise<BatchEnd[]> => {
    if (until) await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, Date.parse(until) - Date.now())));
    // The window has closed: every card still held is taken in one update, before the first of them is written.
    const mine = await takeHeldMany(ctx.sb, { run_ids: cards.flatMap((c) => (c.state === 'held' ? [claimed.get(c.key)!.run_id] : [])) });
    const ends: BatchEnd[] = [];
    let stopped = false;
    for (const card of cards) {
      if (card.state === 'skipped') continue;
      if (card.state === 'done') {
        ends.push({ key: card.key, outcome: card.outcome });
        if (card.outcome.isError) stopped = true;
        continue;
      }
      const taken = claimed.get(card.key)!;
      const holding = card.state === 'queued' || mine.has(taken.run_id);
      if (card.state === 'held' && !holding) {
        // Not ours to write: the coach undid it (not a failure), or its own request opened it early.
        const outcome = await notTaken(deps, ctx, card.key, taken.proposal);
        ends.push({ key: card.key, outcome });
        if (outcome.isError) stopped = true;
        continue;
      }
      if (stopped) {
        // An earlier card failed. This one is not run: its row goes back to waiting.
        if (await releaseClaim(ctx.sb, { run_id: taken.run_id })) ends.push({ key: card.key, reopened: true });
        else {
          const refused = failedReceipt(taken.proposal.action, 'Not run: an earlier action failed. Nothing was saved.', undefined, true);
          await recordOutcome(ctx.sb, { run_id: taken.run_id, receipt: refused });
          ends.push({ key: card.key, outcome: { receipt: refused, result: 'Not run: an earlier action in the same batch failed. Nothing was written.', isError: true } });
        }
        continue;
      }
      const receipt = card.state === 'held' ? await runTaken(ctx.sb, { run_id: taken.run_id, run: taken.commit }) : await writeNow(deps, ctx, taken, noUndo && !taken.immediate);
      ends.push({ key: card.key, outcome: outcomeOf(receipt) });
      if (receipt.status === 'failed') stopped = true;
    }
    return ends;
  };
  return { kind: 'started', cards, finish };
}

/** Why an edit to a card was not made. `invalid`: the edit itself; `changed`: the card is not the one the coach was editing; `decided`: it is no longer waiting; `fixed`: nothing on it can be edited; `gone`: there is no such card. */
export type ReviseRefusal = 'invalid' | 'changed' | 'decided' | 'fixed' | 'gone';
export type ReviseResult = { ok: true; proposal: CardProposal } | { ok: false; kind: ReviseRefusal; reason: string; proposal: CardProposal | null };

/**
 * The coach edited a field on a waiting card. The task plans again from the stored plan and the edits (its own checks, no write,
 * no model); the result takes the card's own key, is sealed again and replaces the stored plan, but only while the card is still
 * waiting. Whatever goes wrong, the stored plan is untouched and is handed back as it stands with a reason the coach can read.
 */
export async function reviseTask(deps: TaskDeps, tool: TaskTool<unknown> | undefined, ctx: ToolContext, key: string, edits: Record<string, unknown>, seen?: number): Promise<ReviseResult> {
  const run = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (!run || !tool || run.tool_name !== tool.name || !isStoredProposal(run.proposed_input) || !proposalIsSealed(deps.coachId, key, run.proposed_input)) {
    return { ok: false, kind: 'gone', reason: 'This card can no longer be changed. Ask for it again.', proposal: null };
  }
  const stored = run.proposed_input;
  const current = stored.proposal as CardProposal;
  const refuse = (kind: ReviseRefusal, reason: string): ReviseResult => ({ ok: false, kind, reason, proposal: current });
  if (run.status !== 'proposed') return refuse('decided', 'This card has already been answered, so it can no longer be changed.');
  if (revisionOf(current) !== (seen ?? 0)) return refuse('changed', 'This card was changed somewhere else. This is how it stands now.');
  if (!tool.revise || !current.editable?.length) return refuse('fixed', 'Nothing on this card can be changed here. Ask for the change in words.');

  let revised: ActionProposal;
  try {
    revised = await tool.revise(ctx, current, edits);
  } catch (err) {
    return refuse('invalid', err instanceof Error && err.message ? err.message : 'That change could not be made.');
  }
  // The card keeps its own key (the planner's would change with the title), and counts the edit.
  const proposal: CardProposal = { ...revised, idempotency_key: key, tool: tool.name, revision: revisionOf(current) + 1 };
  const seal = proposalSeal(deps.coachId, key, proposal);
  if (!seal) return refuse('invalid', 'That change could not be saved. The card is as it was.');
  const replaced = await replaceProposal(ctx.sb, { coach_id: deps.coachId, idempotency_key: key, proposed_input: { ...stored, proposal, seal } });
  if (replaced === 'not_proposed') return refuse('decided', 'This card has already been answered, so it can no longer be changed.');
  if (replaced === 'error') {
    void logServerError(`coachhelm task revision not recorded: ${tool.name}`, { action: `coachhelm.tool.${tool.name}.revise`, feature: 'coachhelm_chat', userId: deps.coachId, handled: true }, 'error');
    return refuse('invalid', 'That change could not be saved. The card is as it was.');
  }
  return { ok: true, proposal };
}

/**
 * A card the coach left behind by asking something else. Usually it is still only proposed, and is declined. But the
 * ledger is asked first, because a card can also have been confirmed in a request that lost its connection during the
 * Undo window: then the write happened (or was undone) without this conversation hearing of it, and the model is told
 * what the ledger says, never "nothing was written" about something that was.
 */
export async function settleAbandonedTask(deps: TaskDeps, ctx: ToolContext, key: string): Promise<DecisionOutcome & { declined: boolean }> {
  const run = await readRun(ctx.sb, { coach_id: deps.coachId, idempotency_key: key });
  if (run && run.status !== 'proposed') {
    if (run.status === 'completed' && run.result) return { ...outcomeOf(run.result), declined: false };
    if (run.status === 'cancelled') {
      const action = isStoredProposal(run.proposed_input) ? String((run.proposed_input.proposal as { action?: unknown } | null)?.action ?? run.tool_name) : run.tool_name;
      return { receipt: undoneReceipt(action), result: UNDONE_RESULT, isError: false, declined: false };
    }
    if (run.status === 'held' || run.status === 'approved') return { receipt: null, result: 'The coach confirmed this and it is being written now. The card shows the outcome; do not say whether it is done.', isError: false, declined: false };
    if (run.status === 'failed') return { receipt: run.result, result: `Failed. ${run.result?.summary ?? 'It did not go through.'}`, isError: true, declined: false };
  }
  return { ...(await declineTask(deps, ctx, key, 'superseded')), declined: true };
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
