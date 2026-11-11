/**
 * CoachHelm chat: the tool contract.
 *
 * A tool is plain data plus functions. It does not know about the model SDK, the stream or the ledger: the engine
 * (`engine/turn.ts`) owns all three. A tool says what it is, validates nothing itself (the engine validates the input
 * against `input` before any function here is called) and returns values.
 *
 * Who does what:
 *   read tool    `run` returns a `ToolResult` (a `ToolEnvelope`, optionally with UI parts). The engine draws the
 *                progress row from `progress(input)`, gives the read its `evidence_ref`, streams the evidence chip and
 *                hands the model the envelope with that ref.
 *   task tool    `plan` builds the real plan and writes nothing. The engine records it in the action ledger, shows the
 *                card and ends the turn waiting for the coach. On Confirm the engine claims the ledger row, holds it for
 *                the Undo window and then calls `commit` with the SAME proposal the coach saw (it is stored; `plan` is
 *                not run again). On Cancel `commit` is never called.
 *
 * Changes to this file are agreed between ENGINE and TOOLS and recorded in `CONTRACT_NOTES.md` beside it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { Database } from '@/lib/types/database';
import type { ActionProposal, ActionReceipt } from '../action-types';
import type { CoachChatContext } from '../context';
import type { ToolEnvelope } from '../provenance';
import type { ScreenLoaders } from '../screen-loaders';

export type ChatSurface = 'ask' | 'quick_chat' | 'practice_helper' | 'player';

/** A signed-in player's context: the roster is reduced to them (`resolvePlayerChatContext`), and `player_id` is theirs from the session. */
export type PlayerChatContext = CoachChatContext & { player_id: string };

export const isPlayerContext = (who: CoachChatContext | PlayerChatContext): who is PlayerChatContext =>
  typeof (who as { player_id?: unknown }).player_id === 'string';

/**
 * The Clubhouse screens' own loaders, handed in by the route (`src/lib` does not import `src/clubhouse`). TOOLS owns the
 * list (`../screen-loaders.ts`): a figure a screen draws is read through the loader that screen uses, and a tool must
 * cope with a loader being absent.
 */
export type { ScreenLoaders } from '../screen-loaders';

export interface ToolContext {
  /** The signed-in session client: RLS applies to every read and write. */
  sb: SupabaseClient<Database>;
  who: CoachChatContext | PlayerChatContext;
  conversationId: string;
  surface: ChatSurface;
  loaders: ScreenLoaders;
  /** Aborts when the browser goes away. Pass it to anything slow. */
  signal: AbortSignal;
  /**
   * This conversation's reads by `evidence_ref`: every read of this turn so far and the reads of earlier turns. A tool
   * that draws or computes from reads (`show_visual`, `summarise_data`) resolves the refs the model names here, so the
   * figures are copied by the server and never typed by the model.
   */
  reads: ReadonlyMap<string, ToolEnvelope>;
}

/** A UI part a tool wants in the thread besides its evidence chip: the stored `ui_parts` shapes (`data-visual-composition`, `data-artifact`, `data-brief`, …). */
export interface ChatDataPart {
  type: `data-${string}`;
  id?: string;
  data: unknown;
}

/**
 * What a read tool returns: the envelope, plus the few things an envelope cannot say. A bare `ToolEnvelope` is a valid
 * `ToolResult`. The model is sent `model_text` when there is one, otherwise the envelope; `parts` go to the coach.
 */
export type ToolResult = ToolEnvelope & {
  /** Extra UI parts, streamed and stored in order after the read finishes. Tools do not write to the stream. */
  parts?: ChatDataPart[];
  /** `false` for a result that is not a read of team data (a drawn visual, a draft, a refusal): no evidence chip and no `evidence_ref`. Default `true`. */
  evidence?: boolean;
  /** `true` when the turn must stop after this step for the coach to answer (the practice brief). */
  end_turn?: boolean;
  /**
   * The read as the model should be given it: finished, labelled lines ("Scoring avg: 74.2 | team 75.1"), one fact a
   * line. When set, these lines are what the model reads instead of the envelope's JSON (about a seventh of the
   * tokens), and each line is a unit the model can cite. The envelope, `model_text` included, still goes to the evidence
   * chip, the `reads` map and the grounding check.
   */
  model_text?: string;
  /**
   * A few words for the finished progress row, on what was read: "38 rounds", "1,412 putts". Left out, the engine uses
   * the first measurement's sample ("10 rounds") when the read has one. Never a figure the answer should state.
   */
  progress_detail?: string;
  /** A small drawing for the finished progress row, in the shape the thread's read pictures take (`practice-pictures.ts`). Not sent to the model. */
  progress_picture?: unknown;
};

interface ToolBase<I> {
  /** snake_case and stable: it is in stored conversations and in the ledger. */
  name: string;
  /** What it returns and when to use it. No formats, no shouting. */
  description: string;
  /** zod 4. The engine converts it to JSON Schema for the model and validates every input with it before calling the tool. */
  input: z.ZodType<I>;
  /** The human progress row, e.g. "Reading Eli's last 8 rounds". Never a tool name. Must not throw. */
  progress: (input: I) => string;
}

export interface ReadTool<I> extends ToolBase<I> {
  kind: 'read';
  /**
   * `true` for a tool on the read contract that changes something (saving or removing the coach's own note): the model
   * must ask for it itself, never from its code. Such a tool is sent without `allowed_callers`, stays strict, and a
   * call to it from code is refused before it runs.
   */
  direct_only?: boolean;
  /** Figures labelled and already computed; no raw rows for the model to add up. A throw becomes an `unavailable` read the model is told about. */
  run: (ctx: ToolContext, input: I) => Promise<ToolResult>;
}

export interface TaskTool<I, P extends ActionProposal = ActionProposal> extends ToolBase<I> {
  kind: 'task';
  /**
   * The real plan, built by the planner that will run it. No write. `P` must survive `JSON.stringify` unchanged: it is
   * stored and handed back to `commit`. Throw an `Error` whose message the coach can read when the plan cannot be
   * built; the model is told and no card is shown.
   */
  plan: (ctx: ToolContext, input: I) => Promise<P>;
  /**
   * Runs once, after Confirm and the Undo window. `proposal` is the stored one, with `idempotency_key` rewritten by the
   * engine to be unique to this one request by the model (see CONTRACT_NOTES.md): derive every downstream request id
   * from it, so a retry of this commit lands on the same rows and a new identical request does not. Read back before
   * reporting that nothing was saved.
   */
  commit: (ctx: ToolContext, proposal: P) => Promise<ActionReceipt>;
  /** `true`: no Undo window, it writes on Confirm (locking a lineup). The card must say so. */
  immediate?: boolean;
  /**
   * The card again, with the coach's edits to the fields it offered (`proposal.editable`). It plans afresh from the stored proposal
   * and the edits: the same reads and checks as `plan`, no write, no model. Throw an `Error` whose message the coach can read when
   * an edit cannot be made; the card then stays as it was. Left out: nothing on this task's card can be changed in place.
   */
  revise?: (ctx: ToolContext, proposal: P, edits: Record<string, unknown>) => Promise<P>;
}

// The registry holds tools of every input type; `any` is the only type every `ReadTool<I>` and `TaskTool<I, P>` is assignable to.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatTool = ReadTool<any> | TaskTool<any, any>;

/** TOOLS implements this in `../registry.ts`: the tools one surface offers one signed-in person, in a stable order (the order is part of the cached prefix). */
export type ToolsFor = (surface: ChatSurface, who: ToolContext['who']) => ChatTool[];
