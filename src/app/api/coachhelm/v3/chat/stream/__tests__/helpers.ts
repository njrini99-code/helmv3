/**
 * Test doubles for the chat route suite: an in-memory Supabase client small enough to read, and a scripted model.
 * The route, the engine, the store, the ledger and the hold all run for real against them.
 */
import { z } from 'zod';
import type { ModelClient, ModelRequest, ModelResponse, ModelStream, ModelStreamEvent } from '@/lib/coachhelm/v3/chat/engine/model';
import { createChatEventParser, type ChatEvent } from '@/lib/coachhelm/v3/chat/engine/protocol';
import type { ChatTool, ReadTool, TaskTool, ToolContext } from '@/lib/coachhelm/v3/chat/engine/tool';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** The held migration's columns on the messages table. */
  modelColumns: boolean;
  /** The Undo hold's column on the ledger. */
  holdColumn: boolean;
  client: unknown;
}

const UNIQUE: Record<string, string[]> = {
  golf_coachhelm_chat_messages: ['conversation_id', 'role', 'client_turn_id'],
  golf_coachhelm_action_runs: ['coach_id', 'idempotency_key'],
};

let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, '0')}`;

/** A PostgREST-shaped query builder over arrays. Only what the chat code calls. */
export function fakeDb(opts: { modelColumns?: boolean; holdColumn?: boolean } = {}): FakeDb {
  const db: FakeDb = { tables: {}, modelColumns: opts.modelColumns ?? true, holdColumn: opts.holdColumn ?? true, client: null };
  const rowsOf = (table: string) => (db.tables[table] ??= []);
  const missing = (table: string, keys: string[]): { code: string; message: string } | null => {
    if (table === 'golf_coachhelm_chat_messages' && !db.modelColumns && keys.some((k) => k === 'model_messages' || k === 'pending_decision')) {
      return { code: '42703', message: 'column golf_coachhelm_chat_messages.model_messages does not exist' };
    }
    if (table === 'golf_coachhelm_action_runs' && !db.holdColumn && keys.includes('run_at')) return { code: '42703', message: 'column "run_at" does not exist' };
    return null;
  };

  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row = {};
    let columns: string[] = [];
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let returning = false;

    const run = (): { data: Row[] | null; error: { code: string; message: string } | null } => {
      const rows = rowsOf(table);
      const bad = missing(table, [...columns, ...Object.keys(payload)]);
      if (bad) return { data: null, error: bad };
      const match = () => rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'select') {
        let out = match();
        if (order) {
          const { column, ascending } = order;
          out = [...out].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        return { data: limit == null ? out : out.slice(0, limit), error: null };
      }
      if (op === 'insert' || op === 'upsert') {
        const keys = op === 'upsert' ? (upsertOpts.onConflict ?? '').split(',').filter(Boolean) : (UNIQUE[table] ?? []);
        const clash = keys.length > 0 && keys.every((k) => payload[k] != null) ? rows.find((r) => keys.every((k) => r[k] === payload[k])) : undefined;
        if (clash) {
          if (op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          if (upsertOpts.ignoreDuplicates) return { data: [], error: null };
          Object.assign(clash, payload);
          return { data: [clash], error: null };
        }
        const created: Row = { id: nextId(), created_at: new Date(Date.now() + (seq += 1)).toISOString(), ...payload };
        rows.push(created);
        return { data: [created], error: null };
      }
      const hit = match();
      for (const r of hit) Object.assign(r, payload);
      return { data: hit, error: null };
    };

    const builder = {
      select(cols?: string) {
        if (op === 'select') columns = (cols ?? '').split(',').map((c) => c.trim());
        else returning = true;
        return builder;
      },
      insert(values: Row) {
        op = 'insert';
        payload = { ...values };
        return builder;
      },
      update(values: Row) {
        op = 'update';
        payload = { ...values };
        return builder;
      },
      upsert(values: Row, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = 'upsert';
        payload = { ...values };
        upsertOpts = options;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push((r) => r[column] !== value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((r) => values.includes(r[column]));
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push((r) => (r[column] ?? null) === value);
        return builder;
      },
      lt(column: string, value: string) {
        filters.push((r) => String(r[column]) < value);
        return builder;
      },
      lte(column: string, value: string) {
        filters.push((r) => String(r[column]) <= value);
        return builder;
      },
      gt(column: string, value: string) {
        filters.push((r) => String(r[column]) > value);
        return builder;
      },
      order(column: string, options: { ascending?: boolean } = {}) {
        order = { column, ascending: options.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      async maybeSingle() {
        const res = run();
        return { data: res.error ? null : (res.data?.[0] ?? null), error: res.error };
      },
      async single() {
        const res = run();
        if (res.error) return { data: null, error: res.error };
        return res.data?.[0] ? { data: res.data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      },
      then(resolve: (value: { data: Row[] | null; error: { code: string; message: string } | null }) => unknown, reject?: (reason: unknown) => unknown) {
        const res = run();
        return Promise.resolve(returning || op === 'select' ? res : { data: null, error: res.error }).then(resolve, reject);
      },
    };
    return builder;
  };

  db.client = { from, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } };
  return db;
}

// ── A scripted model ────────────────────────────────────────────────────────────────────────────────────────────────

type Block = ModelResponse['content'][number];

export const thinking = (signature: string): Block => ({ type: 'thinking', thinking: '', signature }) as Block;
export const text = (value: string): Block => ({ type: 'text', text: value, citations: null }) as Block;
export const toolUse = (id: string, name: string, input: unknown): Block => ({ type: 'tool_use', id, name, input }) as Block;

export interface ScriptedStep {
  content: Block[];
  stop_reason?: ModelResponse['stop_reason'];
  /** Thrown after the text has streamed: a model error mid-stream. */
  fail?: unknown;
  /** Awaited before anything streams; lets a test abort the request while the model is "thinking". */
  gate?: Promise<void>;
}

export interface FakeModel extends ModelClient {
  requests: ModelRequest[];
}

/** Each call takes the next step. Text blocks are streamed a few characters at a time, thinking never is. */
export function fakeModel(steps: Array<ScriptedStep | ((request: ModelRequest) => ScriptedStep)>): FakeModel {
  const requests: ModelRequest[] = [];
  return {
    requests,
    stream(request, { signal }): ModelStream {
      requests.push(JSON.parse(JSON.stringify(request)) as ModelRequest);
      const next = steps.shift();
      if (!next) throw new Error('the scripted model was called more times than the test scripted');
      const step = typeof next === 'function' ? next(request) : next;
      let finished = false;
      const events = async function* (): AsyncGenerator<ModelStreamEvent> {
        if (step.gate) await step.gate;
        if (signal.aborted) throw new Error('Request was aborted.');
        for (const [index, block] of step.content.entries()) {
          if (block.type !== 'text') continue;
          yield { type: 'content_block_start', index, content_block: { ...block, text: '' } } as ModelStreamEvent;
          for (let i = 0; i < block.text.length; i += 5) {
            yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text.slice(i, i + 5) } } as ModelStreamEvent;
          }
        }
        if (step.fail) throw step.fail;
        finished = true;
      };
      return {
        [Symbol.asyncIterator]: events,
        async finalMessage() {
          if (!finished) throw step.fail ?? new Error('stream did not finish');
          return {
            id: `msg_${requests.length}`,
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-5-5',
            content: step.content,
            stop_reason: step.stop_reason ?? (step.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
          } as unknown as ModelResponse;
        },
      };
    },
  };
}

// ── Small tools on the contract ─────────────────────────────────────────────────────────────────────────────────────

export interface ToolLog {
  reads: Array<{ tool: string; input: unknown; who: ToolContext['who']; loaders: ToolContext['loaders'] }>;
  running: number;
  maxRunning: number;
  plans: unknown[];
  commits: ActionProposal[];
}

export const newToolLog = (): ToolLog => ({ reads: [], running: 0, maxRunning: 0, plans: [], commits: [] });

const envelope = (summary: string, value: number) => ({
  summary,
  measurements: [],
  series: [],
  detail: { value },
  coverage: 'complete' as const,
  coverage_note: null,
  as_of: '2026-11-10T12:00:00.000Z',
});

export function readTool(name: string, log: ToolLog, value: number): ReadTool<{ player_id?: string }> {
  return {
    kind: 'read',
    name,
    description: `Reads ${name}.`,
    input: z.object({ player_id: z.string().optional() }),
    progress: () => `Reading ${name.replace(/_/g, ' ')}`,
    run: async (ctx, input) => {
      log.reads.push({ tool: name, input, who: ctx.who, loaders: ctx.loaders });
      log.running += 1;
      log.maxRunning = Math.max(log.maxRunning, log.running);
      await new Promise((resolve) => setTimeout(resolve, 15));
      log.running -= 1;
      return envelope(`${name} is ${value}`, value);
    },
  };
}

export function taskTool(name: string, log: ToolLog): TaskTool<{ title: string }> {
  return {
    kind: 'task',
    name,
    description: `Does ${name}.`,
    input: z.object({ title: z.string().min(1) }),
    progress: (input) => `Drafting ${input.title}`,
    plan: async (_ctx, input) => {
      log.plans.push(input);
      return { action: 'Create a focus area', summary: `Create the focus area "${input.title}".`, facts: [{ label: 'Title', value: input.title }], affects: [], notifications: [], missing: [], idempotency_key: `focus:team-1:${input.title}` };
    },
    commit: async (_ctx, proposal) => {
      log.commits.push(proposal);
      const receipt: ActionReceipt = { status: 'completed', action: proposal.action, summary: 'Created the focus area.', created: [{ kind: 'focus_area', count: 1 }], notifications: [], partial_failures: [], retryable: false, at: '2026-11-10T12:00:09.000Z' };
      return receipt;
    },
  };
}

export const asTools = (...tools: Array<ReadTool<never> | TaskTool<never> | ChatTool>): ChatTool[] => tools as ChatTool[];

// ── Reading a response ──────────────────────────────────────────────────────────────────────────────────────────────

export async function readEvents(response: Response): Promise<ChatEvent[]> {
  const parse = createChatEventParser();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: ChatEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(...parse(decoder.decode(value, { stream: true })));
  }
  return events;
}

export const textOf = (events: ChatEvent[]): string => events.flatMap((e) => (e.type === 'text_delta' ? [e.delta] : [])).join('');
