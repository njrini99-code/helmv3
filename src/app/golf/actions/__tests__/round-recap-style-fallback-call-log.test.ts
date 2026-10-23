import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Bridge 1cd457e7 (2026-10-13): "round recap: model reply broke style limits
// (too_many_words); using template" fired 7 times in 24h, yet every one of
// those calls' golf_coachhelm_llm_calls rows said fallback_to_template=false
// (e.g. call 5424a44e, 2026-10-13 22:40Z). compose() logs the call as a
// verified LLM success BEFORE round-recap's style check throws the reply
// away, so the call log (and the Bridge's AI-availability read in
// src/lib/admin/data/ai-availability.ts) counted a template recap as a
// model recap. The style rejection must mark the call row as a fallback.
// ---------------------------------------------------------------------------

const { markCallFellBackMock, logServerEventMock } = vi.hoisted(() => ({
  markCallFellBackMock: vi.fn(async () => undefined),
  logServerEventMock: vi.fn(async () => undefined),
}));

const round = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Pinehurst No. 2',
  course_city: null,
  course_state: null,
  round_date: '2026-06-01',
  round_type: 'practice',
  total_score: 72,
  score_to_par: 0,
  total_putts: 31,
  total_fairways: 14,
  total_fairways_hit: 9,
  total_gir: 10,
  total_gir_possible: 18,
  holes_played: 18,
  front_nine: 36,
  back_nine: 36,
  status: 'completed',
  ai_recap: null,
  ai_recap_generated_at: null,
};

function chain(data: unknown) {
  const c: Record<string, unknown> = { data: null, error: null };
  for (const m of ['select', 'eq', 'limit']) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return c;
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') return chain(round);
  if (table === 'golf_players') return chain({ id: 'player-1', first_name: 'Sam' });
  return chain(null);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    rpc: vi.fn(async () => ({ data: { success: true }, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: logServerEventMock,
}));

// A 50-word, two-sentence reply: compose() accepted and logged it as an LLM
// success, and checkRecapStyle rejects it as too_many_words.
const LONG_REPLY =
  'Sam carded an even-par 72 at Pinehurst No. 2 with 31 putts, hitting 9 of 14 fairways and finding 10 greens in regulation across a steady and patient day on a demanding layout that rewards careful placement. ' +
  'Next time out, converting more of those greens into birdie chances should be the clear priority for the round.';

const composeMock = vi.fn(async (_req: { prompt: string }) => ({
  text: LONG_REPLY,
  used_llm: true,
  citations_verified: true,
  call_log_id: 'call-1',
  cost_usd: 0.001,
}));

vi.mock('@/lib/coachhelm/v3/llm/compose', () => ({
  compose: (req: { prompt: string }) => composeMock(req),
  markCallFellBackToTemplate: markCallFellBackMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/golf/recap-season-context', () => ({
  loadRecapSeasonContext: vi.fn(async () => null),
}));

import { generateRoundRecap } from '../round-recap';
import {
  countRecapWords,
  RECAP_MAX_WORDS,
  RECAP_SENTENCE_WORD_TARGETS,
  RECAP_SHORTEN_SENTENCE_WORD_TARGETS,
} from '@/lib/coachhelm/v3/llm/recap-style';

const SHORT_REPLY =
  'Sam shot an even-par 72 at Pinehurst No. 2 with 31 putts. Next round, turning 10 greens into more birdie looks is the clear opening.';

describe('generateRoundRecap — a style-rejected model reply is logged as a template fallback (1cd457e7)', () => {
  beforeEach(() => {
    markCallFellBackMock.mockClear();
    logServerEventMock.mockClear();
    // mockReset drops any unconsumed mockResolvedValueOnce queue, so one
    // test's replies can never leak into the next.
    composeMock.mockReset();
    composeMock.mockImplementation(async () => ({
      text: LONG_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-1',
      cost_usd: 0.001,
    }));
  });

  it('marks the call row fallback_to_template with the style violations', async () => {
    const result = await generateRoundRecap('round-1');

    // An over-long reply earns one rewrite pass (2026-10-20); this model
    // overshoots both times, so the player still gets the template.
    expect(composeMock).toHaveBeenCalledTimes(2);
    // The player gets the template, not the over-long model reply...
    expect(result.recap).not.toBe(LONG_REPLY);
    expect(logServerEventMock).toHaveBeenCalledWith(
      expect.stringContaining('broke style limits'),
      expect.objectContaining({ action: 'generateRoundRecap.style' }),
    );
    // ...and the call log must say so, for both discarded replies.
    expect(markCallFellBackMock).toHaveBeenCalledTimes(2);
    expect(markCallFellBackMock).toHaveBeenCalledWith('call-1', {
      reason: 'style_violation',
      violations: expect.arrayContaining(['too_many_words']),
    });
  });

  it('a reply that only ran long gets one rewrite pass, and a compliant rewrite reaches the player (1cd457e7, 2026-10-20)', async () => {
    composeMock.mockResolvedValueOnce({
      text: LONG_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-long',
      cost_usd: 0.001,
    });
    composeMock.mockResolvedValueOnce({
      text: SHORT_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-short',
      cost_usd: 0.001,
    });

    const result = await generateRoundRecap('round-1');

    expect(composeMock).toHaveBeenCalledTimes(2);
    expect(result.recap).toBe(SHORT_REPLY);
    // Only the discarded first draft is marked; the rewrite was used.
    expect(markCallFellBackMock).toHaveBeenCalledTimes(1);
    expect(markCallFellBackMock).toHaveBeenCalledWith('call-long', {
      reason: 'style_violation',
      violations: ['too_many_words'],
    });
    expect(logServerEventMock).not.toHaveBeenCalledWith(
      expect.stringContaining('broke style limits'),
      expect.anything(),
    );
  });

  it('asks for a short cap on each sentence instead of one total the model has to count (JAVASCRIPT-NEXTJS-15A)', async () => {
    composeMock.mockResolvedValueOnce({
      text: SHORT_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-ok',
      cost_usd: 0.001,
    });

    await generateRoundRecap('round-1');

    const firstPrompt = composeMock.mock.calls[0]?.[0].prompt;
    const [firstCap, secondCap] = RECAP_SENTENCE_WORD_TARGETS;
    expect(firstPrompt).toContain(`the first ${firstCap} words or fewer, the second ${secondCap} words or fewer`);
    expect(firstPrompt).not.toContain(`${RECAP_MAX_WORDS} words or fewer in total`);
  });

  it('the rewrite pass tells the model how long its draft ran and hands the draft back (JAVASCRIPT-NEXTJS-15A)', async () => {
    composeMock.mockResolvedValueOnce({
      text: LONG_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-long',
      cost_usd: 0.001,
    });
    composeMock.mockResolvedValueOnce({
      text: SHORT_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-short',
      cost_usd: 0.001,
    });

    await generateRoundRecap('round-1');

    expect(composeMock).toHaveBeenCalledTimes(2);
    const rewritePrompt = composeMock.mock.calls[1]?.[0].prompt;
    const [firstCap, secondCap] = RECAP_SHORTEN_SENTENCE_WORD_TARGETS;
    expect(rewritePrompt).toContain(`is ${countRecapWords(LONG_REPLY)} words, over the ${RECAP_MAX_WORDS}-word limit`);
    expect(rewritePrompt).toContain(`first sentence ${firstCap} words or fewer and the second ${secondCap} words or fewer`);
    expect(rewritePrompt).toContain(LONG_REPLY);
  });

  it('a reply that breaks a limit other than length gets no rewrite pass', async () => {
    composeMock.mockResolvedValueOnce({
      text: 'Sam shot an even-par 72 at Pinehurst No. 2 with 31 putts — steady work. Next round, more birdie looks.',
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-dash',
      cost_usd: 0.001,
    });

    const result = await generateRoundRecap('round-1');

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(result.recap).not.toContain('—');
    expect(markCallFellBackMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the call log when the model reply meets the style limits', async () => {
    composeMock.mockResolvedValueOnce({
      text: SHORT_REPLY,
      used_llm: true,
      citations_verified: true,
      call_log_id: 'call-2',
      cost_usd: 0.001,
    });

    await generateRoundRecap('round-1');

    expect(markCallFellBackMock).not.toHaveBeenCalled();
  });
});
