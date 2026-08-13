/**
 * Which ACCOUNT an LLM call bills.
 *
 * A bare `'anthropic/…'` string routes through the Vercel AI Gateway and bills
 * the Vercel team balance; `anthropic(...)` uses ANTHROPIC_API_KEY and bills
 * Anthropic. Three call sites used to make this choice independently and two
 * made it wrong, which is why the decision now lives in one function — and why
 * it is worth pinning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const anthropicMock = vi.fn((modelName: string) => ({ __direct: modelName }));
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelName: string) => anthropicMock(modelName),
}));

import { resolveModelProvider } from './model-provider';

beforeEach(() => {
  anthropicMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveModelProvider', () => {
  it('returns the direct Anthropic provider when the key is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');

    expect(resolveModelProvider('anthropic/claude-haiku-4-5')).toEqual({
      __direct: 'claude-haiku-4-5',
    });
    // The prefix is the gateway's routing syntax, not part of the model name.
    // Passing it through would make the direct call 404 on an unknown model.
    expect(anthropicMock).toHaveBeenCalledWith('claude-haiku-4-5');
  });

  it('returns the gateway string unchanged when no key is configured', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    expect(resolveModelProvider('anthropic/claude-sonnet-5')).toBe('anthropic/claude-sonnet-5');
    expect(anthropicMock).not.toHaveBeenCalled();
  });

  /**
   * Non-vacuity guard. Without this the two cases above could both pass on a
   * function that ignored the prefix entirely and always returned the input.
   */
  it('leaves a non-Anthropic model on the gateway even when the key is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');

    // An OpenAI model has no business being served by the Anthropic provider —
    // the key would be rejected and the failure would read as a credential
    // problem rather than a routing one.
    expect(resolveModelProvider('openai/gpt-5')).toBe('openai/gpt-5');
    expect(anthropicMock).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only key as absent rather than as a credential', () => {
    // `vercel env pull` writes masked/blank values for sensitive vars, so a
    // blank ANTHROPIC_API_KEY in a local .env is a realistic state. Selecting
    // the direct provider on one would fail every call with an auth error
    // instead of degrading to the gateway.
    vi.stubEnv('ANTHROPIC_API_KEY', '   ');

    expect(resolveModelProvider('anthropic/claude-haiku-4-5')).toBe('anthropic/claude-haiku-4-5');
    expect(anthropicMock).not.toHaveBeenCalled();
  });
});
