/**
 * The CoachHelm chat route, end to end, against a scripted model and an in-memory database.
 *
 * Everything between the request and the rows runs for real: the route, the turn runner, the model loop, the store
 * (with and without the held columns), the action ledger and the Undo hold. Only the model, the database, the tool set
 * and the session are stand-ins (helpers.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { asTools, cited, codeToolUse, fakeDb, fakeModel, linesTool, newToolLog, readEvents, readTool, rejected, serverCode, taskTool, text, textOf, thinking, toolUse, type FakeDb, type FakeModel, type ToolLog } from './helpers';
import type { ChatTool, ReadTool } from '@/lib/coachhelm/v3/chat/engine/tool';
import type { ChatEvent } from '@/lib/coachhelm/v3/chat/engine/protocol';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  admin: null as unknown as { client: unknown },
  model: null as unknown,
  modelFactory: null as null | (() => unknown),
  features: null as unknown,
  notes: null as null | { tone: 'straight' | 'detailed' | 'team_talk'; facts: Array<{ id: string; text: string }> },
  clubhouse: true,
  flags: new Set<string>(),
  loadRoundReview: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ kind: 'notFound' })),
  loadTournamentsHome: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ kind: 'not_set_up' })),
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
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.admin.client), getServiceRoleKey: () => 'a-secret-only-the-server-holds' }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true })),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })), RATE_LIMITS: { API_GENERAL: {} } }));
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({ checkBudget: h.checkBudget, recordSpend: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: h.logServerError, logServerEvent: h.logServerEvent }));
vi.mock('@/lib/observability/metrics', () => ({ recordAi: vi.fn() }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: vi.fn(async () => true), isClubhouseForTeam: vi.fn(() => h.clubhouse) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (flag: string) => h.flags.has(flag) }));
vi.mock('@/clubhouse/data/round-review', () => ({ loadRoundReview: h.loadRoundReview }));
vi.mock('@/clubhouse/data/tournaments', () => ({ loadTournamentsHome: h.loadTournamentsHome, tourContext: vi.fn(async (team: unknown) => ({ team })) }));
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
// CONTEXT's notes: what is read is a stand-in, the sentences are short stand-ins too. Where they are placed is what this suite checks.
vi.mock('@/lib/coachhelm/v3/chat/context/notes', () => ({
  readStandingNotes: vi.fn(async () => h.notes),
  firstTurnNotes: (knows: typeof h.notes) => (knows && knows.facts.length > 0 ? `NOTES: ${knows.facts.map((f) => f.text).join(' | ')}` : null),
  toneSentence: (knows: typeof h.notes) => (knows ? `Tone: ${knows.tone}.` : null),
}));
// The screen-context resolver is CONTEXT's and has its own tests; here it is the line the engine must place and store.
vi.mock('@/lib/coachhelm/v3/chat/context/screen-context', () => ({
  turnContext: vi.fn(async (_sb: unknown, _who: unknown, raw: { screen?: string } | null) => ({
    line: raw?.screen ? `Today is Tuesday 10 November 2026. The coach is on ${raw.screen}.` : 'Today is Tuesday 10 November 2026.',
    screen: raw?.screen ? { screen: raw.screen.toLowerCase(), place: { name: raw.screen } } : null,
  })),
}));
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
  return { ...real, anthropicModelClient: () => (h.modelFactory ? h.modelFactory() : h.model), chatFeatures: (surface?: 'ask' | 'quick_chat' | 'practice_helper' | 'player') => h.features ?? real.chatFeatures(surface) };
});
// The real hold, with a 250 ms window instead of 8 s so a test can watch it release.
const HOLD_MS = 250;
const afterHold = () => new Promise((resolve) => setTimeout(resolve, HOLD_MS + 150));
vi.mock('@/lib/coachhelm/v3/chat/undo-hold', async (original) => {
  const real = await original<typeof import('@/lib/coachhelm/v3/chat/undo-hold')>();
  return { ...real, holdForExecution: (sb: never, args: { run_id: string }) => real.holdForExecution(sb, { ...args, now: Date.now() - real.UNDO_HOLD_MS + HOLD_MS }) };
});

import { POST } from '../route';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import { CHAT_FEATURES, MissingModelKeyError, plainFeatures } from '@/lib/coachhelm/v3/chat/engine/model';
import { cancelHeld } from '@/lib/coachhelm/v3/chat/undo-hold';
import { listConversations, resetSurfaceColumnCheck } from '@/lib/coachhelm/v3/chat/persistence';
import { getRound } from '@/lib/coachhelm/v3/chat/readers-direct';
import { turnMetaOf } from '@/lib/coachhelm/v3/chat/engine/protocol';

const MESSAGES = 'golf_coachhelm_chat_messages';
/** The app's own line for the turn, as the system message after the coach's words. */
const TODAY = 'Today is Tuesday 10 November 2026.';
const sys = { role: 'system', content: TODAY };
const RUNS = 'golf_coachhelm_action_runs';

let db: FakeDb;
let log: ToolLog;
let turn = 0;

function setup(opts: { modelColumns?: boolean; holdColumn?: boolean; surfaceColumn?: boolean } = {}) {
  resetSurfaceColumnCheck();
  db = fakeDb(opts);
  h.db = db;
  h.admin = fakeDb();
  log = newToolLog();
  h.role = 'coach';
  h.modelFactory = null;
  h.features = null;
  h.notes = null;
  h.clubhouse = true;
  h.flags = new Set();
  const coachTools: ChatTool[] = asTools(
    readTool('get_player_stats', log, 71.4),
    readTool('get_team_stats', log, 74.2),
    taskTool('create_focus_area', log),
    linesTool('get_rounds', log, ['Scoring avg: 74.2 | team 75.1', 'Putts per round: 31.4']),
    // The real reader, so the route's binding of the Round page is what answers it.
    getRound as unknown as ChatTool,
    readTool('find_in_app', log, 0),
  );
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
const receiptStates = (events: ChatEvent[]): string[] => events.flatMap((e) => (e.type === 'receipt' ? [(e.part.data as { status: string }).status] : []));
/** Resolves once the ledger row is inside its Undo window: the moment a coach could press Undo or lose their connection. */
const untilHeld = async (): Promise<void> => {
  for (let i = 0; i < 100 && runs()[0]?.status !== 'held'; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(runs()[0]?.status).toBe('held');
};

beforeEach(() => {
  setup();
  h.logServerError.mockClear();
  h.logServerEvent.mockClear();
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
    // The stored turn: the coach's words, the app's line for the turn as a system message, and the model's content exactly as returned.
    expect(row!.model_messages).toEqual([
      { role: 'user', content: 'How is Avery scoring?' },
      sys,
      { role: 'assistant', content: [thinking('sig-1'), text('Avery is averaging 71.4 over the last ten rounds.')] },
    ]);

    const request = model.requests[0]!;
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.max_tokens).toBe(16000);
    expect(request.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    // This model's default effort is medium: high is sent on every request.
    expect(request.output_config).toEqual({ effort: 'high' });
    expect(request.tool_choice).toEqual({ type: 'auto' });
    // There is no server-side fallback on this model, and nothing it rejects is sent.
    for (const never of ['fallbacks', 'temperature', 'top_p', 'top_k']) expect(request).not.toHaveProperty(never);
    expect(request.betas).toEqual(['thinking-binding-controls-2026-08-01', 'compact-2026-01-12']);
    expect(request.context_management).toEqual({ edits: [{ type: 'compact_20260112' }] });
    // Nothing that changes with the day is in the prompt: the date is the system message after the coach's words.
    expect(JSON.stringify(request.system)).not.toContain('November');
    expect(request.messages).toEqual([{ role: 'user', content: 'How is Avery scoring?' }, sys]);
    // Cache order: tools, then the policy block (one hour), then the team's block; the tail is cached by the request-level marker.
    expect(request.system).toEqual([
      { type: 'text', text: 'POLICY', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'TEAM BLOCK', cache_control: { type: 'ephemeral' } },
    ]);
    expect(request.cache_control).toEqual({ type: 'ephemeral' });
    // A coach's reads may be called from the model's code, so they cannot be strict (the engine validates every input itself);
    // a task is direct-only and strict; the code tool is last.
    expect((request.tools as Array<{ name: string; eager_input_streaming?: boolean; strict?: boolean; allowed_callers?: string[] }>).map((t) => [t.name, t.eager_input_streaming ?? null, t.strict ?? null, t.allowed_callers?.length ?? 0])).toEqual([
      ['get_player_stats', true, null, 2],
      ['get_team_stats', true, null, 2],
      ['create_focus_area', true, true, 0],
      ['get_rounds', true, null, 2],
      ['get_round', true, null, 2],
      ['find_in_app', true, null, 2],
      ['code_execution', null, null, 0],
    ]);
    expect((request.tools as Array<{ name: string; input_schema?: { additionalProperties?: boolean } }>).find((t) => t.name === 'create_focus_area')!.input_schema!.additionalProperties).toBe(false);
  });

  it('the next question replays the stored messages, thinking included, and appends', async () => {
    script({ content: [thinking('sig-1'), text('71.4.')] });
    const first = await ask('How is Avery scoring?');
    const model = script({ content: [text('Blake is at 74.')] });
    await ask('And Blake?', conversationOf(first.events));

    expect(lastRequestMessages(model)).toEqual([
      { role: 'user', content: 'How is Avery scoring?' },
      sys,
      { role: 'assistant', content: [thinking('sig-1'), text('71.4.')] },
      { role: 'user', content: 'And Blake?' },
      sys,
    ]);
    expect(assistantRows()).toHaveLength(2);
    // The stored thinking block goes back unchanged, with the instruction to drop it rather than fail if the prompt has changed since.
    expect(model.requests[0]!.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
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
    expect(sent.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    type Result = { type: string; tool_use_id: string; content: Array<{ type: string; source: string; title: string; content: Array<{ type: string; text: string }>; citations: { enabled: boolean } }> };
    const results = sent[3]!.content as Result[];
    expect(results.map((r) => [r.type, r.tool_use_id])).toEqual([['tool_result', 'tu_1'], ['tool_result', 'tu_2']]);
    // Each read goes back as a search result the model can cite, named by the read's own ref.
    expect(results[0]!.content).toHaveLength(1);
    expect(results[0]!.content[0]).toMatchObject({ type: 'search_result', source: 'read:e1', title: 'get_player_stats is 71.4', citations: { enabled: true } });
    expect(results[1]!.content[0]).toMatchObject({ type: 'search_result', source: 'read:e2' });

    const [row] = assistantRows();
    expect(row!.status).toBe('complete');
    expect((row!.model_messages as unknown[]).length).toBe(5);
    expect((row!.ui_parts as Array<{ type: string }>).map((p) => p.type)).toEqual(['data-progress', 'data-progress', 'data-evidence', 'data-evidence', 'text', 'data-turn-meta']);
  });

  it('an input the schema rejects is never run: the model is told, as an error result', async () => {
    const model = script({ content: [toolUse('tu_1', 'get_player_stats', { player_id: 42 })] }, { content: [text('I could not read that.')] });
    await ask('Avery?');
    expect(log.reads).toHaveLength(0);
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result!.is_error).toBe(true);
    expect(result!.content).toContain('player_id');
  });

  it('a tool can hand back a part for the thread, mark itself as not a read, and end the turn', async () => {
    const brief: ChatTool = {
      kind: 'read',
      name: 'ask_practice_brief',
      description: 'Asks the coach the questions a plan needs.',
      input: z.object({}),
      progress: () => 'Preparing the questions',
      run: async () => ({ summary: 'Asked the coach three questions.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-10T12:00:00.000Z', evidence: false, end_turn: true, parts: [{ type: 'data-brief', id: 'brief-1', data: { questions: ['How long?'] } }] }),
    };
    h.toolsFor.mockImplementation(() => [brief]);
    const model = script({ content: [text('A few questions first.'), toolUse('tu_b', 'ask_practice_brief', {})] });
    const { events } = await ask('Build Thursday’s practice');

    // One model call: the coach's answers are the next message.
    expect(model.requests).toHaveLength(1);
    expect(done(events)?.status).toBe('complete');
    expect(events.some((e) => e.type === 'evidence')).toBe(false);
    expect(events.find((e) => e.type === 'part')).toEqual({ type: 'part', part: { type: 'data-brief', id: 'brief-1', data: { questions: ['How long?'] } } });
    const [row] = assistantRows();
    expect((row!.ui_parts as Array<{ type: string }>).map((p) => p.type)).toEqual(['text', 'data-progress', 'data-brief', 'data-turn-meta']);
    // The stored turn ends with the tool's result, so the call is answered and the next question simply follows it.
    const stored = row!.model_messages as Array<{ role: string; content: unknown }>;
    expect(stored.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    const [result] = stored[3]!.content as Array<{ type: string; content: string }>;
    expect(result!.type).toBe('tool_result');
    expect(JSON.parse(result!.content)).not.toHaveProperty('evidence_ref');
    expect(JSON.parse(result!.content)).not.toHaveProperty('parts');

    const next = script({ content: [text('Here is the plan.')] });
    await ask('Ninety minutes', conversationOf(events));
    expect(lastRequestMessages(next).map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'user', 'system']);
  });

  it('after the last allowed step the model gets one call with no tools to answer from what it has', async () => {
    const reads = Array.from({ length: 12 }, (_, i) => ({ content: [toolUse(`tu_${i}`, 'get_team_stats', {})] }));
    const model = script(...reads, { content: [text('Here is what I found.')] });
    const { events } = await ask('Everything?');
    expect(model.requests).toHaveLength(13);
    expect(model.requests[11]!.tool_choice).toEqual({ type: 'auto' });
    expect(model.requests[12]!.tool_choice).toEqual({ type: 'none' });
    expect(done(events)?.status).toBe('complete');
  });
});

describe('what a read tells the model, and how an answer points back at it', () => {
  type SearchResult = { type: string; source: string; title: string; content: Array<{ type: string; text: string }>; citations: { enabled: boolean } };
  const resultOf = (model: FakeModel) => (lastRequestMessages(model)[3]!.content as Array<{ type: string; tool_use_id: string; content: unknown }>)[0]!;

  it('a read with finished lines goes back as those lines, one citable block each, not as the envelope’s JSON', async () => {
    const model = script({ content: [toolUse('tu_1', 'get_rounds', {})] }, { content: [text('74.2.')] });
    const { events } = await ask('How is the team scoring?');
    expect(resultOf(model).content).toEqual([
      {
        type: 'search_result',
        source: 'read:e1',
        title: 'get_rounds: 2 figures',
        content: [{ type: 'text', text: 'Scoring avg: 74.2 | team 75.1' }, { type: 'text', text: 'Putts per round: 31.4' }],
        citations: { enabled: true },
      } satisfies SearchResult,
    ]);
    // The whole envelope still reaches the thread and the store, lines included: the grounding check reads what the model was shown.
    const evidence = events.find((e) => e.type === 'evidence') as { part: { data: { ref: string; envelope: { summary: string; model_text: string } } } };
    expect(evidence.part.data).toMatchObject({ ref: 'e1', envelope: { summary: 'get_rounds: 2 figures', model_text: 'Scoring avg: 74.2 | team 75.1\nPutts per round: 31.4' } });
  });

  it('a sentence the API says drew on a read gets that read’s marker in the thread; a sentence is not broken where the API splits it', async () => {
    const model = script(
      { content: [toolUse('tu_1', 'get_rounds', {})] },
      // With citations on, the API splits one sentence into text blocks where the cited words begin and end.
      { content: [thinking('sig-2'), text('The team is scoring '), cited('74.2 a round', 'e1'), text('. Putting is the gap: '), cited('31.4 putts', 'e9'), text('.')] },
    );
    const { events } = await ask('How is the team scoring?');
    // e9 names no read of this conversation: no marker is invented for it.
    expect(textOf(events)).toBe('The team is scoring 74.2 a round [e1]. Putting is the gap: 31.4 putts.');
    const [row] = assistantRows();
    // The marker is the thread's, not prose: the stored words do not carry it, and the model's own content is kept exactly as returned.
    expect(row!.content).toBe('The team is scoring 74.2 a round. Putting is the gap: 31.4 putts.');
    const stored = row!.model_messages as Array<{ role: string; content: unknown }>;
    expect(stored.at(-1)!.content).toEqual([thinking('sig-2'), text('The team is scoring '), cited('74.2 a round', 'e1'), text('. Putting is the gap: '), cited('31.4 putts', 'e9'), text('.')]);
    expect(JSON.stringify(stored)).not.toContain('[e1]');

    // On the next question the cited blocks go back unchanged.
    const next = script({ content: [text('Blake is at 74.')] });
    await ask('And Blake?', conversationOf(events));
    expect(lastRequestMessages(next)[4]!.content).toEqual(stored.at(-1)!.content);
    expect(model.requests).toHaveLength(2);
  });

  it('words either side of a tool call are separate paragraphs', async () => {
    script({ content: [text('Let me look.'), toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('First.'), thinking('sig-3'), text('Second.')] });
    const { events } = await ask('Team?');
    expect(textOf(events)).toBe('Let me look.First.\n\nSecond.');
  });

  it('with citations off a read goes back as text that names its ref', async () => {
    h.features = { ...CHAT_FEATURES, citations: false };
    const lines = script({ content: [toolUse('tu_1', 'get_rounds', {})] }, { content: [text('74.2.')] });
    await ask('How is the team scoring?');
    expect(resultOf(lines).content).toBe('[e1] Scoring avg: 74.2 | team 75.1\nPutts per round: 31.4');

    const plain = script({ content: [toolUse('tu_2', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    await ask('And the team?');
    expect(JSON.parse(resultOf(plain).content as string)).toMatchObject({ summary: 'get_team_stats is 74.2', evidence_ref: 'e1' });
  });
});

describe('the optional request features', () => {
  it('a request the API rejects is sent once more as a plain request, the turn completes, and the rejection is logged to be fixed', async () => {
    const model = script({ content: [], reject: rejected() }, { content: [toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    const { events } = await ask('How is the team scoring?');

    expect(done(events)?.status).toBe('complete');
    expect(textOf(events)).toBe('74.2.');
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(model.requests).toHaveLength(3);
    expect(model.requests[0]!.betas).toEqual(['thinking-binding-controls-2026-08-01', 'compact-2026-01-12']);
    // The retry, and every later call of the turn, carries no beta and nothing a beta or `strict` added.
    for (const request of model.requests.slice(1)) {
      expect(request).not.toHaveProperty('betas');
      expect(request).not.toHaveProperty('context_management');
      expect(request.thinking).toEqual({ type: 'adaptive' });
      expect((request.tools as Array<{ strict?: boolean }>).some((t) => t.strict !== undefined)).toBe(false);
      // The plain request has no code tool either, and no read says it may be called from code.
      expect(JSON.stringify(request.tools)).not.toMatch(/code_execution|allowed_callers/);
      // What is not optional is unchanged.
      expect(request.model).toBe('claude-haiku-5-5');
      expect(request.output_config).toEqual({ effort: 'high' });
      expect(request.messages.slice(0, 2)).toEqual([{ role: 'user', content: 'How is the team scoring?' }, sys]);
    }
    const logged = h.logServerError.mock.calls.map((c) => c as unknown[]).find((c) => (c[1] as { action?: string })?.action === 'v3.chat.stream.degraded');
    expect(logged).toBeTruthy();
    expect(logged![2]).toBe('error');
    const turnLog = h.logServerEvent.mock.calls.map((c) => c as unknown[]).find((c) => c[0] === 'chat/stream: turn');
    expect((turnLog![1] as { extra: { degraded: boolean } }).extra.degraded).toBe(true);
  });

  it('a plain request that is rejected is not retried: the coach gets a sentence and the turn is stored failed', async () => {
    h.features = plainFeatures(CHAT_FEATURES);
    const model = script({ content: [], reject: rejected('messages: invalid') });
    const { events } = await ask('How is the team scoring?');
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]).not.toHaveProperty('betas');
    expect(done(events)?.status).toBe('failed');
    expect((events.find((e) => e.type === 'error') as { message: string }).message).not.toContain('invalid');
  });

  it('with every optional feature off the request is the plain one and the turn works the same', async () => {
    h.features = { ...plainFeatures(CHAT_FEATURES), citations: false, programmaticReads: false };
    const model = script({ content: [toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    const { events } = await ask('How is the team scoring?');
    expect(done(events)?.status).toBe('complete');
    const [request] = model.requests;
    expect(Object.keys(request!).sort()).toEqual(['cache_control', 'max_tokens', 'messages', 'model', 'output_config', 'system', 'thinking', 'tool_choice', 'tools']);
    expect(request!.thinking).toEqual({ type: 'adaptive' });
    expect((request!.tools as Array<{ type?: string }>).some((t) => t.type === 'code_execution_20260120')).toBe(false);
  });

  it('a stored thinking block is replayed unchanged when nothing before it changed, and dropped by the API (not failed) when the prompt did: both answer', async () => {
    script({ content: [thinking('sig-1'), text('71.4.')] });
    const first = await ask('How is Avery scoring?');
    const id = conversationOf(first.events);

    // Unchanged prompt: the block goes back exactly as stored.
    const same = script({ content: [thinking('sig-2'), text('Blake is at 74.')] });
    const second = await ask('And Blake?', id);
    expect(done(second.events)?.status).toBe('complete');
    expect((lastRequestMessages(same)[2]!.content as unknown[])[0]).toEqual(thinking('sig-1'));
    expect(same.requests[0]!.thinking).toMatchObject({ block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    const calls = () => (h.logServerEvent.mock.calls.map((c) => c as unknown[]).filter((c) => c[0] === 'chat/stream: turn').at(-1)![1] as { extra: { calls: Array<{ dropped_thinking: number }> } }).extra.calls;
    expect(calls().map((c) => c.dropped_thinking)).toEqual([0]);

    // The prompt changed between turns (a deploy, a roster edit). The stored blocks are still sent as stored: it is the API that drops
    // them, because the request asks it to, and says how many. The turn answers, and the count is in the turn's log line.
    const { instructionBlocks } = await import('@/lib/coachhelm/v3/chat/instructions');
    vi.mocked(instructionBlocks).mockReturnValueOnce({ policy: 'POLICY, REWRITTEN', team: 'TEAM BLOCK' } as never);
    const changed = script({ content: [text('Both are under 75.')], droppedThinking: 2 });
    const third = await ask('Compare them', id);
    expect(done(third.events)?.status).toBe('complete');
    expect((changed.requests[0]!.system as Array<{ text: string }>)[0]!.text).toBe('POLICY, REWRITTEN');
    expect((lastRequestMessages(changed)[2]!.content as unknown[])[0]).toEqual(thinking('sig-1'));
    expect((lastRequestMessages(changed)[5]!.content as unknown[])[0]).toEqual(thinking('sig-2'));
    expect(changed.requests[0]!.thinking).toMatchObject({ block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(calls().map((c) => c.dropped_thinking)).toEqual([2]);
  });
});

describe('the screen the chat was opened from', () => {
  it('is told to the model as a system message after the coach’s words, with the date, and is stored with the turn', async () => {
    const model = script({ content: [text('You are on Roster.')] });
    const { events } = await ask('What am I looking at?', null, { screen: { screen: 'Roster' } });
    const line = 'Today is Tuesday 10 November 2026. The coach is on Roster.';
    expect(lastRequestMessages(model)).toEqual([{ role: 'user', content: 'What am I looking at?' }, { role: 'system', content: line }]);
    // Never in the prompt (it would break the cache and every stored thinking block), never in the coach's own block.
    expect(JSON.stringify(model.requests[0]!.system)).not.toContain('Roster');
    expect((assistantRows()[0]!.model_messages as unknown[])[1]).toEqual({ role: 'system', content: line });

    // The next turn keeps the earlier line where it was and adds its own after the new question.
    const next = script({ content: [text('Now Stats.')] });
    await ask('And now?', conversationOf(events), { screen: { screen: 'Stats' } });
    expect(lastRequestMessages(next).map((m) => (m.role === 'system' ? m.content : m.role))).toEqual(['user', line, 'assistant', 'user', 'Today is Tuesday 10 November 2026. The coach is on Stats.']);
  });
});

describe('the coach’s standing notes and the conversation’s tone', () => {
  it('the notes go once, with the first turn; the tone goes with every turn; both after the coach’s words and both stored', async () => {
    h.notes = { tone: 'detailed', facts: [{ id: 'n1', text: 'Qualifying is 54 holes, low four count.' }] };
    const first = script({ content: [text('Noted.')] });
    const { events } = await ask('How does qualifying work?');
    const firstNote = `NOTES: Qualifying is 54 holes, low four count.\n\n${TODAY} Tone: detailed.`;
    expect(lastRequestMessages(first)).toEqual([{ role: 'user', content: 'How does qualifying work?' }, { role: 'system', content: firstNote }]);
    expect(JSON.stringify(first.requests[0]!.system)).not.toContain('54 holes');

    // The tone switch moved between turns: the next turn's line says so. The notes are not sent again; the first turn's stay where they were.
    h.notes = { tone: 'straight', facts: [{ id: 'n1', text: 'Qualifying is 54 holes, low four count.' }] };
    const second = script({ content: [text('74.')] });
    await ask('And Blake?', conversationOf(events));
    expect(lastRequestMessages(second).map((m) => (m.role === 'system' ? m.content : m.role))).toEqual(['user', firstNote, 'assistant', 'user', `${TODAY} Tone: straight.`]);
  });

  it('a first turn that failed is retried with the notes: they belong to the first turn that is kept', async () => {
    h.notes = { tone: 'straight', facts: [{ id: 'n1', text: 'Lead with the number.' }] };
    script({ content: [text('Par')], fail: new Error('socket closed') });
    const failed = await post({ message: 'How is Avery scoring?', conversation_id: null, client_turn_id: 'first-try' });
    expect(done(failed.events)?.status).toBe('failed');
    const model = script({ content: [text('71.4.')] });
    await post({ message: 'How is Avery scoring?', conversation_id: conversationOf(failed.events), client_turn_id: 'first-try' });
    expect(lastRequestMessages(model)).toEqual([{ role: 'user', content: 'How is Avery scoring?' }, { role: 'system', content: `NOTES: Lead with the number.\n\n${TODAY} Tone: straight.` }]);
  });
});

describe('the model’s code calling the reads (on for a coach, off for a player)', () => {
  it('is on for every coach surface by default and off for a player', async () => {
    expect(CHAT_FEATURES.programmaticReads).toBe(true);
    for (const surface of ['ask', 'quick_chat', 'practice_helper']) {
      const model = script({ content: [text('74.2.')] });
      await ask('Team?', null, { surface });
      expect((model.requests[0]!.tools as Array<{ name: string }>).at(-1)!.name).toBe('code_execution');
    }
    h.role = 'player';
    const player = script({ content: [text('73.1.')] });
    await ask('How am I scoring?');
    const tools = player.requests[0]!.tools as Array<{ name: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.map((t) => t.name)).toEqual(['get_my_stats', 'create_focus_area']);
    expect(tools.every((t) => t.strict === true && t.allowed_callers === undefined)).toBe(true);
  });

  it('with it off the request has no code tool, every tool is strict, and the turn works the same', async () => {
    h.features = { ...CHAT_FEATURES, programmaticReads: false };
    const model = script({ content: [toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    const { events } = await ask('How is the team scoring?');
    expect(done(events)?.status).toBe('complete');
    const tools = model.requests[0]!.tools as Array<{ name: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.some((t) => t.name === 'code_execution')).toBe(false);
    expect(tools.every((t) => t.strict === true && t.allowed_callers === undefined)).toBe(true);
  });

  it('a read the code calls is validated, runs as the signed-in coach, and is still a row, a piece of evidence and a stored read', async () => {
    script(
      { content: [serverCode(), codeToolUse('tu_bad', 'get_player_stats', { player_id: 42 }), codeToolUse('tu_ok', 'get_team_stats', {})], container: 'container_1' },
      { content: [{ type: 'code_execution_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'code_execution_result', stdout: '74.2', stderr: '', return_code: 0, content: [] } } as never, text('The team averages 74.2.')] },
    );
    const { events } = await ask('How is the team scoring?');
    expect(done(events)?.status).toBe('complete');
    // The input the code sent is checked by the same schema as a direct call: the bad one never ran.
    expect(log.reads.map((r) => r.tool)).toEqual(['get_team_stats']);
    expect(log.reads[0]!.who).toMatchObject({ coach_id: 'coach-1', team_id: 'team-1' });
    // The thread: one row for the code, from its start until its result is back, and a row for each read under it.
    const rows = events.flatMap((e) => (e.type === 'read_started' || e.type === 'read_finished' ? [`${e.type}:${e.tool}`] : []));
    expect(rows).toEqual(['read_started:code_execution', 'read_started:get_team_stats', 'read_finished:get_team_stats', 'read_finished:code_execution']);
    // The evidence says the code asked for it: that is how the thread knows which reads a computed figure came from.
    const evidence = events.filter((e) => e.type === 'evidence') as Array<{ part: { data: { tool: string; ref: string; via?: string } } }>;
    // (Refs are reserved in call order before anything runs, so the call that was refused took e1.)
    expect(evidence.map((e) => e.part.data)).toMatchObject([{ tool: 'get_team_stats', ref: 'e2', via: 'code' }]);
    // Stored with the turn, and counted as the turn's read; the code row is not a read.
    const [row] = assistantRows();
    expect(turnMetaOf(row!.ui_parts as never)).toMatchObject({ reads: 1 });
    expect((row!.ui_parts as Array<{ type: string; data?: { via?: string } }>).find((p) => p.type === 'data-evidence')?.data?.via).toBe('code');
    // The model's own blocks (its code, the code's result) are kept exactly as returned and go back on the next turn.
    const stored = row!.model_messages as Array<{ role: string; content: Array<{ type: string }> }>;
    expect(stored[2]!.content.map((b) => b.type)).toEqual(['server_tool_use', 'tool_use', 'tool_use']);
    expect(stored[4]!.content.map((b) => b.type)).toEqual(['code_execution_tool_result', 'text']);
  });

  it('a card is not prepared while the code is waiting on a read: the model is told to ask for it on its own afterwards', async () => {
    const model = script(
      { content: [toolUse('tu_task', 'create_focus_area', { title: 'Wedges' }), serverCode(), codeToolUse('tu_1', 'get_team_stats', {})], container: 'container_1' },
      { content: [text('I will prepare that next.')] },
    );
    const { events } = await ask('Compare everyone, then make a wedge focus area');
    expect(events.some((e) => e.type === 'proposal' || e.type === 'decision_needed')).toBe(false);
    expect(log.plans).toHaveLength(0);
    expect(runs()).toHaveLength(0);
    const reply = model.requests[1]!.messages.at(-1) as { content: Array<{ tool_use_id: string; is_error?: boolean; content: string }> };
    expect(reply.content.find((b) => b.tool_use_id === 'tu_task')).toMatchObject({ is_error: true });
    expect(reply.content.find((b) => b.tool_use_id === 'tu_task')!.content).toContain('on its own after the code has finished');
    expect(done(events)?.status).toBe('complete');
  });

  it('a request the API rejects with the code tool on is sent again without it, and the turn completes', async () => {
    h.features = { ...plainFeatures(CHAT_FEATURES), citations: true, programmaticReads: true };
    const model = script({ content: [], reject: rejected('tools.6: code_execution_20260120 is not available') }, { content: [text('74.2.')] });
    const { events } = await ask('How is the team scoring?');
    expect(done(events)?.status).toBe('complete');
    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(model.requests[0]!.tools)).toContain('code_execution');
    expect(JSON.stringify(model.requests[1]!.tools)).not.toMatch(/code_execution|allowed_callers/);
  });

  it('offers the code tool, lets the model’s code call reads only, and answers a pending call with tool_result blocks alone', async () => {
    const model = script(
      { content: [serverCode(), codeToolUse('tu_1', 'get_team_stats', {}), codeToolUse('tu_2', 'get_rounds', {})], container: 'container_1' },
      { content: [text('74.2, on 31.4 putts.')] },
    );
    const { events } = await ask('How is the team scoring?');
    expect(done(events)?.status).toBe('complete');

    const [first, second] = model.requests;
    const tools = first!.tools as Array<{ name: string; type?: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.at(-1)).toEqual({ type: 'code_execution_20260120', name: 'code_execution' });
    // Reads may be called from code, and so cannot be strict; a task is only ever asked for directly, and stays strict.
    expect(tools.find((t) => t.name === 'get_team_stats')).toMatchObject({ allowed_callers: ['direct', 'code_execution_20260120'] });
    expect(tools.find((t) => t.name === 'get_team_stats')).not.toHaveProperty('strict');
    expect(tools.find((t) => t.name === 'create_focus_area')).toMatchObject({ strict: true });
    expect(tools.find((t) => t.name === 'create_focus_area')).not.toHaveProperty('allowed_callers');
    expect(first).not.toHaveProperty('container');

    // The reply to a pending programmatic call: only tool_result blocks, each a plain string, with the container it runs in.
    expect(second!.container).toBe('container_1');
    const reply = second!.messages.at(-1) as { role: string; content: Array<{ type: string; tool_use_id: string; content: unknown }> };
    expect(reply.role).toBe('user');
    expect(reply.content.map((b) => [b.type, b.tool_use_id, typeof b.content])).toEqual([['tool_result', 'tu_1', 'string'], ['tool_result', 'tu_2', 'string']]);
    expect(reply.content[1]!.content).toBe('[e2] Scoring avg: 74.2 | team 75.1\nPutts per round: 31.4');
    expect(JSON.parse(reply.content[0]!.content as string)).toMatchObject({ evidence_ref: 'e1' });
    // The same tools go back with it.
    expect(second!.tools).toEqual(first!.tools);
    // The reads still reach the thread as evidence.
    expect(events.filter((e) => e.type === 'evidence')).toHaveLength(2);
  });

  it('a change asked for from code is refused: nothing is planned, no card, no ledger row', async () => {
    const model = script({ content: [serverCode(), codeToolUse('tu_1', 'create_focus_area', { title: 'From code' })], container: 'container_1' }, { content: [text('I will ask for that directly.')] });
    const { events } = await ask('Make a focus area');
    expect(log.plans).toHaveLength(0);
    expect(runs()).toHaveLength(0);
    expect(events.some((e) => e.type === 'proposal' || e.type === 'decision_needed')).toBe(false);
    const reply = model.requests[1]!.messages.at(-1) as { content: Array<{ is_error?: boolean; content: string }> };
    expect(reply.content[0]).toMatchObject({ is_error: true });
    expect(reply.content[0]!.content).toContain('Nothing was written');
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
    expect((row!.model_messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
  });

  it('confirmed: shown as held at once, written when the Undo window closes in the same request, and only then does the model close', async () => {
    const { conversationId, key } = await propose();
    let atClose: { commits: number; status: unknown } | null = null;
    const model = script(() => {
      // By the time the model is asked for its closing words, the write has happened and the ledger says so.
      atClose = { commits: log.commits.length, status: runs()[0]!.status };
      return { content: [text('Done: the putting focus area is created.')] };
    });
    const { events } = await decide(conversationId, key, true);

    expect(events[0]).toMatchObject({ type: 'message_start', resumed: true });
    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: true });
    // The card is "held, Undo until ..." before anything else, then the receipt of what was written, then the words.
    const receipt = (events.find((e) => e.type === 'receipt') as { part: { id: string; data: { status: string; held_until: string } } }).part;
    expect(receipt.id).toBe(`receipt-${key}`);
    expect(receipt.data.held_until).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(receiptStates(events)).toEqual(['held', 'completed']);
    const order = events.map((e) => e.type);
    expect(order.lastIndexOf('receipt')).toBeLessThan(order.indexOf('text_delta'));
    expect(atClose).toEqual({ commits: 1, status: 'completed' });
    expect(done(events)?.status).toBe('complete');

    // The decision continues the SAME assistant turn: its tool_use gets a tool_result that says what happened, and no new question is asked.
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    expect(sent[3]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_task', content: 'Committed. Created the focus area.' }]);

    // One assistant row for the whole exchange, stored complete, nothing waiting.
    expect(assistantRows()).toHaveLength(1);
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'complete', pending_decision: null });
    expect(row!.content).toContain('Here is the focus area.');
    expect(row!.content).toContain('focus area is created');
    expect((row!.model_messages as Array<{ role: string }>).map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect((row!.ui_parts as Array<{ type: string }>).some((p) => p.type === 'data-turn-incomplete')).toBe(false);
    expect((row!.ui_parts as Array<{ type: string; data?: { status?: string } }>).filter((p) => p.type === 'data-action-receipt').map((p) => p.data?.status)).toEqual(['completed']);

    // The plan the coach saw is committed exactly once, and nothing runs again afterwards.
    expect(log.commits).toHaveLength(1);
    expect(log.commits[0]).toMatchObject({ summary: 'Create the focus area "Putting from 6 feet".', idempotency_key: key });
    expect(log.plans).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ status: 'completed', result: { status: 'completed', summary: 'Created the focus area.' } });
    await afterHold();
    expect(log.commits).toHaveLength(1);
  });

  it('Undo inside the window: nothing is written, the model is told it was undone, and the turn ends on the same row', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('Undone: nothing was created.')] });
    const pending = decide(conversationId, key, true);
    await untilHeld();
    // While it is held the stored turn already shows the held card: a reload during the window draws the same thing.
    const during = assistantRows()[0]!;
    expect(during.pending_decision).not.toBeNull();
    expect((during.ui_parts as Array<{ type: string; data?: { status?: string } }>).find((p) => p.type === 'data-action-receipt')?.data?.status).toBe('held');
    expect(model.requests).toHaveLength(0);
    // The card's Undo, as the action route runs it.
    expect(await cancelHeld(db.client as never, { coach_id: 'coach-1', idempotency_key: key })).toBe('cancelled');

    const { events } = await pending;
    // The card's last word on the stream, and in the stored turn, is that it was undone: a reload does not show it as still held.
    expect(receiptStates(events)).toEqual(['held', 'cancelled']);
    const undone = (assistantRows()[0]!.ui_parts as Array<{ type: string; data?: { status?: string; summary?: string; created?: unknown[] } }>).filter((p) => p.type === 'data-action-receipt');
    expect(undone).toHaveLength(1);
    expect(undone[0]!.data).toMatchObject({ status: 'cancelled', summary: 'Undone. Nothing was written.', created: [] });
    expect(done(events)?.status).toBe('complete');
    expect(log.commits).toHaveLength(0);
    expect(runs()[0]!.status).toBe('cancelled');
    expect(lastRequestMessages(model)[3]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_task', content: 'The coach pressed Undo before it was written. Nothing was written.' }]);
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', pending_decision: null });
    await afterHold();
    expect(log.commits).toHaveLength(0);
  });

  it('the connection dropping inside the window does not lose the write: it lands exactly once and a reload shows the receipt', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('never asked for')] });
    const abort = new AbortController();
    const pending = post({ conversation_id: conversationId, decision: { key, approved: true } }, abort.signal);
    await untilHeld();
    abort.abort();
    await pending;
    await afterHold();

    expect(log.commits).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ status: 'completed', result: { status: 'completed' } });
    // Nobody is there to read closing words, so none are paid for.
    expect(model.requests).toHaveLength(0);
    // The turn is stored complete with what happened, for the reload and for the model's next turn.
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'complete', pending_decision: null });
    const stored = row!.model_messages as Array<{ role: string; content: unknown }>;
    expect(stored.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    expect(stored[3]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_task', content: 'Committed. Created the focus area.' }]);
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    const card = restored.at(-1)!.parts.find((p) => p.type === 'data-action-receipt') as unknown as { data: { status: string; summary: string } };
    expect(card.data).toMatchObject({ status: 'completed', summary: 'Created the focus area.' });
    expect(restored.at(-1)!.parts.some((p) => p.type === 'data-turn-incomplete')).toBe(false);

    // The next question is told what happened, not asked to guess.
    const next = script({ content: [text('Yes, it was created.')] });
    await ask('Did that go through?', conversationId);
    expect(lastRequestMessages(next).map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'user', 'system']);
    expect(log.commits).toHaveLength(1);
  });

  it('a second Confirm while the first is still inside the window starts nothing: one write, one closing call, one row', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('Done.')] });
    const first = decide(conversationId, key, true);
    await untilHeld();
    const second = await decide(conversationId, key, true);
    expect(second.events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: true });
    expect(receiptStates(second.events)).toEqual(['held']);
    expect(done(second.events)?.status).toBe('complete');
    expect(model.requests).toHaveLength(0);

    const { events } = await first;
    expect(receiptStates(events)).toEqual(['held', 'completed']);
    expect(model.requests).toHaveLength(1);
    expect(log.commits).toHaveLength(1);
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', pending_decision: null });
  });

  it('a second Confirm of the same card runs nothing twice and is answered from the stored turn', async () => {
    const { conversationId, key } = await propose();
    script({ content: [text('Done.')] });
    await decide(conversationId, key, true);
    const model = script();
    const { events } = await decide(conversationId, key, true);
    expect(model.requests).toHaveLength(0);
    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: true });
    expect(receiptStates(events)).toEqual(['completed']);
    expect(done(events)?.status).toBe('complete');
    await afterHold();
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
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ content: string }>;
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
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ content: string }>;
    expect(result!.content).toBe('Declined by the coach. Nothing was written.');
    await afterHold();
    expect(log.commits).toHaveLength(0);
    expect(runs()[0]!.status).toBe('denied');
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', pending_decision: null });
  });

  it('a new message while the card waits counts as Cancel: the card’s result, then the coach’s words as their own block, never inside the result', async () => {
    const { conversationId, key } = await propose();
    const model = script({ content: [text('Blake is at 74.')] });
    const { events } = await ask('Actually, how is Blake scoring?', conversationId);

    expect(done(events)?.status).toBe('complete');
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'system']);
    expect(sent[3]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_task', content: 'The coach asked something else instead of confirming. Nothing was written.' },
      { type: 'text', text: 'Actually, how is Blake scoring?' },
    ]);
    expect(JSON.stringify((sent[3]!.content as unknown[])[0])).not.toContain('Blake');
    expect(sent[4]).toEqual(sys);
    // The browser is told the card was withdrawn, and in which message it sits: a fact, not something to infer from position.
    const cardRow = assistantRows()[0]!;
    expect(events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: false, reason: 'superseded', message_id: cardRow.id });
    expect((cardRow.ui_parts as Array<{ type: string; approval?: unknown }>).find((p) => p.type === 'tool-create_focus_area')?.approval).toEqual({ id: key, approved: false, reason: 'superseded' });
    const reloaded = restoreUIMessages((db.tables[MESSAGES] ?? []) as never).find((m) => m.id === cardRow.id)!;
    expect(reloaded.parts.find((p) => p.type === 'tool-create_focus_area')).toMatchObject({ state: 'output-denied', approval: { reason: 'superseded' } });
    expect(runs()[0]!.status).toBe('denied');
    expect(log.commits).toHaveLength(0);

    // The old card no longer waits, in the row or after a reload, and it can no longer be confirmed.
    const [first, second] = assistantRows();
    expect(first!.pending_decision).toBeNull();
    expect((first!.ui_parts as Array<{ type: string; state?: string }>).find((p) => p.type === 'tool-create_focus_area')?.state).toBe('output-denied');
    expect(second).toMatchObject({ status: 'complete', content: 'Blake is at 74.' });
    const late = await decide(conversationId, key, true);
    expect(late.events.find((e) => e.type === 'decision')).toEqual({ type: 'decision', key, approved: false, reason: 'superseded' });
    expect(log.commits).toHaveLength(0);
  });

  it('a reload mid-decision restores a card that can still be confirmed', async () => {
    const { conversationId, key } = await propose();
    // What the page loads after a reload: the stored rows, restored for the thread.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    const card = restored.at(-1)!.parts.find((p) => p.type === 'tool-create_focus_area') as unknown as { state: string; approval: { id: string } };
    expect(card).toMatchObject({ state: 'approval-requested', approval: { id: key } });
    expect(restored.at(-1)!.parts.some((p) => p.type === 'data-action-proposal')).toBe(true);

    script({ content: [text('Done.')] });
    const { events } = await decide(conversationId, card.approval.id, true);
    expect(done(events)?.status).toBe('complete');
    expect(receiptStates(events)).toEqual(['held', 'completed']);
    const after = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    expect(after.at(-1)!.parts.find((p) => p.type === 'tool-create_focus_area')).toMatchObject({ state: 'approval-responded', approval: { id: key, approved: true } });
  });

  it('a ledger row written by hand is never committed: only a plan this server sealed can be confirmed', async () => {
    const { conversationId, key } = await propose();
    // The ledger's policy lets a coach write their own rows. Here the stored plan is swapped for one the planner never produced.
    const stored = runs()[0]!.proposed_input as { proposal: { summary: string; facts: unknown[] } };
    stored.proposal = { ...stored.proposal, summary: 'Create a focus area for a player on another team.' };
    const model = script({ content: [text('That did not go through.')] });
    const { events } = await decide(conversationId, key, true);

    await afterHold();
    expect(log.commits).toHaveLength(0);
    expect(runs()[0]!.status).toBe('proposed');
    const receipt = (events.find((e) => e.type === 'receipt') as { part: { data: { status: string } } }).part.data;
    expect(receipt.status).toBe('failed');
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result).toMatchObject({ is_error: true });
    expect(result!.content).toContain('Nothing was written');
    expect(h.logServerError.mock.calls.some((c) => String((c as unknown[])[0]).includes('seal'))).toBe(true);
  });

  it('a plan that cannot be recorded shows no card and the model is told nothing was written', async () => {
    db.tables[RUNS] = [];
    const client = db.client as { from: (table: string) => unknown };
    const realFrom = client.from;
    client.from = (table: string) => (table === RUNS ? { upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }) } : realFrom(table));
    const model = script({ content: [toolUse('tu_task', 'create_focus_area', { title: 'Wedges' })] }, { content: [text('I could not prepare that.')] });
    const { events } = await ask('Make a wedge focus area');
    expect(events.some((e) => e.type === 'proposal' || e.type === 'decision_needed')).toBe(false);
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ is_error?: boolean; content: string }>;
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
    expect(lastRequestMessages(model)).toEqual([{ role: 'user', content: 'How is Avery scoring?' }, sys]);
    expect(assistantRows()).toHaveLength(1);
    expect(assistantRows()[0]).toMatchObject({ status: 'complete', content: '71.4.' });
  });
});

describe('a turn that does not finish', () => {
  it('a refusal is an answer: the half-streamed words are withdrawn, the coach gets a sentence they can act on, the turn is stored complete, and the category is logged', async () => {
    const model = script({ content: [text('I can')], stop_reason: 'refusal', category: 'general_harms' });
    const { events } = await ask('Something the model declines');
    const sentence = 'I can’t help with that one. Try asking it another way, or ask me about your team, your players or your schedule.';
    expect(events.some((e) => e.type === 'text_discard')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(done(events)?.status).toBe('complete');
    // There is no server-side fallback on this model: one call, and the app handles the refusal itself.
    expect(model.requests).toHaveLength(1);
    const [row] = assistantRows();
    expect(row).toMatchObject({ status: 'complete', content: sentence });
    expect((row!.ui_parts as Array<{ type: string; text?: string }>).filter((p) => p.type === 'text').map((p) => p.text)).toEqual([sentence]);
    expect((row!.ui_parts as Array<{ type: string }>).some((p) => p.type === 'data-turn-incomplete')).toBe(false);
    // The model's refused content is not kept; the sentence stands as the reply, so the next turn follows an assistant message.
    expect(row!.model_messages).toEqual([{ role: 'user', content: 'Something the model declines' }, sys, { role: 'assistant', content: [{ type: 'text', text: sentence }] }]);
    const logged = h.logServerEvent.mock.calls.map((c) => c as unknown[]).find((c) => c[0] === 'chat/stream: turn');
    expect((logged![1] as { extra: { refusalCategory: string } }).extra).toMatchObject({ refusalCategory: 'general_harms' });
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
    // A failed turn leaves only the question: its system message would otherwise sit before another user message, which the API rejects.
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
      sys,
    ]);
  });

  it('a card still confirms: its turn is kept in the ledger row, and Confirm continues the same turn', async () => {
    script({ content: [thinking('sig-p'), toolUse('tu_task', 'create_focus_area', { title: 'Putting from 6 feet' })] });
    const proposed = await ask('Make a putting focus area');
    expect(done(proposed.events)?.status).toBe('awaiting_decision');
    const key = keyOf(proposed.events);
    expect((runs()[0]!.proposed_input as { resume?: unknown }).resume).toBeTruthy();

    const model = script({ content: [text('Done.')] });
    const { events } = await decide(conversationOf(proposed.events), key, true);
    expect(done(events)?.status).toBe('complete');
    expect(receiptStates(events)).toEqual(['held', 'completed']);
    const sent = lastRequestMessages(model);
    expect(sent.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    expect(sent[2]!.content).toEqual([thinking('sig-p'), toolUse('tu_task', 'create_focus_area', { title: 'Putting from 6 feet' })]);
    expect(sent[3]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_task', content: 'Committed. Created the focus area.' }]);
    expect(assistantRows()).toHaveLength(1);
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
      sys,
    ]);
    // Its card carries an approval id of the old SDK, which names nothing the server holds: it is not offered again.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never);
    expect(restored.some((m) => m.parts.some((p) => p.type.startsWith('tool-')))).toBe(false);
  });
});

describe('the screens the tools read through', () => {
  const ROUND = '3f0e7c1a-2b4d-4c6e-8f10-1a2b3c4d5e6f';
  const review = {
    id: ROUND, playerId: 'player-a', playerName: 'Avery Lane', date: '2026-11-08', course: 'Pine Hill', type: 'qualifying', holesPlayed: 18, score: 71, toPar: -1,
    front: { score: 35, toPar: -1 }, back: { score: 36, toPar: 0 }, putts: 29, fairways: { hit: 10, of: 14 }, greens: { hit: 13, of: 18 },
    strokesGained: null, recap: null, notes: null, coachNote: null, holes: [], holesError: false,
  };

  it('get_round reads the Round page through the route’s binding, as the signed-in coach of that team', async () => {
    h.loadRoundReview.mockResolvedValueOnce({ kind: 'ok', review });
    const model = script({ content: [toolUse('tu_1', 'get_round', { round_id: ROUND })] }, { content: [text('Avery shot 71.')] });
    const { events } = await ask('How did Avery play on Saturday?');
    expect(done(events)?.status).toBe('complete');
    expect(h.loadRoundReview).toHaveBeenLastCalledWith(ROUND, { role: 'coach', teamId: 'team-1' });
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ is_error?: boolean; content: Array<{ type: string; content: Array<{ text: string }> }> }>;
    expect(result!.is_error).toBeUndefined();
    expect(result!.content[0]!.type).toBe('search_result');
    const lines = result!.content[0]!.content.map((b) => b.text).join('\n');
    expect(lines).toContain('Pine Hill');
    expect(lines).toContain('71');
    expect(lines).toContain('29 putts');
  });

  it('a Round page that throws is a read that could not be made, never a round with nothing in it', async () => {
    h.loadRoundReview.mockRejectedValueOnce(new Error('database down'));
    script({ content: [toolUse('tu_1', 'get_round', { round_id: ROUND })] }, { content: [text('I could not read that round.')] });
    const { events } = await ask('How did Avery play on Saturday?');
    const finished = events.find((e) => e.type === 'read_finished') as { state: string };
    expect(finished.state).toBe('failed');
    const evidence = events.find((e) => e.type === 'evidence') as { part: { data: { envelope: { coverage: string; coverage_note: string } } } };
    expect(evidence.part.data.envelope.coverage).toBe('unavailable');
    expect(evidence.part.data.envelope.coverage_note).toContain('could not be read');
  });

  it('a loader the route has not bound reads as unavailable too, so a missing binding is visible and not wrong', async () => {
    const unbound = await getRound.run({ sb: db.client as never, who: { coach_id: 'coach-1', user_id: 'user-1', team_id: 'team-1', team_name: 'Test Team', timezone: 'America/New_York', roster: [] } as never, conversationId: 'c', surface: 'ask', loaders: {}, signal: new AbortController().signal, reads: new Map() }, { round_id: ROUND });
    expect(unbound.coverage).toBe('unavailable');
    expect(unbound.measurements).toEqual([]);
    expect(unbound.coverage_note).toContain('not connected');
  });

  it('the Tournaments page is bound only while its flag is on', async () => {
    script({ content: [toolUse('tu_1', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    await ask('Team?');
    expect(log.reads.at(-1)!.loaders.roundReview).toBeTypeOf('function');
    expect(log.reads.at(-1)!.loaders.tournaments).toBeUndefined();

    h.flags.add('golf_tournaments_v1');
    script({ content: [toolUse('tu_2', 'get_team_stats', {})] }, { content: [text('74.2.')] });
    await ask('Team?');
    const tournaments = log.reads.at(-1)!.loaders.tournaments!;
    h.loadTournamentsHome.mockResolvedValueOnce({ kind: 'ready', data: { players: [], events: [], errors: {} } });
    expect(await tournaments()).toMatchObject({ kind: 'ready' });
    expect(h.loadTournamentsHome).toHaveBeenLastCalledWith({ team: { role: 'coach', teamId: 'team-1' } });
  });

  it('a player’s Round page is asked for as that player', async () => {
    h.role = 'player';
    script({ content: [toolUse('tu_1', 'get_my_stats', {})] }, { content: [text('73.1.')] });
    await ask('How am I scoring?');
    const load = log.reads.at(-1)!.loaders.roundReview!;
    await load(ROUND);
    expect(h.loadRoundReview).toHaveBeenLastCalledWith(ROUND, { role: 'player', playerId: 'player-me', teamId: 'team-1' });
    expect(log.reads.at(-1)!.loaders.tournaments).toBeUndefined();
  });
});

describe('find_in_app, which answers with Clubhouse addresses', () => {
  const names = (model: FakeModel) => (model.requests[0]!.tools as Array<{ name: string }>).map((t) => t.name);

  it('is offered to a team with Clubhouse on, and the screen the chat was opened from is told to the model', async () => {
    const model = script({ content: [text('It is on Roster.')] });
    await ask('Where do I set the lineup?', null, { screen: { screen: 'Roster' } });
    expect(names(model)).toContain('find_in_app');
    expect(lastRequestMessages(model)[1]!.content).toBe('Today is Tuesday 10 November 2026. The coach is on Roster.');
  });

  it('is not offered to a team without it; a call naming it is answered as an error, not a crash; and the screen is not named', async () => {
    h.clubhouse = false;
    const model = script({ content: [toolUse('tu_1', 'find_in_app', {})] }, { content: [text('Look under Roster.')] });
    const { events } = await ask('Where do I set the lineup?', null, { screen: { screen: 'Roster' } });
    expect(names(model)).toEqual(['get_player_stats', 'get_team_stats', 'create_focus_area', 'get_rounds', 'get_round', 'code_execution']);
    expect(done(events)?.status).toBe('complete');
    expect(log.reads).toHaveLength(0);
    expect((lastRequestMessages(model)[3]!.content as unknown[])[0]).toEqual({ type: 'tool_result', tool_use_id: 'tu_1', content: 'There is no tool named find_in_app.', is_error: true });
    // The place names are Clubhouse's: without it the line is the date alone, and nothing is echoed for a chip.
    expect(lastRequestMessages(model)[1]!.content).toBe(TODAY);
    expect((events[0] as { context?: unknown }).context).toBeNull();
    // The list without the tool is the same bytes on every request, so it caches on its own.
    const again = script({ content: [text('74.2.')] });
    await ask('Team?');
    expect(again.requests[0]!.tools).toEqual(model.requests[0]!.tools);
  });
});

describe('what the thread is told about a turn besides its words', () => {
  it('when it started, the screen it was asked from, that the model is thinking, how long it took and how many reads it made', async () => {
    script({ content: [toolUse('tu_1', 'get_team_stats', {}), toolUse('tu_2', 'get_rounds', {})] }, { content: [text('74.2.')] });
    const { events } = await ask('Team?', null, { screen: { screen: 'Stats' } });

    const start = events[0] as { type: string; started_at: string; context: unknown };
    expect(start.type).toBe('message_start');
    expect(new Date(start.started_at).toISOString()).toBe(start.started_at);
    expect(start.context).toEqual({ screen: 'stats', label: 'Stats' });
    // "Thinking" is the server's word: sent before each model call, before anything of the answer.
    expect(events[1]).toEqual({ type: 'phase', phase: 'thinking' });
    expect(events.filter((e) => e.type === 'phase')).toHaveLength(2);
    const end = done(events) as { status: string; duration_ms: number };
    expect(end.duration_ms).toBeGreaterThanOrEqual(0);

    // Stored with the turn, so a restored thread can say "2 reads · 1s".
    const [row] = assistantRows();
    const meta = turnMetaOf(row!.ui_parts as never)!;
    expect(meta).toMatchObject({ started_at: start.started_at, reads: 2 });
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
    expect(meta).not.toHaveProperty('declined');
    expect((row!.ui_parts as Array<{ type: string }>).some((p) => p.type === 'phase')).toBe(false);
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never).at(-1)!;
    expect(turnMetaOf(restored.parts)).toEqual(meta);
    // The same part reaches the browser on the stream, so the live turn and the restored one agree.
    expect(events.some((e) => e.type === 'part' && e.part.type === 'data-turn-meta')).toBe(true);
  });

  it('a card’s turn keeps the time it began across the decision, and its duration adds up over both requests', async () => {
    script({ content: [toolUse('tu_task', 'create_focus_area', { title: 'Wedges' })] });
    const proposed = await ask('Make a wedge focus area');
    const waiting = turnMetaOf(assistantRows()[0]!.ui_parts as never)!;
    script({ content: [text('Done.')] });
    const { events } = await decide(conversationOf(proposed.events), keyOf(proposed.events), true);
    const after = turnMetaOf(assistantRows()[0]!.ui_parts as never)!;
    expect(after.started_at).toBe(waiting.started_at);
    // The second request waited the Undo window out.
    expect(after.duration_ms).toBeGreaterThanOrEqual(waiting.duration_ms + HOLD_MS - 20);
    expect((events[0] as { started_at: string }).started_at >= waiting.started_at).toBe(true);
  });

  it('a turn the model declined says so in its stored facts, since it is a complete turn and not an error', async () => {
    script({ content: [], stop_reason: 'refusal', category: 'cyber' });
    const { events } = await ask('Something the model declines');
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(turnMetaOf(assistantRows()[0]!.ui_parts as never)).toMatchObject({ declined: true });
  });

  it('a finished read says what it covered: the tool’s own words, else its sample; and a picture when the tool draws one', async () => {
    const picture = { kind: 'sg', title: 'Strokes gained a round, team', rows: [{ label: 'Putting', value: -0.4 }] };
    const sampled = { ...readTool('get_sampled', log, 74.2) } as ReadTool<{ player_id?: string }>;
    sampled.run = async () => ({ summary: 'Scoring', measurements: [{ metric_id: 'scoring_avg', metric_label: 'Scoring avg', unit: 'score', value: 74.2, entity: { kind: 'team', id: 'team-1', label: 'Team' }, window_start: '2026-08-01', window_end: '2026-11-10', sample_size: 1412, sample_unit: 'rounds', as_of: '2026-11-10T12:00:00.000Z' }] as never, series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-10T12:00:00.000Z' });
    const told = { ...readTool('get_told', log, 1) } as ReadTool<{ player_id?: string }>;
    told.run = async () => ({ summary: 'Putting', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-10T12:00:00.000Z', progress_detail: '38 rounds', progress_picture: picture });
    h.toolsFor.mockImplementation(() => asTools(sampled, told, readTool('get_bare', log, 1)));
    const model = script({ content: [toolUse('tu_1', 'get_sampled', {}), toolUse('tu_2', 'get_told', {}), toolUse('tu_3', 'get_bare', {})] }, { content: [text('Here.')] });
    const { events } = await ask('Team?');

    const rows = events.filter((e) => e.type === 'read_finished') as Array<{ tool: string; detail?: string; picture?: unknown }>;
    expect(rows.find((r) => r.tool === 'get_sampled')).toMatchObject({ detail: '1,412 rounds' });
    expect(rows.find((r) => r.tool === 'get_told')).toMatchObject({ detail: '38 rounds', picture });
    expect(rows.find((r) => r.tool === 'get_bare')).not.toHaveProperty('detail');
    // On the stored row too, in the shape the thread already reads.
    const stored = (assistantRows()[0]!.ui_parts as Array<{ type: string; data?: { tool?: string; detail?: string; picture?: unknown } }>).filter((p) => p.type === 'data-progress');
    expect(stored.find((p) => p.data?.tool === 'get_told')?.data).toMatchObject({ state: 'done', detail: '38 rounds', picture });
    // None of it is the model's business.
    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('38 rounds');
    expect(JSON.stringify(model.requests[1]!.messages)).not.toContain('Strokes gained a round');
  });
});

describe('a failure names its kind', () => {
  it('on the stream: a model fault, an answer cut off at its length limit, a card that is gone', async () => {
    script({ content: [text('Avery')], fail: new Error('upstream exploded') });
    const fault = await ask('How is Avery scoring?');
    expect(fault.events.find((e) => e.type === 'error')).toMatchObject({ kind: 'model', action: 'retry' });
    // The stored failure keeps the kind, so a restored turn shows the notice the live one did.
    const restored = restoreUIMessages((db.tables[MESSAGES] ?? []) as never).at(-1)!;
    expect(restored.parts[0]).toMatchObject({ type: 'data-turn-incomplete', data: { kind: 'model' } });

    script({ content: [toolUse('tu_1', 'get_team_stats', {})], stop_reason: 'max_tokens' });
    const cut = await ask('Everything about everyone?');
    expect(cut.events.find((e) => e.type === 'error')).toMatchObject({ kind: 'truncated', action: 'none' });

    const gone = await decide(conversationOf(cut.events), 'a-key-nobody-holds', true);
    expect(gone.events.find((e) => e.type === 'error')).toMatchObject({ kind: 'card_gone', action: 'none' });
  });

  it('in a refused request’s body: the budget, a conversation that is gone', async () => {
    h.checkBudget.mockResolvedValue({ allowed: false, fallback_reason: 'budget_gated' });
    const budget = await ask('How is Avery scoring?');
    expect(await budget.response.json()).toMatchObject({ kind: 'budget', reason: 'budget_gated' });
    h.checkBudget.mockResolvedValue({ allowed: false, fallback_reason: 'budget_disabled' });
    expect(await (await ask('How is Avery scoring?')).response.json()).toMatchObject({ kind: 'off' });
    h.checkBudget.mockResolvedValue({ allowed: true });
    db.tables.golf_coachhelm_chat_conversations = [{ id: '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11', coach_id: 'someone-else' }];
    expect(await (await ask('Hello', '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11')).response.json()).toMatchObject({ kind: 'gone' });
  });
});

describe('the surface a conversation was started on', () => {
  it('is stored with a new conversation and listed with it, so quick chat can list its own threads', async () => {
    script({ content: [text('74.2.')] });
    await ask('Team?', null, { surface: 'quick_chat' });
    script({ content: [text('74.2.')] });
    await ask('Team?');
    expect((db.tables.golf_coachhelm_chat_conversations ?? []).map((c) => c.surface)).toEqual(['quick_chat', 'ask']);
    expect((await listConversations(db.client as never)).map((c) => c.surface).sort()).toEqual(['ask', 'quick_chat']);
  });

  it('on a database without the column the conversation is still created and lists with no surface, and the column is not asked for again', async () => {
    setup({ surfaceColumn: false });
    script({ content: [text('74.2.')] });
    const { events } = await ask('Team?', null, { surface: 'quick_chat' });
    expect(done(events)?.status).toBe('complete');
    const [row] = db.tables.golf_coachhelm_chat_conversations ?? [];
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty('surface');
    expect((await listConversations(db.client as never)).map((c) => c.surface)).toEqual([null]);
    // A second conversation goes straight to the plain insert.
    script({ content: [text('74.2.')] });
    expect(done((await ask('Again?', null, { surface: 'quick_chat' })).events)?.status).toBe('complete');
    expect(db.tables.golf_coachhelm_chat_conversations).toHaveLength(2);
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
    const [result] = lastRequestMessages(model)[3]!.content as Array<{ is_error?: boolean; content: string }>;
    expect(result).toMatchObject({ is_error: true, content: 'Changes cannot be made from here. Nothing was written.' });
  });

  it('a decision is not accepted from a player', async () => {
    const { response } = await post({ conversation_id: '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11', decision: { key: 'k', approved: true } });
    expect(response.status).toBe(400);
  });
});
