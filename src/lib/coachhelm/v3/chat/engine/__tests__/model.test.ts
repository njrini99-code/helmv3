import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

import { addUsage, anthropicModelClient, buildModelRequest, emptyUsage, MissingModelKeyError, modelToolFor, promptTokens, turnCostUsd } from '../model';
import type { ChatTool } from '../tool';

const tool = (input: z.ZodType<unknown>): ChatTool => ({ kind: 'read', name: 'get_rounds', description: 'Rounds.', input, progress: () => 'Reading', run: async () => ({ summary: '', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '' }) }) as ChatTool;

describe('the model request', () => {
  it('a zod input becomes a plain JSON Schema object the API takes: defaults are optional for the model, no $schema key', () => {
    const converted = modelToolFor(tool(z.object({ player_id: z.string().uuid().describe('Player id from the roster.'), window: z.enum(['last5', 'last10']).default('last10'), last_n: z.number().int().min(1).max(20).optional() })));
    expect(converted).toMatchObject({ name: 'get_rounds', description: 'Rounds.', eager_input_streaming: true });
    const schema = converted.input_schema as { type: string; properties: Record<string, { description?: string; enum?: string[] }>; required?: string[]; $schema?: string };
    expect(schema.type).toBe('object');
    expect(schema.$schema).toBeUndefined();
    expect(schema.required).toEqual(['player_id']);
    expect(schema.properties.player_id!.description).toBe('Player id from the roster.');
    expect(schema.properties.window!.enum).toEqual(['last5', 'last10']);
  });

  it('never sends what this model rejects, and never marks a stored message', () => {
    const messages = [{ role: 'user' as const, content: 'How is Avery scoring?' }];
    const request = buildModelRequest({ tools: [], system: { stable: 'POLICY', team: '' }, messages });
    for (const rejected of ['temperature', 'top_p', 'top_k']) expect(request).not.toHaveProperty(rejected);
    expect(request.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(request.tool_choice).toEqual({ type: 'auto' });
    // An empty team block is not sent as an empty text block (the API refuses one).
    expect(request.system).toHaveLength(1);
    // The tail is cached by the request-level marker; the stored message objects are untouched.
    expect(request.messages).toEqual(messages);
    expect(messages[0]).toEqual({ role: 'user', content: 'How is Avery scoring?' });
    expect(buildModelRequest({ tools: [], system: { stable: 'P', team: 'T' }, messages, answerOnly: true }).tool_choice).toEqual({ type: 'none' });
  });

  it('bills cached input at its own rate: the ledger total includes it, the cost does not charge it in full', () => {
    const usage = emptyUsage();
    addUsage(usage, { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 } as never);
    addUsage(usage, { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 9500, cache_creation_input_tokens: 0 } as never);
    expect(promptTokens(usage)).toBe(20000);
    expect(usage.calls.map((c) => c.cache_read)).toEqual([9000, 9500]);
    // 1,500 fresh at $2 / MTok, 18,500 read at a tenth of that, 300 out at $10 / MTok.
    expect(turnCostUsd(usage)).toBeCloseTo(0.003 + 0.0037 + 0.003, 6);
  });

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
