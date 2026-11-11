import { describe, expect, it } from 'vitest';
import {
  CHAT_ERROR_CONVERSATION_GONE,
  CHAT_ERROR_EMPTY,
  CHAT_ERROR_GENERIC,
  CHAT_ERROR_HELM_OFF,
  CHAT_ERROR_NOT_A_COACH,
  CHAT_ERROR_RATE_LIMIT,
  CHAT_ERROR_SIGNED_OUT,
  describeChatError,
} from '../error-message';

/**
 * What the thread says when a turn fails, from the two kinds of error the chat hook produces: a refused request (a
 * status and the response body, `useCoachHelmChat`'s `refusal`) and a sentence the server streamed as an `error` event.
 */
const refused = (statusCode: number, body: unknown) => Object.assign(new Error('refused'), { statusCode, responseBody: typeof body === 'string' ? body : JSON.stringify(body) });

describe('describeChatError', () => {
  it('a budget refusal is shown in the server’s words and is not retryable', () => {
    const message = 'You have reached today’s analysis limit for your program. It resets tomorrow.';
    expect(describeChatError(refused(429, { error: message, reason: 'budget_gated' }))).toEqual({ message, recovery: 'none' });
  });

  it('a plain rate limit asks the coach to wait', () => {
    expect(describeChatError(refused(429, { error: 'Too many requests. Please slow down.' }))).toEqual({ message: CHAT_ERROR_RATE_LIMIT, recovery: 'retry' });
  });

  it('a conversation that is gone offers a new chat', () => {
    expect(describeChatError(refused(404, { error: 'Conversation not found' }))).toEqual({ message: CHAT_ERROR_CONVERSATION_GONE, recovery: 'new-chat' });
  });

  it('a signed-out session, a non-coach and CoachHelm switched off each get their own sentence', () => {
    expect(describeChatError(refused(401, { error: 'Not signed in' })).message).toBe(CHAT_ERROR_SIGNED_OUT);
    expect(describeChatError(refused(403, { error: 'Ask CoachHelm is for coaches.' }))).toEqual({ message: CHAT_ERROR_NOT_A_COACH, recovery: 'none' });
    expect(describeChatError(refused(403, { error: 'CoachHelm is off for your team.' }))).toEqual({ message: CHAT_ERROR_HELM_OFF, recovery: 'none' });
  });

  it('a server failure never shows its body', () => {
    expect(describeChatError(refused(500, '<html>stack trace</html>'))).toEqual({ message: CHAT_ERROR_GENERIC, recovery: 'retry' });
  });

  it('a sentence the server streamed is shown as written', () => {
    expect(describeChatError(new Error('The model quota is exhausted.'))).toEqual({ message: 'The model quota is exhausted.', recovery: 'retry' });
  });

  it('a dropped connection and a stream that ended early read as a failure to retry, never as raw text', () => {
    expect(describeChatError(new TypeError('Failed to fetch'))).toEqual({ message: CHAT_ERROR_GENERIC, recovery: 'retry' });
    expect(describeChatError(new Error(''))).toEqual({ message: CHAT_ERROR_EMPTY, recovery: 'retry' });
    expect(describeChatError(undefined)).toEqual({ message: CHAT_ERROR_EMPTY, recovery: 'retry' });
  });
});
