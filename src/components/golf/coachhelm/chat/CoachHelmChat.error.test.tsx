// @vitest-environment jsdom
/**
 * ============================================================================
 * CoachHelmChat — the notice under a failed answer
 * ----------------------------------------------------------------------------
 * A refused request (rate limit, daily budget, lost conversation, auth) reaches
 * `useChat` as an error whose `message` is the response's raw JSON body. The
 * notice used to print `error.message` as it stood, so a coach read
 * `{"error":"Too many requests. Please slow down."}`.
 *
 * Stubs only `useChat` (the network boundary), as `AskSurface.pending-question`
 * and `chat-approval-delivery` do; the mapping, the notice and the retry wiring
 * are the real code. `ChatThread` is stubbed for the reason given in
 * `AskSurface.pending-question.test.tsx`: it drags in the chart library and is
 * not what this file asserts.
 * ========================================================================== */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const regenerateSpy = vi.fn();
const setMessagesSpy = vi.fn();
const clearErrorSpy = vi.fn();
let currentError: Error | undefined;

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is the team putting?' }] }],
    status: currentError ? 'error' : 'ready',
    error: currentError,
    sendMessage: vi.fn(),
    regenerate: regenerateSpy,
    stop: vi.fn(),
    setMessages: setMessagesSpy,
    clearError: clearErrorSpy,
    addToolApprovalResponse: vi.fn(),
  }),
}));

vi.mock('./ChatThread', () => ({ ChatThread: () => null }));

/** What the AI SDK throws for a refused request: the raw body IS the message. */
function refusal(status: number, body: Record<string, unknown>): Error {
  const responseBody = JSON.stringify(body);
  return Object.assign(new Error(responseBody), { statusCode: status, responseBody });
}

async function renderChat() {
  const { CoachHelmChat } = await import('./CoachHelmChat');
  return render(<CoachHelmChat players={[]} />);
}

describe('CoachHelmChat — a failed answer', () => {
  beforeEach(() => {
    regenerateSpy.mockClear();
    setMessagesSpy.mockClear();
    clearErrorSpy.mockClear();
    currentError = undefined;
    // jsdom has no `Element.scrollTo`; the thread follows the stream with it.
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('a rate limit reads as a sentence, never as JSON', async () => {
    currentError = refusal(429, { error: 'Too many requests. Please slow down.' });
    await renderChat();

    expect(screen.getByText("You're asking quickly. Wait a moment, then try again.")).toBeTruthy();
    expect(screen.queryByText(/\{"error"/)).toBeNull();
  });

  it('Try again is offered on a rate limit and re-runs the turn', async () => {
    currentError = refusal(429, { error: 'Too many requests. Please slow down.' });
    await renderChat();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });

  it('a budget refusal shows the server\'s own sentence and no Try again that cannot work', async () => {
    currentError = refusal(429, {
      error: 'You have reached today’s analysis limit for your program. It resets tomorrow.',
      reason: 'budget_gated',
    });
    await renderChat();

    expect(screen.getByText('You have reached today’s analysis limit for your program. It resets tomorrow.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a lost conversation offers a new chat, and pressing it resets the thread and clears the error', async () => {
    currentError = refusal(404, { error: 'Conversation not found' });
    await renderChat();

    expect(screen.getByText("That conversation isn't available. Start a new chat.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat' }));
    expect(setMessagesSpy).toHaveBeenCalledWith([]);
    expect(clearErrorSpy).toHaveBeenCalledTimes(1);
    expect(regenerateSpy).not.toHaveBeenCalled();
  });

  it.each([
    [401, { error: 'Not signed in' }, 'Your session ended. Sign in again, then retry.'],
    [403, { error: 'This surface is for coaches' }, 'Ask CoachHelm is for coaches.'],
    [400, { error: 'Bad request' }, 'Something went wrong while answering. Try again.'],
    [500, { error: 'Internal error' }, 'Something went wrong while answering. Try again.'],
  ])('a %i reads as its sentence', async (status, body, sentence) => {
    currentError = refusal(status, body);
    await renderChat();

    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.queryByText(/\{"error"/)).toBeNull();
  });

  it('a stream fault keeps the server\'s provider sentence and can be retried', async () => {
    const sentence = 'AI features are unavailable: the Anthropic account is out of credit. Retrying will not help until it is topped up.';
    currentError = new Error(sentence);
    await renderChat();

    expect(screen.getByText(sentence)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });
});
