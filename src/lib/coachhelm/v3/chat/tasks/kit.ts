/**
 * CoachHelm chat: what the task tools in this folder share.
 *
 * Every tool here is on the engine's contract (`engine/tool.ts`): `plan` reads what the card must show and writes
 * nothing; `commit` runs once after Confirm and the Undo window, through the app's own server action. These helpers
 * hold the parts that must be the same in every tool: who may, how a receipt is worded, and how a write that reported
 * a failure is looked for before anything is called unsaved (`settle`).
 *
 * Why the look matters here in particular: the chat runs in a route handler, and several of the app's actions end with
 * a cache refresh that only works inside a Server Action. From a route that refresh can throw after the row is
 * written, and the action then reports a failure for a write that landed. So no receipt in this folder says "nothing
 * was saved" on the action's word alone.
 */
import 'server-only';
import type { z } from 'zod';
import type { ActionProposal, ActionReceipt } from '../action-types';
import type { CardDelivery, CardNotReached, CardPerson, CardUndo, CardVisibility, EditableField } from '../card-types';
import { CoachContextError, type CoachChatContext } from '../context';
import { EditRefused, editableFields } from '../editable';
import { isPlayerContext, type ToolContext } from '../engine/tool';

/** What every task here returns from `plan`: the card, the tool, the input the write will use, and when it was planned. JSON-safe. The same shape as TOOLS's `TaskProposal`. */
export type StoredProposal = ActionProposal & CardExtras & { tool: string; input: unknown; planned_at: string };

/**
 * What a card says for certain beyond its facts (`../card-types.ts`): who is sent something, who on the card is not
 * reached, the words they get, who can see the result, and how it is taken back. Declared here as well as on
 * `ActionProposal` so these tools fill the fields whichever commit of the contract they are built against.
 */
export interface CardExtras {
  recipients?: CardPerson[];
  not_reached?: CardNotReached[];
  delivery?: CardDelivery | null;
  visible_to?: CardVisibility;
  visible_note?: string;
  undo?: CardUndo;
}

/** Nothing is sent to anyone: an empty list and no words, which the card draws as "nobody is told". */
export const NOTHING_SENT = { recipients: [] as CardPerson[], delivery: null } as const;
export const asPlayers = (players: ReadonlyArray<{ id: string; name: string }>): CardPerson[] => players.map((p) => ({ id: p.id, name: p.name, role: 'player' as const }));
export const unreached = (players: ReadonlyArray<{ id: string; name: string }>, reason = 'no account yet'): CardNotReached[] => players.map((p) => ({ id: p.id, name: p.name, role: 'player' as const, reason }));

export const now = () => new Date().toISOString();
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const list = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
export const sentence = (s: string): string => s.trim().replace(/[.\s]*$/, '.');

/** A task is a coach's. A player's context is refused before anything is read. */
export function coachOnly(ctx: ToolContext): CoachChatContext {
  if (isPlayerContext(ctx.who)) throw new CoachContextError('Only a coach can do that.', 403);
  return ctx.who;
}

/** A roster player by id, or a refusal. Every player id a tool is given goes through this before any read. */
export function rosterPlayer(who: CoachChatContext, id: string): CoachChatContext['roster'][number] {
  const found = who.roster.find((p) => p.id === id);
  if (!found) throw new CoachContextError('That player is not on your active roster.', 403);
  return found;
}

export const failed = (action: string, summary: string, retryable: boolean, error?: string): ActionReceipt => ({ status: 'failed', action, summary, created: [], notifications: [], partial_failures: [], ...(error ? { error } : {}), retryable, at: now() });

export const done = (action: string, summary: string, created: ActionReceipt['created'] = [], notifications: ActionReceipt['notifications'] = []): ActionReceipt => ({ status: 'completed', action, summary, created, notifications, partial_failures: [], retryable: false, at: now() });

type ActionAnswer = { success: boolean; error?: string | null; code?: string };

/**
 * One write, settled. `look` answers whether the card's result is already there: true, false, or null when it could not
 * look. Before the write, a result already there is reported and nothing is written (a second commit of the same card).
 * After a write that reported failure, it is looked for again: found is done; not found says nothing changed, with the
 * action's own reason; could not look says exactly that and does not invite a blind retry.
 */
export async function settle(opts: {
  action: string;
  look: () => Promise<boolean | null>;
  write: () => Promise<ActionAnswer>;
  receipt: () => ActionReceipt;
  /** What "nothing happened" is called for this tool: "Nothing was changed.", "Nothing was sent." */
  nothing: string;
  /** Where the coach can look when the tool could not. */
  where: string;
  /** A refusal the action makes on purpose (a stale card, a missing row): its sentence, or null to fall through to the look. */
  refusal?: (answer: ActionAnswer) => string | null;
}): Promise<ActionReceipt> {
  const before = await opts.look().catch(() => null);
  if (before === true) return opts.receipt();
  const answer = await opts.write().catch((err: unknown): ActionAnswer => ({ success: false, error: err instanceof Error ? err.message : 'That didn’t go through.' }));
  if (answer.success) return opts.receipt();
  const refused = opts.refusal?.(answer);
  if (refused) return failed(opts.action, `${sentence(refused)} ${opts.nothing}`, false, answer.error ?? undefined);
  const after = await opts.look().catch(() => null);
  if (after === true) return opts.receipt();
  const reason = sentence(answer.error?.trim() || 'That didn’t go through');
  if (after === false) return failed(opts.action, new RegExp(opts.nothing.replace(/\.$/, ''), 'i').test(reason) ? reason : `${reason} ${opts.nothing}`, true, answer.error ?? undefined);
  return failed(opts.action, `${reason} I could not check whether it went through: look in ${opts.where} before trying again.`, false, answer.error ?? undefined);
}

/** Which of these players has an account, so a notification has somewhere to go. Null when it could not be read. */
export async function withAccounts(ctx: ToolContext, ids: readonly string[]): Promise<Set<string> | null> {
  if (ids.length === 0) return new Set();
  const { data, error } = await ctx.sb.from('golf_players').select('id, user_id').in('id', [...ids]);
  if (error) return null;
  return new Set((data ?? []).filter((p) => Boolean(p.user_id)).map((p) => p.id));
}

/** An instant as the wall clock reads in a zone: the date and the 24-hour time. */
export function wallClock(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/**
 * The permission several of the app's actions require: the caller is on the staff of the team. A read that fails
 * denies (a check that could not run must not pass) and says it was the check that failed, not "you are not a coach".
 */
export async function requireTeamStaff(ctx: ToolContext, who: CoachChatContext): Promise<void> {
  const { data, error } = await ctx.sb.from('golf_team_coach_staff').select('id').eq('team_id', who.team_id).eq('coach_id', who.coach_id).maybeSingle();
  if (error) throw new Error('Your access could not be checked just now. Try again in a moment.');
  if (!data) throw new CoachContextError('Only this team’s coaches can do that.', 403);
}

/**
 * A card the coach can change in place before confirming (`engine/tool.ts`, `revise`). A tool names the fields of its
 * own input that may be edited; their types and limits are read from the tool's schema (`editableFields`), so the form
 * and the check cannot part ways. The input the card was planned from is kept on the card as `input.asked`, and an
 * edit is merged into that and validated by the same schema before the tool plans again: every read and every check
 * `plan` makes, no write, no model. A blank is null, which in these tools means "as it is now" or "none".
 */
export function editing<I extends Record<string, unknown>>(schema: z.ZodType<I>, labels: Readonly<Record<string, string>>, kinds: Readonly<Record<string, EditableField['type']>> = {}) {
  const keys = Object.keys(labels);
  return {
    /**
     * The fields for the card. `shown` is what each holds after the change, where the input itself says only what
     * changes. `kinds` names a field's kind where the schema's pattern does not give it away (a 24-hour time).
     */
    fields: (asked: I, shown: Readonly<Record<string, unknown>> = {}): EditableField[] =>
      editableFields(schema, keys, { ...asked, ...shown }, { labels: { ...labels } }).map((f) => (kinds[f.key] ? { ...f, type: kinds[f.key]! } : f)),
    /** The tool's input with the coach's edits, or a sentence the coach can read. */
    merge: (proposal: { input: unknown }, edits: Record<string, unknown>): I => {
      const before = schema.safeParse((proposal.input as { asked?: unknown } | null)?.asked);
      if (!before.success) throw new EditRefused('This card can no longer be edited. Ask for it again.');
      const stray = Object.keys(edits).find((k) => !keys.includes(k));
      if (stray) throw new EditRefused('That cannot be changed on this card. Ask for it in words instead.');
      const merged: Record<string, unknown> = { ...before.data };
      for (const [key, value] of Object.entries(edits)) merged[key] = value === '' || value === undefined ? null : value;
      const after = schema.safeParse(merged);
      if (!after.success) {
        const key = String(after.error.issues[0]?.path[0] ?? '');
        throw new EditRefused(`${labels[key] ?? 'That'} is not a value this card can take.`);
      }
      return after.data;
    },
  };
}
