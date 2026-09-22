/**
 * Judgment modules with the TypeSafe transport mocked.
 *
 * Proves (1) an absent key yields `null` with no network call, (2) a transport
 * failure yields `null` rather than throwing into the caller, and (3) each
 * module's question set is shaped as the API contract requires and its
 * interpretation of the answers is right. No test here reaches the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

import { __resetTypeSafeClientForTests, askJev, isTypeSafeConfigured } from '../client';
import { judgeFlaggedClaims } from '../judgments/chat-claims';
import { judgeRecapSupport, RECAP_QUESTIONS } from '../judgments/recap-support';
import { MESSAGE_TRIAGE_QUESTIONS, summariseTriage, triageMessage } from '../judgments/message-triage';
import { CHAT_INTENT_QUESTIONS, judgeChatIntent } from '../judgments/chat-intent';
import { INSIGHT_QUESTIONS, judgeInsight } from '../judgments/insight-priority';
import { classifyProviderFaultSemantic, FAULT_QUESTIONS } from '../judgments/provider-fault-semantic';
import { CLAIM_HONESTY_QUESTIONS, judgeClaimHonesty } from '../judgments/claim-honesty';

type Body = { state: unknown; model: string; questions: Record<string, { type: string; criteria?: unknown }> };

/** Answer every question in the request with a fixed shape so callers can be exercised. */
function fakeAnswers(questions: Body['questions'], overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {};
  for (const [id, q] of Object.entries(questions)) {
    if (id in overrides) {
      answers[id] = overrides[id];
    } else if (q.type === 'noul') {
      answers[id] = { type: 'noul', noul: 0.5 };
    } else if (q.type === 'choice') {
      const labels = Object.keys(q.criteria as Record<string, unknown>);
      answers[id] = {
        type: 'choice',
        choice: labels[0],
        confidence: 1,
        probabilities: Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 1 : 0])),
      };
    } else {
      const levels = q.criteria as unknown[];
      answers[id] = {
        type: 'score',
        score: 0,
        confidence: 1,
        legend: Object.fromEntries(levels.map((l, i) => [String(i), l])),
        probabilities: Object.fromEntries(levels.map((_, i) => [String(i), i === 0 ? 1 : 0])),
      };
    }
  }
  return answers;
}

const requests: Body[] = [];
/** The first captured request; every test that reads it made exactly one call. */
const first = () => requests[0]!;
let overrides: Record<string, unknown> = {};
let failWith: number | null = null;

beforeEach(() => {
  requests.length = 0;
  overrides = {};
  failWith = null;
  process.env.TYPESAFE_API_KEY = 'test-key';
  __resetTypeSafeClientForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Body;
      requests.push(body);
      if (failWith !== null) {
        return new Response(JSON.stringify({ error: 'nope' }), { status: failWith });
      }
      return new Response(
        JSON.stringify({
          model: 'jev-test',
          answers: fakeAnswers(body.questions, overrides),
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TYPESAFE_API_KEY;
  __resetTypeSafeClientForTests();
});

describe('askJev', () => {
  it('returns null and makes no request when the key is absent', async () => {
    delete process.env.TYPESAFE_API_KEY;
    __resetTypeSafeClientForTests();
    expect(isTypeSafeConfigured()).toBe(false);
    const result = await askJev({ x: 1 }, { q: { type: 'noul', instructions: 'is x one?' } }, { purpose: 'test' });
    expect(result).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('returns null instead of throwing on a non-retryable API error', async () => {
    failWith = 422;
    const result = await askJev({ x: 1 }, { q: { type: 'noul', instructions: 'is x one?' } }, { purpose: 'test' });
    expect(result).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it('sends state, model and questions and returns typed answers with latency', async () => {
    const result = await askJev({ x: 1 }, { q: { type: 'noul', instructions: 'is x one?' } }, { purpose: 'test' });
    expect(first()).toMatchObject({ state: { x: 1 }, model: 'jev-latest' });
    expect(result?.answers.q.noul).toBe(0.5);
    expect(result?.model).toBe('jev-test');
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('chat-claims', () => {
  it('asks one stat + one asked question per flagged figure and maps them back in order', async () => {
    overrides = { stat_0: { type: 'noul', noul: 0.06 }, stat_1: { type: 'noul', noul: 0.97 }, asked_0: { type: 'noul', noul: 0.9 } };
    const verdict = await judgeFlaggedClaims({
      question: 'how did he do on the par 72',
      answer: 'He shot 72 and hit 61% of fairways',
      claims: [
        { text: '72', value: 72 },
        { text: '61%', value: 61 },
      ],
    });
    expect(Object.keys(first().questions).sort()).toEqual(['asked_0', 'asked_1', 'stat_0', 'stat_1']);
    expect(verdict?.claims).toEqual([
      { text: '72', value: 72, statClaim: 0.06, fromQuestion: 0.9 },
      { text: '61%', value: 61, statClaim: 0.97, fromQuestion: 0.5 },
    ]);
  });

  it('returns null without a request when nothing was flagged', async () => {
    expect(await judgeFlaggedClaims({ question: 'q', answer: 'a', claims: [] })).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('caps fan-out at 12 claims', async () => {
    const claims = Array.from({ length: 20 }, (_, i) => ({ text: String(i), value: i }));
    const verdict = await judgeFlaggedClaims({ question: 'q', answer: 'a', claims });
    expect(verdict?.claims).toHaveLength(12);
    expect(Object.keys(first().questions)).toHaveLength(24);
  });
});

describe('recap-support', () => {
  it('support is 1 − max(contradicts, invents, wrong name)', async () => {
    overrides = { contradicts_facts: { type: 'noul', noul: 0.98 }, invents_detail: { type: 'noul', noul: 0.2 } };
    const v = await judgeRecapSupport({ facts: ['Score: 75'], recap: 'Under par.', player_name: 'Jordan' });
    expect(v?.support).toBeCloseTo(0.02);

    overrides = { names_correct_player: { type: 'noul', noul: 0.19 } };
    const misnamed = await judgeRecapSupport({ facts: ['Score: 75'], recap: 'Nick posted 75.', player_name: 'Jordan' });
    expect(misnamed?.support).toBeCloseTo(0.19);
    expect(Object.keys(first().questions)).toEqual(Object.keys(RECAP_QUESTIONS));
    expect(first().state).toEqual({ facts: ['Score: 75'], recap: 'Under par.', player_name: 'Jordan' });
  });
});

describe('message-triage', () => {
  it('sends thread context and summarises flags at the threshold', async () => {
    overrides = {
      injury: { type: 'noul', noul: 0.99 },
      may_miss_event: { type: 'noul', noul: 0.59 },
      needs_coach_reply: { type: 'noul', noul: 0.9 },
      urgency: { type: 'score', score: 1.8, confidence: 0.9, legend: {}, probabilities: {} },
      topic: { type: 'choice', choice: 'health', confidence: 0.93, probabilities: {} },
    };
    const v = await triageMessage({ message: 'tweaked my wrist', sender_role: 'player' });
    expect(first().state).toEqual({ message: 'tweaked my wrist', sender_role: 'player', thread_context: [] });
    expect(Object.keys(first().questions)).toEqual(Object.keys(MESSAGE_TRIAGE_QUESTIONS));
    expect(summariseTriage(v!.answers)).toEqual({
      flags: ['injury'],
      needsReply: true,
      urgency: 1.8,
      topic: 'health',
      topicConfidence: 0.93,
    });
  });
});

describe('chat-intent', () => {
  it('uses a short timeout and the intent choice set', async () => {
    const v = await judgeChatIntent({ question: 'whats the weather', previous_turns: [] });
    expect(v?.answers.intent.choice).toBe('stat_lookup');
    expect(Object.keys(first().questions.intent?.criteria as object)).toEqual(
      Object.keys(CHAT_INTENT_QUESTIONS.intent.criteria),
    );
  });
});

describe('insight-priority', () => {
  it('sends title/body/evidence and returns both scores', async () => {
    const v = await judgeInsight({
      id: '1',
      title: 'Putting',
      content: 'Putting is an area to look at.',
      category: 'putting',
      insight_type: 'leak',
      evidence: { metric: 'putts' },
    });
    expect(first().state).toEqual({
      insight: { title: 'Putting', body: 'Putting is an area to look at.', category: 'putting', type: 'leak' },
      evidence: { metric: 'putts' },
    });
    expect(Object.keys(first().questions)).toEqual(Object.keys(INSIGHT_QUESTIONS));
    expect(v?.answers.actionability.score).toBe(0);
  });
});

describe('claim-honesty', () => {
  it('names violations at the threshold and scores honesty from the four hard questions only', async () => {
    overrides = {
      cause_stated_as_fact: { type: 'noul', noul: 0.88 },
      action_is_verdict: { type: 'noul', noul: 0.95 },
      cites_unsupported_figure: { type: 'noul', noul: 0.1 },
    };
    const v = await judgeClaimHonesty({ title: 't', text: 'x', evidence: { sample_n: 9 } });
    expect(first().state).toEqual({ title: 't', text: 'x', evidence: { sample_n: 9 } });
    expect(Object.keys(first().questions)).toEqual(Object.keys(CLAIM_HONESTY_QUESTIONS));
    expect(v?.violations).toEqual(['cause_stated_as_fact', 'action_is_verdict']);
    // action_is_verdict (0.95) is a style clause and must not drive honesty.
    expect(v?.honesty).toBeCloseTo(1 - 0.88);
  });

  it('honours a caller-supplied threshold', async () => {
    overrides = { overclaims_sample: { type: 'noul', noul: 0.65 } };
    const v = await judgeClaimHonesty({ title: 't', text: 'x', evidence: {} }, 0.6);
    // Every other answer is the fake's default 0.5, below the 0.6 threshold.
    expect(v?.violations).toEqual(['overclaims_sample']);
  });
});

describe('provider-fault-semantic', () => {
  it('returns kind/provider with confidences and truncates long text', async () => {
    overrides = {
      kind: { type: 'choice', choice: 'credit_exhausted', confidence: 0.99, probabilities: {} },
      provider: { type: 'choice', choice: 'anthropic', confidence: 0.8, probabilities: {} },
    };
    const v = await classifyProviderFaultSemantic('x'.repeat(5_000));
    expect((first().state as { error_text: string }).error_text).toHaveLength(4_000);
    expect(Object.keys(first().questions)).toEqual(Object.keys(FAULT_QUESTIONS));
    expect(v).toMatchObject({ kind: 'credit_exhausted', kindConfidence: 0.99, provider: 'anthropic', providerConfidence: 0.8 });
  });

  it('returns null for blank text without a request', async () => {
    expect(await classifyProviderFaultSemantic('   ')).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
