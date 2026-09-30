import { describe, it, expect } from 'vitest';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
  CHAT_ERROR_CONVERSATION_GONE,
  CHAT_ERROR_EMPTY,
  CHAT_ERROR_GENERIC,
  CHAT_ERROR_NOT_A_COACH,
  CHAT_ERROR_RATE_LIMIT,
  CHAT_ERROR_SIGNED_OUT,
  describeChatError,
} from '../data/coachhelm-chat-error';

/**
 * The failure this guards against, concretely: the stream route answers a
 * refused request with a status and a JSON body, the AI SDK makes that body the
 * error's `message`, and the chat printed it —
 *
 *     {"error":"Too many requests. Please slow down."}
 *
 * — to a coach, under a component comment claiming the server's sentence was
 * shown. Nothing tested it, because every chat test stubs `useChat` and so never
 * sees what the real transport throws.
 *
 * So these tests drive the REAL `DefaultChatTransport` against a stub `fetch`
 * that answers like the route does, and hand whatever it throws to the mapper.
 */

const USER_TURN: UIMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is the team putting?' }] }];

/** What the SDK throws for a request the route refused. */
async function thrownFor(status: number, body: unknown, raw = false): Promise<unknown> {
  // `src/types/ai-shim.d.ts` does not declare `sendMessages`; the real class does.
  const transport = new DefaultChatTransport({
    api: '/api/coachhelm/v3/chat/stream',
    fetch: async () =>
      new Response(raw ? String(body) : JSON.stringify(body), {
        status,
        headers: { 'content-type': raw ? 'text/html' : 'application/json' },
      }),
  }) as unknown as { sendMessages: (options: Record<string, unknown>) => Promise<unknown> };
  try {
    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: USER_TURN,
      abortSignal: undefined,
    });
  } catch (error) {
    return error;
  }
  throw new Error('the transport did not throw for a non-2xx response');
}

describe('Ask CoachHelm: what a failed request says (a copy of the PR 2105 mapping)', () => {
  it('starts from the problem: the real SDK error carries the raw JSON body as its message', async () => {
    const error = (await thrownFor(429, { error: 'Too many requests. Please slow down.' })) as Error;
    // This is what `chat.error.message` was rendered as, verbatim.
    expect(error.message).toBe('{"error":"Too many requests. Please slow down."}');
  });

  it('a rate limit reads as a sentence, and Try again is offered', async () => {
    const notice = describeChatError(await thrownFor(429, { error: 'Too many requests. Please slow down.' }));
    expect(notice).toEqual({ message: CHAT_ERROR_RATE_LIMIT, recovery: 'retry' });
    expect(notice.message).toBe("You're asking quickly. Wait a moment, then try again.");
  });

  it.each([
    ['gated', 'You have reached today’s analysis limit for your program. It resets tomorrow.'],
    ['budget_disabled', 'AI analysis is switched off for your program. An administrator can turn it on in coaching settings.'],
    [
      'budget_unresolved',
      'CoachHelm could not verify your program’s analysis settings. Contact support — this is not something waiting will fix.',
    ],
  ])('a %s budget refusal keeps the server\'s own sentence, with no button that cannot work', async (reason, sentence) => {
    const notice = describeChatError(await thrownFor(429, { error: sentence, reason }));
    expect(notice).toEqual({ message: sentence, recovery: 'none' });
  });

  it('a conversation that is gone says so, and offers a new chat instead of a retry that would 404 again', async () => {
    const notice = describeChatError(await thrownFor(404, { error: 'Conversation not found' }));
    expect(notice).toEqual({ message: CHAT_ERROR_CONVERSATION_GONE, recovery: 'new-chat' });
    expect(notice.message).toBe("That conversation isn't available. Start a new chat.");
  });

  it('a 404 that is NOT a lost conversation does not tell the coach to start a new chat', async () => {
    // `resolveCoachChatContext` answers 404 for "No active team for this coach".
    const notice = describeChatError(await thrownFor(404, { error: 'No active team for this coach' }));
    expect(notice.message).toBe(CHAT_ERROR_GENERIC);
    expect(notice.message).not.toMatch(/new chat/i);
  });

  it('a signed-out request says the session ended', async () => {
    const notice = describeChatError(await thrownFor(401, { error: 'Not signed in' }));
    expect(notice).toEqual({ message: CHAT_ERROR_SIGNED_OUT, recovery: 'retry' });
    expect(notice.message).toBe('Your session ended. Sign in again, then retry.');
  });

  it('a non-coach is told the surface is for coaches, with nothing to retry', async () => {
    const notice = describeChatError(await thrownFor(403, { error: 'This surface is for coaches' }));
    expect(notice).toEqual({ message: CHAT_ERROR_NOT_A_COACH, recovery: 'none' });
    expect(notice.message).toBe('Ask CoachHelm is for coaches.');
  });

  it.each([
    [400, { error: 'Bad request' }],
    [500, { error: 'Internal error' }],
  ])('a %i reads as the generic sentence', async (status, body) => {
    const notice = describeChatError(await thrownFor(status, body));
    expect(notice).toEqual({ message: CHAT_ERROR_GENERIC, recovery: 'retry' });
    expect(notice.message).toBe('Something went wrong while answering. Try again.');
  });

  it('a proxy\'s HTML error page never reaches the coach', async () => {
    const notice = describeChatError(
      await thrownFor(504, '<html><body>FUNCTION_INVOCATION_TIMEOUT</body></html>', true),
    );
    expect(notice.message).toBe(CHAT_ERROR_GENERIC);
  });

  it('an unparseable 429 body is still a rate limit, not a crash', async () => {
    const notice = describeChatError(await thrownFor(429, 'not json', true));
    expect(notice.message).toBe(CHAT_ERROR_RATE_LIMIT);
  });

  it.each([
    'AI features are unavailable: the Anthropic account is out of credit. Retrying will not help until it is topped up.',
    'Something went wrong while answering. Please try again.',
  ])('a stream fault keeps the server\'s provider sentence: %s', (sentence) => {
    // The SDK raises `new Error(chunk.errorText)` for an in-stream error chunk:
    // no status code, so it is not a refusal.
    expect(describeChatError(new Error(sentence))).toEqual({ message: sentence, recovery: 'retry' });
  });

  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'a dropped connection (%s) never shows the browser\'s own wording',
    (text) => {
      expect(describeChatError(new TypeError(text)).message).toBe(CHAT_ERROR_GENERIC);
    },
  );

  it('an error with no text falls back to the old generic line', () => {
    expect(describeChatError(new Error('  ')).message).toBe(CHAT_ERROR_EMPTY);
    expect(describeChatError(undefined).message).toBe(CHAT_ERROR_EMPTY);
  });

  it('never returns a JSON body, whatever wraps it', () => {
    expect(describeChatError(new Error('{"error":"Too many requests. Please slow down."}')).message).toBe(
      CHAT_ERROR_GENERIC,
    );
  });
});
