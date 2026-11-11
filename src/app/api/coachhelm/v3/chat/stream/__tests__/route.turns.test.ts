/**
 * The CoachHelm chat route, end to end, against a scripted model and an in-memory database.
 *
 * Everything between the request and the rows runs for real: the route, the turn runner, the model loop, the store
 * (with and without the held columns), the action ledger and the Undo hold. Only the model, the database, the tool set
 * and the session are stand-ins (helpers.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { asTools, fakeDb, fakeModel, newToolLog, readEvents, readTool, taskTool, text, textOf, thinking, toolUse, type FakeDb, type FakeModel, type ToolLog } from './helpers';
import type { ChatTool } from '@/lib/coachhelm/v3/chat/engine/tool';
import type { ChatEvent } from '@/lib/coachhelm/v3/chat/engine/protocol';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  admin: null as unknown as { client: unknown },
  model: null as unknown,
  modelFactory: null as null | (() => unknown),
  tools: [] as unknown[],
  playerTools: [] as unknown[],
  role: 'coach' as 'coach' | 'player',
  toolsFor: vi.fn(),
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  checkBudget: vi.fn(async () => ({ allowed: true }) as { allowed: boolean; fallback_reason?: string }),
  loadPlayersFigures: vi.fn(async (..._args: unknown[]) => new Map()),
  loadPlayerProfile: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
}));

vi.mock('@sentry/nextjs', () => ({ setConversationId: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.admin.client) }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true })),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })), RATE_LIMITS: { API_GENERAL: {} } }));
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({ checkBudget: h.checkBudget, recordSpend: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: h.logServerError, logServerEvent: h.logServerEvent }));
vi.mock('@/lib/observability/metrics', () => ({ recordAi: vi.fn() }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: vi.fn(async () => true), isClubhouseForTeam: vi.fn(() => false) }));
// The Clubhouse screens' loaders the route binds for the tools. Stand-ins here: what matters is which the route binds for whom, and with what.
vi.mock('@/clubhouse/data/player-figures', () => ({ loadPlayersFigures: h.loadPlayersFigures, loadPlayerPuttBands: vi.fn(async () => null), filterForFigureWindow: vi.fn(() => ({})) }));
vi.mock('@/clubhouse/data/qualifiers', () => ({ loadQualifierList: vi.fn(async () => null), loadQualifierDetail: vi.fn(async () => null) }));
vi.mock('@/clubhouse/data/roster', () => ({ loadRoster: vi.fn(async () => null) }));
vi.mock('@/clubhouse/data/stats-player', () => ({ loadPlayerProfile: h.loadPlayerProfile }));
vi.mock('@/clubhouse/data/stats-team', () => ({ loadTeamStats: vi.fn(async () => null) }));
vi.mock('@/clubhouse/data/team-rounds', () => ({ loadTeamRounds: vi.fn(async () => null) }));
vi.mock('@/clubhouse/data/team-sg', () => ({ loadTeamStrokesGained: vi.fn(async () => null) }));
vi.mock('@/lib/coachhelm/v3/chat/registry', () => ({ toolsFor: h.toolsFor }));
vi.mock('@/lib/coachhelm/v3/chat/instructions', () => ({ instructionBlocks: vi.fn((surface: string) => (surface === 'player' ? { policy: 'PLAYER POLICY', team: 'PLAYER BLOCK' } : { policy: 'POLICY', team: 'TEAM BLOCK' })) }));
vi.mock('@/lib/coachhelm/v3/chat/ask-knows', () => ({ readAskKnows: vi.fn(async () => null), knowsSection: vi.fn(() => '') }));
vi.mock('@/lib/coachhelm/v3/chat/player-allowance', () => ({ readBucket: vi.fn(async () => 'ok'), recordPlayerSpend: vi.fn(async () => {}) }));
vi.mock('@/lib/coachhelm/v3/chat/player-context', () => ({
  resolvePlayerChatContext: vi.fn(async () => ({ coach_id: '', user_id: 'user-9', team_id: 'team-1', team_name: 'Test Team', timezone: 'America/New_York', roster: [{ id: 'player-me', name: 'Eli Stone' }], player_id: 'player-me' })),
}));
vi.mock('@/lib/coachhelm/v3/chat/context', async (original) => {
  const real = await original<typeof import('@/lib/coachhelm/v3/chat/context')>();
  return {
    ...real,
    resolveCoachChatContext: vi.fn(async () => {
      if (h.role === 'player') throw Object.assign(new real.CoachContextError('Ask CoachHelm is for coaches.', 403), { reason: 'not_a_coach' });
      return { coach_id: 'coach-1', user_id: 'user-1', team_id: 'team-1', team_name: 'Test Team', timezone: 'America/New_York', roster: [{ id: 'player-a', name: 'Avery Lane' }, { id: 'player-b', name: 'Blake Reed' }] };
    }),
  };
});
vi.mock('@/lib/coachhelm/v3/chat/engine/model', async (original) => {
  const real = await original<typeof import('@/lib/coachhelm/v3/chat/engine/model')>();
  return { ...real, anthropicModelClient: () => (h.modelFactory ? h.modelFactory() : h.model) };
});
// The real hold, with a 40 ms window instead of 8 s so a test can watch it release.
vi.mock('@/lib/coachhelm/v3/chat/undo-hold', async (original) => {
  const real = await original<typeof import('@/lib/coachhelm/v3/chat/undo-hold')>();
  return { ...real, holdForExecution: (sb: never, args: { run_id: string }) => real.holdForExecution(sb, { ...args, now: Date.now() - real.UNDO_HOLD_MS + 40 }) };
});

import { POST } from '../route';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import { MissingModelKeyError } from '@/lib/coachhelm/v3/chat/engine/model';

const MESSAGES = 'golf_coachhelm_chat_messages';
const RUNS = 'golf_coachhelm_action_runs';

let db: FakeDb;
let log: ToolLog;
let turn = 0;

function setup(opts: { modelColumns?: boolean; holdColumn?: boolean } = {}) {
  db = fakeDb(opts);
  h.db = db;
  h.admin = fakeDb();
  log = newToolLog();
  h.role = 'coach';
  h.modelFactory = null;
  const coachTools: ChatTool[] = asTools(readTool('get_player_stats', log, 71.4), readTool('get_team_stats', log, 74.2), taskTool('create_focus_area', log));
  const playerTools: ChatTool[] = asTools(readTool('get_my_stats', log, 73.1), taskTool('create_focus_area', log));
  h.toolsFor.mockImplementation((surface: string) => (surface === 'player' ? playerTools : coachTools));
}

const script = (...steps: Parameters<typeof fakeModel>[0]): FakeModel => {
  const model = fakeModel(steps);
  h.model = model;
  return model;
};

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ response: Response; events: ChatEvent[] }> {
  const response = (await POST({ json: async () => ({ client_turn_id: `turn-${(turn += 1)}`, ...body }), signal } as unknown as NextRequest)) as Response;
  const events = response.headers.get('content-type')?.startsWith('text/event-stream') ? await readEvents(response) : [];
  // Bookkeeping deferred with `after()` runs straight away outside a request; let it settle.
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { response, events };
}

const ask = (message: string, conversation_id?: string | null, extra: Record<string, unknown> = {}) => post({ message, conversation_id: conversation_id ?? null, ...extra });
const decide = (conversation_id: string, key: string, approved: boolean) => post({ conversation_id, decision: { key, approved } });
const conversationOf = (events: ChatEvent[]): string => (events.find((e) => e.type === 'message_start') as { conversation_id: string }).conversation_id;
const done = (events: ChatEvent[]) => events.find((e) => e.type === 'done') as { status: string } | undefined;
const assistantRows = () => (db.tables[MESSAGES] ?? []).filter((r) => r.role === 'assistant');
const keyOf = (events: ChatEvent[]): string => (events.find((e) => e.type === 'decision_needed') as { key: string }).key;
const runs = () => db.tables[RUNS] ?? [];
const lastRequestMessages = (model: FakeModel) => model.requests.at(-1)!.messages as Array<{ role: string; content: unknown }>;

beforeEach(() => {
  setup();
  h.logServerError.mockClear();
  h.checkBudget.mockResolvedValue({ allowed: true });
});

describe('a plain answer', () => {
  it('streams word by word, stores the turn complete, and keeps the model’s messages exactly as returned', async () => {
    const model = script({ content: [thinking('sig-1'), text('Avery is averaging 71.4 over the last ten rounds.')] });
    const { response, events } = await ask('How is Avery scoring?');

    expect(response.headers.get('x-conversation-id')).toBe(conversationOf(events));
    expect(events.filter((e) => e.type === 'text_delta').length).toBeGreaterThan(3);
    expect(textOf(events)).toBe('Avery is averaging 71.4 over the last ten rounds.');
    expect(done(events)?.status).toBe('complete');
    expect(events.at(-1)?.type).toBe('done');
    // Thinking never reaches the browser: not its text, not its signature.
    expect(JSON.stringify(events)).not.toContain('sig-1');

    const [row] = assistantRows();
    expect(assistantRows()).toHaveLength(1);
    expect(row).toMatchObject({ status: 'complete', content: 'Avery is averaging 71.4 over the last ten rounds.', pending_decision: null });
    expect(row!.model_messages).toEqual([
      { role: 'user', content: 'How is Avery scoring?' },
      { role: 'assistant', content: [thinking('sig-1'), text('Avery is averaging 71.4 over the last ten rounds.')] },
    ]);

    const request = model.requests[0]!;
    expect(request.model).toBe('claude-sonnet-5-5');
    expect(request.max_tokens).toBe(16000);
    expect(request.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(request.output_config).toEqual({ effort: 'medium' });
    expect(request.tool_choice).toEqual({ type: 'auto' });
    expect(request.fallbacks).toBe('default');
    expect(request.betas).toContain('server-side-fallback-2026-07-01');
    expect(request).not.toHaveProperty('temperature');
    // Cache order: tools, then the policy block (one hour), then the team's block; the tail is cached by the request-level marker.
    expect(request.system).toEqual([
      { type: 'text', text: 'POLICY', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'TEAM BLOCK', cache_control: { type: 'ephemeral' } },
    ]);
    expect(request.cache_control).toEqual({ type: 'ephemeral' });
    expect((request.tools as Array<{ name: string; eager_input_streaming?: boolean }>).map((t) => [t.name, t.eager_input_streaming])).toEqual([
      ['get_player_stats', true],
      ['get_team_stats', true],
      ['create_focus_area', true],
    ]);
  });

  it('the next question replays the stored messages, thinking included, and appends', async () => {
    script({ content: [thinking('sig-1'), text('71.4.')] });
    const first = await ask('How is Avery scoring?');
    const model = script({ content: [text('Blake is at 74.')] });
    await ask('And Blake?', conversationOf(first.events));

    expect(lastRequestMessages(model)).toEqual([
      { role: 'user', content: 'How is Avery scoring?' },
      { role: 'assistant', content: [thinking('sig-1'), text('71.4.')] },
      { role: 'user', content: 'And Blake?' },
    ]);
    expect(assistantRows()).toHaveLength(2);
  });
});

describe('reads', () => {
  it('run in parallel and go back to the model in one message, in call order', async () => {
    const model = script(
      { content: [thinking('sig-a'), toolUse('tu_1', 'get_player_stats', { player_id: 'player-a' }), toolUse('tu_2', 'get_team_stats', {})] },
      { content: [text('Avery 71.4, the team 74.2.')] },
    );
    const { events } = await ask('Avery against the team?');

    expect(log.maxRunning).toBe(2);
    const started = events.filter((e) => e.type === 'read_started') as Array<{ label: string }>;
    expect(started.map((e) => e.label)).toEqual(['Reading get player stats', 'Reading get team stats']);
    expect(events.filter((e) => e.type === 'read_finished').every((e) => (e as { state: string }).state === 'done')).toBe(true);
    const refs = events.filter((e) => e.type === 'evidence').map((e) => ((e as { part: { data: { ref: string; tool: string } } }).part.data.ref));
    expect(refs.sort()).toEqual(['e1', 'e2']);

    const sent = lastRequestMessages(model);
    expect(sent).toHaveLength(3);
    const results = sent[2]!.content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(results.map((r) => [r.type, r.tool_use_id])).toEqual([['tool_result', 'tu_1'], ['tool_result', 'tu_2']]);
    expect(JSON.parse(results[0]!.content)).toMatchObject({ summary: 'get_player_stats is 71.4', evidence_ref: 'e1' });
    expect(JSON.parse(results[1]!.content)).toMatchObject({ evidence_ref: 'e2' });

    const [row] = assistantRows();
    expect(row!.status).toBe('complete');
    expect((row!.model_messages as unknown[]).length).toBe(4);
    expect((row!.ui_parts as Array<{ type: string }>).map((p) => p.type)).toEqual(['data-progress', 'data-progress', 'data-evidence', 'data-evidence', 'text']);
  });

  it('an input the schema rejects is never run: the model is told, as an error result', async () => {
    const model = script({ content: [toolUse('tu_1', 'get_player_stats', { player_id: 42 })] }, { content: [text('I could not read that.')] });
    await ask('Avery?');
    expect(log.reads).toHaveLength(0);
    const [result] = lastRequestMessages(model)[2]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result!.is_error).toBe(true);
    expect(result!.content).toContain('player_id');
  });

  it('after the last allowed step the model gets one call with no tools to answer from what it has', async () => {
    const reads = Array.from({ length: 8 }, (_, i) => ({ content: [toolUse(`tu_${i}`, 'get_team_stats', {})] }));
    const model = script(...reads, { content: [text('Here is what I found.')] });
    const { events } = await ask('Everything?');
    expect(model.requests).toHaveLength(9);
    expect(model.requests[7]!.tool_choice).toEqual({ type: 'auto' });
    expect(model.requests[8]!.tool_choice).toEqual({ type: 'none' });
    expect(done(events)?.status).toBe('complete');
  });
});

describe('a task', () => {
  const propose = async () => {
    script({ content: [thinking('sig-p'), text('Here is the focus area.'), toolUse('tu_task', 'create_focus_area', { title: 'Putting from 6 feet' })] });
    const { events } = await ask('Make a putting focus area');
    return { events, conversationId: conversationOf(events), key: keyOf(events) };
  };

  it('is proposed, not run: the card is shown, the ledger holds the plan, and the turn is stored complete and waiting', async () => {
    const { events } = await propose();

    expect(log.plans).toEqual([{ title: 'Putting from 6 feet' }]);
    expect(log.commits).toHaveLength(0);
    const proposal = (events.find((e) => e.type === 'proposal') as { part: { id: string; data: { idempotency_key: string; tool: string; summary: string } } }).part;
    expect(proposal.data).toMatchObject({ tool: 'create_focus_area', summary: 'Create the focus area "Putting from 6 feet".' });
    expect(proposal.id).toBe(`proposal-${proposal.data.idempotency_key}`);
    expect(done(events)?.status).toBe('awaiting_decision');

    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ status: 'proposed', tool_name: 'create_focus_area', idempotency_key: proposal.data.idempotency_key });
    const [row] = assistantRows();
    expect(row!.status).toBe('complete');
    expect(row!.pending_decision).toMatchObject({ order: ['tu_task'], tasks: [{ tool: 'create_focus_area', tool_use_id: 'tu_task' }], steps: 1 });
    // The assistant message that asked is stored as returned: the tool call waits for its result.
    expect((row!.model_messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('confirmed: held for Undo, the model is told it is held, the same row is completed, then the stored plan is committed once', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('It is held for a few seconds; the card shows when it goes through.')] });
    const { events } = await decide(conversationId, key, true);

    expect(events[0]).toMatchObject({ type: 'message_start', resumed: true });
    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: true });
    const receipt = (events.find((e) => e.type === 'receipt') as { part: { id: string; data: { status: string; held_until: string } } }).part;
    expect(receipt.id).toBe(`receipt-${key}`);
    expect(receipt.data.status).toBe('held');
    expect(done(events)?.status).toBe('complete');
    expect(textOf(events)).toContain('held');

    // The decision continues the SAME assistant turn: its tool_use gets a tool_result, and no new question is asked.
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const [result] = sent[2]!.content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_task' });
    expect(result!.content).toMatch(/^Held until \d\d:\d\d:\d\d/);
    expect(result!.content).toContain('not done yet');

    // One assistant row for the whole exchange, stored complete, nothing waiting.
    expect(assistantRows()).toHaveLength(1);
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'complete', pending_decision: null });
    expect(row!.content).toContain('Here is the focus area.');
    expect(row!.content).toContain('held for a few seconds');
    expect((row!.model_messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((row!.ui_parts as Array<{ type: string }>).some((p) => p.type === 'data-turn-incomplete')).toBe(false);

    // Nothing is written during the hold; after it, the plan the coach saw is committed exactly once.
    expect(log.commits).toHaveLength(0);
    expect(runs()[0]!.status).toBe('held');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0]).toMatchObject({ summary: 'Create the focus area "Putting from 6 feet".', idempotency_key: key });
    expect(log.plans).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ status: 'completed', result: { status: 'completed', summary: 'Created the focus area.' } });
  });

  it('a second Confirm of the same card runs nothing twice and is answered from the stored turn', async () => {
    const { conversationId, key } = await propose();
    script({ content: [text('Held.')] });
    await decide(conversationId, key, true);
    const model = script();
    const { events } = await decide(conversationId, key, true);
    expect(model.requests).toHaveLength(0);
    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: true });
    expect(events.some((e) => e.type === 'receipt')).toBe(true);
    expect(done(events)?.status).toBe('complete');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(log.commits).toHaveLength(1);
    expect(assistantRows()).toHaveLength(1);
  });

  it('without the hold column it is committed at once and the receipt says there is no Undo', async () => {
    setup({ holdColumn: false });
    const { conversationId, key } = await propose();
    const model = script({ content: [text('Done.')] });
    const { events } = await decide(conversationId, key, true);
    expect(log.commits).toHaveLength(1);
    const receipt = (events.find((e) => e.type === 'receipt') as { part: { data: { status: string; summary: string } } }).part.data;
    expect(receipt).toMatchObject({ status: 'completed', summary: 'Created the focus area. Undo isn’t on here yet.' });
    const [result] = lastRequestMessages(model)[2]!.content as Array<{ content: string }>;
    expect(result!.content).toMatch(/^Committed\./);
    expect(runs()[0]!.status).toBe('completed');
  });

  it('Cancel: nothing is committed, the ledger records the denial, the model is told, and the turn completes on the same row', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('No problem, nothing was created.')] });
    const { events } = await decide(conversationId, key, false);

    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: false });
    expect(events.some((e) => e.type === 'receipt')).toBe(false);
    expect(done(events)?.status).toBe('complete');
    const [result] = lastRequestMessages(model)[2]!.content as Array<{ content: string }>;
    expect(result!.content).toBe('Declined by the coach. Nothing was written.');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(log.commits).toHaveLength(0);
    expect(runs()[0]!.status).toBe('denied');
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', pending_decision: null });
  });

  it('a new message while the card waits counts as Cancel: the model is told the card was declined before the new question', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('Blake is at 74.')] });
    const { events } = await ask('Actually, how is Blake scoring?', conversationId);

    expect(done(events)?.status).toBe('complete');
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent[2]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_task', content: 'The coach asked something else instead of confirming. Nothing was written.' },
      { type: 'text', text: 'Actually, how is Blake scoring?' },
    ]);
    expect(runs()[0]!.status).toBe('denied');
    expect(log.commits).toHaveLength(0);

    // The old card no longer waits, in the row or after a reload, and it can no longer be confirmed.
    const [first, second] = assistantRows();
    expect(first!.pending_decision).toBeNull();
    expect((first!.ui_parts as Array<{ type: string; state?: string }>).find((p) => p.type === 'tool-create_focus_area')?.state).toBe('output-denied');
    expect(second).toMatchObject({ status: 'complete', content: 'Blake is at 74.' });
    const late = await decide(conversationId, key, true);
    expect(late.events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: false });
    expect(log.commits).toHaveLength(0);
  });

  it('a reload mid-decision restores a card that can still be confirmed', async () => {
    const { conversationId, key } = await propose();
    // What the page loads after a reload: the stored rows, restored for the thread.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    const card = restored.at(-1)!.parts.find((p) => p.type === 'tool-create_focus_area') as unknown as { state: string; approval: { id: string } };
    expect(card).toMatchObject({ state: 'approval-requested', approval: { id: key } });
    expect(restored.at(-1)!.parts.some((p) => p.type === 'data-action-proposal')).toBe(true);

    script({ content: [text('Held.')] });
    const { events } = await decide(conversationId, card.approval.id, true);
    expect(done(events)?.status).toBe('complete');
    expect(events.some((e) => e.type === 'receipt')).toBe(true);
    const after = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    expect(after.at(-1)!.parts.find((p) => p.type === 'tool-create_focus_area')).toMatchObject({ state: 'approval-responded', approval: { id: key, approved: true } });
  });

  it('a plan that cannot be recorded shows no card and the model is told nothing was written', async () => {
    db.tables[RUNS] = [];
    const client = db.client as { from: (table: string) => unknown };
    const realFrom = client.from;
    client.from = (table: string) => (table === RUNS ? { upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }) } : realFrom(table));
    const model = script({ content: [toolUse('tu_task', 'create_focus_area', { title: 'Wedges' })] }, { content: [text('I could not prepare that.')] });
    const { events } = await ask('Make a wedge focus area');
    expect(events.some((e) => e.type === 'proposal' || e.type === 'decision_needed')).toBe(false);
    const [result] = lastRequestMessages(model)[2]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result).toMatchObject({ is_error: true });
    expect(result!.content).toContain('Nothing was written');
    expect(done(events)?.status).toBe('complete');
  });
});

describe('a retried client_turn_id', () => {
  it('is answered from the stored turn: the model is not called a second time', async () => {
    script({ content: [text('71.4.')] });
    const first = await post({ message: 'How is Avery scoring?', conversation_id: null, client_turn_id: 'same-turn' });
    const model = script();
    const again = await post({ message: 'How is Avery scoring?', conversation_id: conversationOf(first.events), client_turn_id: 'same-turn' });
    expect(model.requests).toHaveLength(0);
    expect(textOf(again.events)).toBe('71.4.');
    expect(done(again.events)?.status).toBe('complete');
    expect(assistantRows()).toHaveLength(1);
    expect((db.tables[MESSAGES] ?? []).filter((r) => r.role === 'user')).toHaveLength(1);
  });

  it('a retry of a turn that failed runs again and replaces the failed row', async () => {
    script({ content: [text('Partial')], fail: new Error('socket closed') });
    const first = await post({ message: 'How is Avery scoring?', conversation_id: null, client_turn_id: 'retry-me' });
    expect(done(first.events)?.status).toBe('failed');
    const model = script({ content: [text('71.4.')] });
    const again = await post({ message: 'How is Avery scoring?', conversation_id: conversationOf(first.events), client_turn_id: 'retry-me' });
    expect(done(again.events)?.status).toBe('complete');
    expect(lastRequestMessages(model)).toEqual([{ role: 'user', content: 'How is Avery scoring?' }]);
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', content: '71.4.' });
  });
});

describe('a turn that does not finish', () => {
  it('a refusal withdraws the words, tells the coach in a sentence, and leaves only the question in the stored history', async () => {
    script({ content: [text('I can')], stop_reason: 'refusal' });
    const { events } = await ask('Something the model declines');
    expect(events.some((e) => e.type === 'text_discard')).toBe(true);
    expect(events.find((e) => e.type === 'error')).toEqual({ type: 'error', message: 'CoachHelm can’t help with that one. Try asking it another way.', action: 'none' });
    expect(done(events)?.status).toBe('failed');
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'failed', content: '' });
    expect(row!.model_messages).toEqual([{ role: 'user', content: 'Something the model declines' }]);
    expect((row!.ui_parts as Array<{ type: string }>).at(-1)).toMatchObject({ type: 'data-turn-incomplete' });
  });

  it('a model error mid-stream gives the coach a sentence without provider text and stores the turn as failed', async () => {
    script({ content: [text('Avery is averaging')], fail: new Error('upstream exploded: sk-ant-secret https://provider.example/billing') });
    const { events } = await ask('How is Avery scoring?');
    const error = events.find((e) => e.type === 'error') as { message: string; action: string };
    expect(error.message).toBe('Something went wrong while answering. Please try again.');
    expect(JSON.stringify(events)).not.toContain('sk-ant');
    expect(done(events)?.status).toBe('failed');
    expect(assistantRows()[0]).toMatchObject({ status: 'failed' });
    // After a reload the fragment is not shown as an answer.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    expect(restored.at(-1)!.parts.map((p) => p.type)).toEqual(['data-turn-incomplete']);
  });

  it('a missing API key is a clear, logged sentence, not a crash', async () => {
    h.modelFactory = () => {
      throw new MissingModelKeyError();
    };
    const { events } = await ask('How is Avery scoring?');
    expect((events.find((e) => e.type === 'error') as { message: string }).message).toContain('not set up on this server');
    expect(done(events)?.status).toBe('failed');
    expect(h.logServerError.mock.calls.some((c) => String((c as unknown[])[0]).includes('ANTHROPIC_API_KEY'))).toBe(true);
  });

  it('the browser going away stops the model: no further call is made and the turn is stored as stopped', async () => {
    const abort = new AbortController();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const model = script({ content: [toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('never read')], gate });
    const pending = post({ message: 'Team?', conversation_id: null }, abort.signal);
    await new Promise((resolve) => setTimeout(resolve, 60));
    abort.abort();
    release();
    const { events } = await pending;
    expect(model.requests).toHaveLength(2);
    expect(textOf(events)).toBe('');
    expect(done(events)?.status ?? 'stopped').toBe('stopped');
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'failed' });
    expect(row!.model_messages).toEqual([{ role: 'user', content: 'Team?' }]);
  });
});

describe('a database without the new migration', () => {
  beforeEach(() => setup({ modelColumns: false }));

  it('answers, stores the turn, and replays earlier turns as text', async () => {
    script({ content: [thinking('sig-1'), text('71.4.')] });
    const first = await ask('How is Avery scoring?');
    expect(done(first.events)?.status).toBe('complete');
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', content: '71.4.' });
    expect(assistantRows()[0]).not.toHaveProperty('model_messages');

    const model = script({ content: [text('74.')] });
    await ask('And Blake?', conversationOf(first.events));
    expect(lastRequestMessages(model)).toEqual([
      { role: 'user', content: 'How is Avery scoring?' },
      { role: 'assistant', content: '71.4.' },
      { role: 'user', content: 'And Blake?' },
    ]);
  });

  it('a card still confirms: its turn is kept in the ledger row, and Confirm continues the same turn', async () => {
    script({ content: [thinking('sig-p'), toolUse('tu_task', 'create_focus_area', { title: 'Putting from 6 feet' })] });
    const proposed = await ask('Make a putting focus area');
    expect(done(proposed.events)?.status).toBe('awaiting_decision');
    const key = keyOf(proposed.events);
    expect((runs()[0]!.proposed_input as { resume?: unknown }).resume).toBeTruthy();

    const model = script({ content: [text('Held.')] });
    const { events } = await decide(conversationOf(proposed.events), key, true);
    expect(done(events)?.status).toBe('complete');
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent[1]!.content).toEqual([thinking('sig-p'), toolUse('tu_task', 'create_focus_area', { title: 'Putting from 6 feet' })]);
    expect((sent[2]!.content as Array<{ tool_use_id: string }>)[0]!.tool_use_id).toBe('tu_task');
    expect(assistantRows()).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(log.commits).toHaveLength(1);
  });
});

describe('a conversation written by the previous stack', () => {
  it('replays as text, with what was done named from the stored cards', async () => {
    const conversation = (db.tables.golf_coachhelm_chat_conversations = [{ id: '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11', coach_id: 'coach-1' }])[0]!;
    db.tables[MESSAGES] = [
      { id: 'm1', conversation_id: conversation.id, role: 'user', content: 'Make a putting focus area', created_at: '2026-10-01T10:00:00Z', client_turn_id: 'old-1', status: null, ui_parts: null },
      { id: 'm2', conversation_id: conversation.id, role: 'assistant', content: '', created_at: '2026-10-01T10:00:05Z', client_turn_id: 'old-2', status: 'failed', ui_parts: [{ type: 'data-action-receipt', id: 'receipt-k', data: { status: 'completed', summary: 'Created it.' } }, { type: 'data-turn-incomplete', data: { note: 'x' } }] },
      { id: 'm3', conversation_id: conversation.id, role: 'assistant', content: 'Here is the plan.', created_at: '2026-10-01T10:00:02Z', client_turn_id: 'old-1', status: 'complete', ui_parts: [{ type: 'text', text: 'Here is the plan.' }, { type: 'data-action-proposal', id: 'proposal-k', data: { idempotency_key: 'k', summary: 'Create the focus area.' } }, { type: 'tool-create_focus_area', toolCallId: 'call_1', state: 'approval-requested', approval: { id: 'sdk-approval-1' } }] },
    ];
    const model = script({ content: [text('Yes, it was created.')] });
    const { events } = await ask('Did that go through?', conversation.id);
    expect(done(events)?.status).toBe('complete');
    expect(lastRequestMessages(model)).toEqual([
      { role: 'user', content: 'Make a putting focus area' },
      { role: 'assistant', content: 'Here is the plan.\n[Proposed, not confirmed: Create the focus area.]' },
      { role: 'user', content: 'Did that go through?' },
    ]);
    // Its card carries an approval id of the old SDK, which names nothing the server holds: it is not offered again.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    expect(restored.some((m) => m.parts.some((p) => p.type.startsWith('tool-')))).toBe(false);
  });
});

describe('the gates', () => {
  it('an exhausted budget answers before anything is created', async () => {
    h.checkBudget.mockResolvedValue({ allowed: false, fallback_reason: 'budget_gated' });
    const model = script();
    const { response } = await ask('How is Avery scoring?');
    expect(response.status).toBe(429);
    expect(model.requests).toHaveLength(0);
    expect(db.tables.golf_coachhelm_chat_conversations ?? []).toHaveLength(0);
    expect(db.tables[MESSAGES] ?? []).toHaveLength(0);
  });

  it('another coach’s conversation is not found', async () => {
    db.tables.golf_coachhelm_chat_conversations = [{ id: '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11', coach_id: 'someone-else' }];
    const { response } = await ask('Hello', '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11');
    expect(response.status).toBe(404);
  });

  it('a request with neither a message nor a decision is refused', async () => {
    const { response } = await post({ conversation_id: null });
    expect(response.status).toBe(400);
  });
});

describe('a player’s turn', () => {
  beforeEach(() => {
    h.role = 'player';
  });

  it('runs on the same runner with the player’s own context and loaders, and stores nothing', async () => {
    const model = script({ content: [toolUse('tu_1', 'get_my_stats', { player_id: 'player-b' })] }, { content: [text('You are averaging 73.1.')] });
    const { events } = await ask('How am I scoring?');
    expect(textOf(events)).toBe('You are averaging 73.1.');
    expect(done(events)?.status).toBe('complete');
    expect((model.requests[0]!.system as Array<{ text: string }>).map((b) => b.text)).toEqual(['PLAYER POLICY', 'PLAYER BLOCK']);
    expect(h.toolsFor).toHaveBeenCalledWith('player', expect.objectContaining({ player_id: 'player-me' }));
    // The tool is handed the session's player and a roster of one: a teammate's id in the model's input resolves to nobody.
    const [read] = log.reads;
    expect(read!.who).toMatchObject({ player_id: 'player-me', roster: [{ id: 'player-me', name: 'Eli Stone' }] });
    // The loaders bound for a player are their own: no team page, roster or team rounds at all, and a teammate's id is dropped before
    // the screen's loader is ever called.
    const loaders = read!.loaders;
    expect(loaders.teamStats).toBeUndefined();
    expect(loaders.roster).toBeUndefined();
    expect(loaders.teamRounds).toBeUndefined();
    expect(loaders.teamStrokesGained).toBeUndefined();
    await loaders.playerFigures!(['player-b', 'player-me'], 'last10');
    expect(h.loadPlayersFigures.mock.calls.at(-1)?.[2]).toEqual(['player-me']);
    h.loadPlayerProfile.mockClear();
    expect(await loaders.playerStats!('player-b', 'last10')).toBeNull();
    expect(h.loadPlayerProfile).not.toHaveBeenCalled();
    await loaders.playerStats!('player-me', 'season');
    expect(h.loadPlayerProfile.mock.calls.at(-1)?.[0]).toMatchObject({ viewer: 'player', playerId: 'player-me', teamId: 'team-1', window: 'season' });
    expect(db.tables[MESSAGES] ?? []).toHaveLength(0);
  });

  it('cannot make a change: a task call is refused before it is planned, and no ledger row is written', async () => {
    const model = script({ content: [toolUse('tu_1', 'create_focus_area', { title: 'Mine' })] }, { content: [text('I can’t do that here.')] });
    const { events } = await ask('Make me a focus area');
    expect(log.plans).toHaveLength(0);
    expect(runs()).toHaveLength(0);
    expect(events.some((e) => e.type === 'proposal' || e.type === 'decision_needed')).toBe(false);
    const [result] = lastRequestMessages(model)[2]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result).toMatchObject({ is_error: true, content: 'Changes cannot be made from here. Nothing was written.' });
  });

  it('a decision is not accepted from a player', async () => {
    const { response } = await post({ conversation_id: '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11', decision: { key: 'k', approved: true } });
    expect(response.status).toBe(400);
  });
});
