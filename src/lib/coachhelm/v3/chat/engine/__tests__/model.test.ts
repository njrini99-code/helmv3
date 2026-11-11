import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import Anthropic from '@anthropic-ai/sdk';
import { addUsage, anthropicModelClient, buildModelRequest, callCostUsd, CHAT_FEATURES, CHAT_MODEL_OVERRIDE, chatFeatures, emptyUsage, fallbackModelOf, isPlain, isRejectedRequest, MissingModelKeyError, MODEL_PROFILES, modelToolFor, onLongCard, plainFeatures, profileFor, promptTokens, ratesFor, SURFACE_MODEL, turnCostUsd, type ChatFeatures } from '../model';
import { echoable } from '../loop';
import { estimateCostUsd, MODEL_FOR_TASK, PLAYER_CHAT_MODEL } from '@/lib/coachhelm/v3/llm/types';
import type { ChatTool } from '../tool';

const tool = (input: z.ZodType<unknown>, kind: 'read' | 'task' = 'read'): ChatTool =>
  ({ kind, name: kind === 'read' ? 'get_rounds' : 'create_event', description: 'Rounds.', input, progress: () => 'Reading', run: async () => ({ summary: '', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '' }) }) as unknown as ChatTool;

const rounds = tool(z.object({ player_id: z.string().uuid().describe('Player id from the roster.'), window: z.enum(['last5', 'last10']).default('last10'), last_n: z.number().int().min(1).max(20).optional() }));
const messages = [{ role: 'user' as const, content: 'How is Avery scoring?' }];
const SONNET = MODEL_PROFILES['claude-sonnet-5-5'];
const HAIKU = MODEL_PROFILES['claude-haiku-5-5'];
/** A request on the Haiku profile unless a test names another: the feature tests below are the same on either model. */
const request = (features?: ChatFeatures, extra: Partial<Parameters<typeof buildModelRequest>[0]> = {}) => buildModelRequest({ tools: [rounds, tool(z.object({ title: z.string() }), 'task')], system: { stable: 'POLICY', team: 'TEAM' }, messages, profile: HAIKU, ...(features ? { features } : {}), ...extra });
const response = (usage: Record<string, unknown>, dropped = 0) => ({ usage, input_transformations: Array.from({ length: dropped }, () => ({ type: 'thinking_dropped' })) }) as never;

describe('the model each surface runs on', () => {
  it('a coach’s three surfaces are Claude Sonnet 5.5 and a player’s Ask is Claude Haiku 5.5, one line per surface', () => {
    expect(SURFACE_MODEL).toEqual({ ask: 'claude-sonnet-5-5', quick_chat: 'claude-sonnet-5-5', practice_helper: 'claude-sonnet-5-5', player: 'claude-haiku-5-5' });
    expect(CHAT_MODEL_OVERRIDE).toBeNull();
    for (const surface of ['ask', 'quick_chat', 'practice_helper'] as const) expect(profileFor(surface)).toBe(SONNET);
    expect(profileFor('player')).toMatchObject({ modelId: 'claude-haiku-5-5', effort: 'high' });
    // The ledger and the budget gate use each profile's own id.
    expect(MODEL_FOR_TASK.coach_chat).toBe('anthropic/claude-sonnet-5-5');
    expect(PLAYER_CHAT_MODEL).toBe('anthropic/claude-haiku-5-5');
    expect(SONNET.ledgerId).toBe(MODEL_FOR_TASK.coach_chat);
    expect(profileFor('player').ledgerId).toBe(PLAYER_CHAT_MODEL);
    expect(estimateCostUsd(SONNET.ledgerId, 1_000_000, 1_000_000)).toBe(12);
    expect(estimateCostUsd(HAIKU.ledgerId, 1_000_000, 1_000_000)).toBeCloseTo(0.6, 10);
    // A player never has the model's code, on whichever model.
    expect(chatFeatures('player')).toEqual({ ...HAIKU.features, programmaticReads: false });
    expect(chatFeatures('ask')).toBe(CHAT_FEATURES);
    expect(CHAT_FEATURES).toBe(SONNET.features);
  });

  it('one override puts every surface on one model, for the eval; a player still gets no code tool', () => {
    for (const surface of ['ask', 'quick_chat', 'practice_helper'] as const) expect(profileFor(surface, 'claude-haiku-5-5')).toBe(HAIKU);
    expect(profileFor('player', 'claude-sonnet-5-5')).toMatchObject({ modelId: 'claude-sonnet-5-5', effort: 'medium', features: { ...SONNET.features, programmaticReads: false } });
    expect(profileFor('ask', 'claude-sonnet-5-5')).toBe(SONNET);
  });

  it('Sonnet 5.5: effort medium, adaptive thinking, the refusal fallback and progress notes on, never a forced tool', () => {
    const sent = request(undefined, { profile: SONNET });
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.output_config).toEqual({ effort: 'medium' });
    expect(sent.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' }, display: 'updates' });
    // The scalar fallback form and its own header (the array form's header with it is a 400).
    expect(sent.fallbacks).toBe('default');
    expect(sent.betas).toEqual(['thinking-binding-controls-2026-08-01', 'thinking-display-updates-2026-08-18', 'compact-2026-01-12', 'server-side-fallback-2026-07-01']);
    expect(sent.tool_choice).toEqual({ type: 'auto' });
    expect(request(undefined, { profile: SONNET, answerOnly: true }).tool_choice).toEqual({ type: 'none' });
    for (const rejected of ['temperature', 'top_p', 'top_k']) expect(sent).not.toHaveProperty(rejected);
    expect(SONNET.features).toEqual({ dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: true, programmaticReads: true, refusalFallback: true });
  });

  it('Haiku 5.5: effort high, no fallbacks parameter at all, no progress notes', () => {
    const sent = request(undefined, { profile: profileFor('player') });
    expect(sent.model).toBe('claude-haiku-5-5');
    // The model's own default is medium: the effort is sent on every request.
    expect(sent.output_config).toEqual({ effort: 'high' });
    for (const rejected of ['fallbacks', 'temperature', 'top_p', 'top_k']) expect(sent).not.toHaveProperty(rejected);
    expect(sent.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(sent.betas).toEqual(['thinking-binding-controls-2026-08-01', 'compact-2026-01-12']);
    expect(sent.tool_choice).toEqual({ type: 'auto' });
    expect(HAIKU.features).toEqual({ dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: false, programmaticReads: true, refusalFallback: false });
  });

  it('what is kept of a turn a refusal fallback took over: text and everything after the last boundary; not the declining model’s thinking or tool calls', () => {
    const thinking = (signature: string) => ({ type: 'thinking', thinking: '', signature });
    const text = (value: string) => ({ type: 'text', text: value, citations: null });
    const hop = { type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-sonnet-5' }, trigger: { type: 'refusal', category: 'cyber' } };
    const paired = [{ type: 'server_tool_use', id: 'srv_1', name: 'code_execution', input: {} }, { type: 'code_execution_tool_result', tool_use_id: 'srv_1', content: {} }];
    const turn = [thinking('a'), text('Looking at '), { type: 'tool_use', id: 'tu_dropped', name: 'get_rounds', input: {} }, ...paired, { type: 'server_tool_use', id: 'srv_open', name: 'code_execution', input: {} }, hop, thinking('b'), text('the team.'), { type: 'tool_use', id: 'tu_kept', name: 'get_rounds', input: {} }];
    expect(echoable(turn as never)).toEqual([text('Looking at '), ...paired, hop, thinking('b'), text('the team.'), { type: 'tool_use', id: 'tu_kept', name: 'get_rounds', input: {} }]);
    // A turn no fallback touched is the very same array: exactly as returned.
    const plain = [thinking('a'), text('71.4.')];
    expect(echoable(plain as never)).toBe(plain);
  });
});

describe('the model request', () => {
  it('a zod input becomes a JSON Schema object the API takes: strict, closed, defaults optional for the model, no $schema key', () => {
    const direct = { ...HAIKU.features, programmaticReads: false };
    const converted = modelToolFor(rounds, direct);
    expect(converted).toMatchObject({ name: 'get_rounds', description: 'Rounds.', eager_input_streaming: true, strict: true });
    expect(converted).not.toHaveProperty('allowed_callers');
    const schema = converted.input_schema as { type: string; additionalProperties?: boolean; properties: Record<string, { description?: string; enum?: string[] }>; required?: string[]; $schema?: string };
    expect(schema.type).toBe('object');
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['player_id']);
    expect(schema.properties.player_id!.description).toContain('Player id from the roster.');
    expect(schema.properties.window!.enum).toEqual(['last5', 'last10']);
    // Without strict the schema is sent as written, and the engine's own zod check is the only gate (it always runs).
    const loose = modelToolFor(rounds, { ...direct, strictTools: false });
    // The schema is the same whichever model it is sent to.
    expect(modelToolFor(rounds, { ...SONNET.features, programmaticReads: false })).toEqual(converted);
    expect(loose).not.toHaveProperty('strict');
    expect((loose.input_schema as { required?: string[] }).required).toEqual(['player_id']);
  });

  it('caches the tools and the policy for an hour and the team block for five minutes, and never marks a stored message', () => {
    const sent = request();
    // Render order is tools, system, messages: the first breakpoint, on the policy block, covers the tool list too.
    expect(sent.system).toEqual([
      { type: 'text', text: 'POLICY', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'TEAM', cache_control: { type: 'ephemeral' } },
    ]);
    expect(JSON.stringify(sent.tools)).not.toContain('cache_control');
    // The conversation's tail is cached by the request-level marker; the stored message objects are untouched.
    expect(sent.cache_control).toEqual({ type: 'ephemeral' });
    expect(sent.messages).toEqual(messages);
    expect(messages[0]).toEqual({ role: 'user', content: 'How is Avery scoring?' });
    // An empty team block is not sent as an empty text block (the API refuses one).
    expect(buildModelRequest({ tools: [], system: { stable: 'POLICY', team: '' }, messages }).system).toHaveLength(1);
  });

  it('each optional feature is one field: on, the request carries its header and shape; off, neither', () => {
    const off: ChatFeatures = { dropStaleThinking: false, strictTools: false, citations: false, compaction: false, taskBudgetTokens: null, progressNotes: false, programmaticReads: false, refusalFallback: false };
    const plain = request(off);
    expect(plain).not.toHaveProperty('betas');
    expect(plain).not.toHaveProperty('context_management');
    expect(plain).not.toHaveProperty('container');
    expect(plain.thinking).toEqual({ type: 'adaptive' });
    expect(plain.output_config).toEqual({ effort: 'high' });
    expect(plain.tools).toHaveLength(2);

    const stale = request({ ...off, dropStaleThinking: true });
    expect(stale.betas).toEqual(['thinking-binding-controls-2026-08-01']);
    expect(stale.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });

    const compact = request({ ...off, compaction: true });
    expect(compact.betas).toEqual(['compact-2026-01-12']);
    expect(compact.context_management).toEqual({ edits: [{ type: 'compact_20260112' }] });

    const budget = request({ ...off, taskBudgetTokens: 60_000 });
    expect(budget.betas).toEqual(['task-budgets-2026-03-13']);
    expect(budget.output_config).toEqual({ effort: 'high', task_budget: { type: 'tokens', total: 60_000 } });

    const notes = request({ ...off, progressNotes: true });
    expect(notes.betas).toEqual(['thinking-display-updates-2026-08-18']);
    expect(notes.thinking).toEqual({ type: 'adaptive', display: 'updates' });

    const fallback = request({ ...off, refusalFallback: true });
    expect(fallback.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(fallback.fallbacks).toBe('default');
    expect(plain).not.toHaveProperty('fallbacks');

    // Programmatic calling is stable (no header): the code tool is offered, reads may be called from code and so are not strict.
    const code = request({ ...off, strictTools: true, programmaticReads: true }, { container: 'container_1' });
    expect(code).not.toHaveProperty('betas');
    expect(code.container).toBe('container_1');
    const tools = code.tools as Array<{ name: string; type?: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.map((t) => t.name)).toEqual(['get_rounds', 'create_event', 'code_execution']);
    expect(tools[0]).toMatchObject({ allowed_callers: ['direct', 'code_execution_20260120'] });
    expect(tools[0]).not.toHaveProperty('strict');
    expect(tools[1]).toMatchObject({ strict: true });
    expect(tools[1]).not.toHaveProperty('allowed_callers');
    expect(tools[2]).toEqual({ type: 'code_execution_20260120', name: 'code_execution' });
  });

  it('with the model’s code on, a read may be called from code and is not strict, a task is direct-only and strict, and the code tool is last', () => {
    const sent = request();
    // With the code tool on: the read may be called from code and is not strict; the task is direct-only and strict; the code tool is last.
    const tools = sent.tools as Array<{ name: string; type?: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.map((t) => [t.name, t.strict ?? null, t.allowed_callers ?? null])).toEqual([
      ['get_rounds', null, ['direct', 'code_execution_20260120']],
      ['create_event', true, null],
      ['code_execution', null, null],
    ]);
    // A tool on the read contract that changes something is direct-only: never offered to the code, and still strict.
    const note = modelToolFor({ ...rounds, name: 'save_note', direct_only: true } as ChatTool);
    expect(note).toMatchObject({ name: 'save_note', strict: true });
    expect(note).not.toHaveProperty('allowed_callers');
    // A player's request has no code tool, and its reads are strict.
    const player = request(chatFeatures('player')).tools as Array<{ name: string; strict?: boolean }>;
    expect(player.map((t) => [t.name, t.strict ?? null])).toEqual([['get_rounds', true], ['create_event', true]]);
  });

  it('the plain request a rejected one is retried as carries no beta and no strict schema, and is not retried again', () => {
    const plain = plainFeatures({ ...SONNET.features, taskBudgetTokens: 60_000 });
    expect(isPlain(SONNET.features)).toBe(false);
    expect(isPlain(HAIKU.features)).toBe(false);
    // The fallback's beta on its own is still something to fall back from.
    expect(isPlain({ ...plain, refusalFallback: true })).toBe(false);
    expect(isPlain(plain)).toBe(true);
    // The code tool on its own is still something to fall back from.
    expect(isPlain({ ...plain, programmaticReads: true })).toBe(false);
    const sent = request(plain);
    expect(sent).not.toHaveProperty('betas');
    expect(sent).not.toHaveProperty('fallbacks');
    // The plain request keeps the profile's model and effort: only what is optional goes.
    expect(request(plain, { profile: SONNET })).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'medium' }, thinking: { type: 'adaptive' } });
    expect(request(plain, { profile: SONNET })).not.toHaveProperty('fallbacks');
    expect((sent.tools as Array<{ name: string }>).map((t) => t.name)).toEqual(['get_rounds', 'create_event']);
    expect(JSON.stringify(sent.tools)).not.toContain('allowed_callers');
    expect(sent).not.toHaveProperty('context_management');
    expect(sent.thinking).toEqual({ type: 'adaptive' });
    expect(sent.output_config).toEqual({ effort: 'high' });
    expect(JSON.stringify(sent.tools)).not.toContain('strict');
    // Only a 400 is cured by a plainer request.
    expect(isRejectedRequest(Anthropic.APIError.generate(400, {}, 'bad', new Headers()))).toBe(true);
    expect(isRejectedRequest(Anthropic.APIError.generate(529, {}, 'overloaded', new Headers()))).toBe(false);
    expect(isRejectedRequest(new Error('socket closed'))).toBe(false);
  });
});

describe('what a turn costs', () => {
  const cost = (usage: Record<string, unknown>) => {
    const total = emptyUsage();
    addUsage(total, response(usage));
    return callCostUsd(total.calls[0]!);
  };

  it('bills cached input at its own rate: the ledger total includes it, the cost does not charge it in full', () => {
    const usage = emptyUsage();
    addUsage(usage, response({ input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }));
    addUsage(usage, response({ input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 9500, cache_creation_input_tokens: 0 }));
    expect(promptTokens(usage)).toBe(20000);
    expect(usage.calls.map((c) => c.cache_read)).toEqual([9000, 9500]);
    // 1,500 fresh at $0.10 / MTok, 18,500 read at a tenth of that, 300 out at $0.50 / MTok.
    expect(turnCostUsd(usage)).toBeCloseTo((1500 * 0.1 + 18500 * 0.01 + 300 * 0.5) / 1e6, 12);
  });

  it('a cache write costs more than fresh input: 1.25x for five minutes, 2x for an hour', () => {
    // 4,000 written, of which 3,000 on the one-hour breakpoint (tools and policy) and the rest on five-minute ones.
    const usd = cost({ input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000, cache_creation: { ephemeral_1h_input_tokens: 3000, ephemeral_5m_input_tokens: 1000 } });
    expect(usd).toBeCloseTo(((100 + 1000 * 1.25 + 3000 * 2) * 0.1) / 1e6, 12);
    // A write the API does not break down is billed as a five-minute one.
    expect(cost({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 })).toBeCloseTo((1000 * 1.25 * 0.1) / 1e6, 12);
  });

  it('a prompt over 100K tokens is on the long rate card, five times the short one, each call judged by its own prompt', () => {
    const short = { input_tokens: 10_000, output_tokens: 1000, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 };
    const long = { ...short, input_tokens: 10_001 };
    expect(cost(short)).toBeCloseTo((10_000 * 0.1 + 90_000 * 0.01 + 1000 * 0.5) / 1e6, 12);
    expect(cost(long)).toBeCloseTo((10_001 * 0.5 + 90_000 * 0.05 + 1000 * 2.5) / 1e6, 12);
    const usage = emptyUsage();
    addUsage(usage, response(short));
    addUsage(usage, response(long));
    expect(turnCostUsd(usage)).toBeCloseTo(cost(short) + cost(long), 12);
  });

  it('Sonnet 5.5 is $2 in and $10 out at every prompt length, with the same cache multipliers and no second rate card', () => {
    const sonnet = (usage: Record<string, unknown>) => {
      const total = emptyUsage();
      addUsage(total, response(usage), 'claude-sonnet-5-5');
      return total.calls[0]!;
    };
    const call = sonnet({ input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 4000, cache_creation: { ephemeral_1h_input_tokens: 3000 } });
    expect(call.model).toBe('claude-sonnet-5-5');
    // 1,000 fresh; 20,000 read at $0.20; 1,000 written for five minutes at $2.50 and 3,000 for an hour at $4; 500 out at $10.
    expect(callCostUsd(call)).toBeCloseTo((1000 * 2 + 20_000 * 0.2 + 1000 * 2.5 + 3000 * 4 + 500 * 10) / 1e6, 12);
    const big = sonnet({ input_tokens: 150_000, output_tokens: 0 });
    expect(onLongCard(big)).toBe(false);
    expect(callCostUsd(big)).toBeCloseTo((150_000 * 2) / 1e6, 12);
    // A model id with a date suffix is the same model; one the table does not hold is charged at the dearest card, never as free.
    expect(ratesFor('claude-haiku-5-5-20261101')).toBe(ratesFor('claude-haiku-5-5'));
    expect(ratesFor('claude-sonnet-5-20260801')).toEqual({ input: 2, output: 10 });
    expect(ratesFor('some-future-model')).toEqual({ input: 2, output: 10 });
  });

  it('a refusal fallback is billed per attempt: the attempt that declined and the substitute that answered, each at its own model’s rate', () => {
    const usage = emptyUsage();
    addUsage(
      usage,
      {
        model: 'claude-sonnet-5',
        // The top-level figures cover only the attempt that produced the message; the iterations are the record.
        usage: {
          input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
          iterations: [
            { type: 'message', model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 40, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 0 },
            { type: 'fallback_message', model: 'claude-sonnet-5', input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 21_000 },
          ],
        },
        input_transformations: [{ type: 'thinking_dropped' }],
      },
      'claude-sonnet-5-5',
    );
    expect(usage.calls.map((c) => [c.model, c.kind, c.dropped_thinking])).toEqual([['claude-sonnet-5-5', 'message', 1], ['claude-sonnet-5', 'fallback_message', 0]]);
    expect(fallbackModelOf(usage)).toBe('claude-sonnet-5');
    expect(usage.output).toBe(340);
    expect(turnCostUsd(usage)).toBeCloseTo((1000 * 2 + 20_000 * 0.2 + 40 * 10 + 900 * 2 + 21_000 * 2.5 + 300 * 10) / 1e6, 12);
    // No fallback: nothing to name.
    const plain = emptyUsage();
    addUsage(plain, response({ input_tokens: 1, output_tokens: 1 }), 'claude-sonnet-5-5');
    expect(fallbackModelOf(plain)).toBeNull();
  });

  it('a compaction is its own billed entry, which the top-level figures leave out', () => {
    const usage = emptyUsage();
    addUsage(usage, { usage: { input_tokens: 500, output_tokens: 100, iterations: [{ type: 'compaction', model: 'claude-haiku-5-5', input_tokens: 4000, output_tokens: 600 }, { type: 'message', model: 'claude-haiku-5-5', input_tokens: 500, output_tokens: 100 }] } });
    expect(usage.calls.map((c) => c.kind)).toEqual(['compaction', 'message']);
    expect(turnCostUsd(usage)).toBeCloseTo((4500 * 0.1 + 700 * 0.5) / 1e6, 12);
  });

  it('counts the thinking blocks the API says it dropped, per call', () => {
    const usage = emptyUsage();
    addUsage(usage, response({ input_tokens: 1, output_tokens: 1 }, 2));
    addUsage(usage, response({ input_tokens: 1, output_tokens: 1 }));
    expect(usage.calls.map((c) => c.dropped_thinking)).toEqual([2, 0]);
  });
});

describe('the model client', () => {
  it('a missing key is its own error, so the route can say so plainly', () => {
    const before = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = '  ';
    try {
      expect(() => anthropicModelClient()).toThrow(MissingModelKeyError);
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = before;
    }
  });
});
