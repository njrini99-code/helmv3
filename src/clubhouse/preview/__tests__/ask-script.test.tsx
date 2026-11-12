import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { pendingDecisionKeys, type ChatUIPart } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { ASK_SCRIPT_NAMES, askScript, installScriptedChat, partsOfScript, SCRIPTED_CHAT_ENDPOINT, SCRIPTED_HOLD_MS, taskScript } from '../ask-script';
import { ASK_PROPOSAL, ASK_RECEIPT_DONE } from '../fixtures-ask-thread';

/** The harness is only worth having if it drives the REAL hook: these play scripts through `useCoachHelmChat` and its reducer. */
describe('the scripted-turn harness', () => {
  let restore: () => void = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    restore();
    cleanup();
    vi.useRealTimers();
  });
  const play = (name: string, opts: { until?: number } = {}) => {
    restore = installScriptedChat(askScript(name, 'fast'), opts);
    return renderHook(() => useCoachHelmChat({ endpoint: SCRIPTED_CHAT_ENDPOINT }));
  };
  const run = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const partsOf = (r: { current: ReturnType<typeof useCoachHelmChat> }): ChatUIPart[] => (r.current.messages[r.current.messages.length - 1]?.parts ?? []) as ChatUIPart[];

  it('every script exists at every pace and ends its first turn one way or another', () => {
    for (const name of ASK_SCRIPT_NAMES) {
      for (const pace of ['fast', 'real', 'worst'] as const) {
        const s = askScript(name, pace);
        const first = s.firstAttempt ?? s.turn;
        const ends = first.ending?.kind === 'refuse' || first.ending?.kind === 'cut' || first.events.some((e) => typeof e.event !== 'function' && e.event.type === 'done');
        expect(ends, `${name} at ${pace}`).toBe(true);
      }
    }
  });

  it('a read turn folds into the same parts the server would store: reads finished with their detail, evidence by ref, the words, the visual', async () => {
    const { result } = play('jonah');
    act(() => result.current.send('How is Jonah doing?'));
    expect(result.current.status).toBe('submitted');
    await run(5000);
    expect(result.current.status).toBe('ready');
    const parts = partsOf(result);
    const reads = parts.filter((p) => p.type === 'data-progress').map((p) => p.data as { state?: string; detail?: string });
    expect(reads).toHaveLength(4);
    expect(reads.every((r) => r.state === 'done')).toBe(true);
    expect(reads[0]?.detail).toBe('8 rounds');
    expect(parts.filter((p) => p.type === 'data-evidence').map((p) => (p.data as { ref?: string }).ref)).toEqual(['e1', 'e2']);
    expect(parts.some((p) => p.type === 'data-visual-composition')).toBe(true);
    expect(parts.filter((p) => p.type === 'text').map((p) => String(p.text)).join(' ')).toContain('[e2]');
  });

  it('a still frame: events after `until` never arrive and the turn stays live', async () => {
    const { result } = play('jonah', { until: 300 });
    act(() => result.current.send('How is Jonah doing?'));
    await run(5000);
    expect(result.current.busy).toBe(true);
    expect(partsOf(result).filter((p) => p.type === 'text')).toHaveLength(0);
  });

  it('a task: the card waits, Confirm is answered with a held receipt that carries the server\'s clock, and Undo is refused once it has run out', async () => {
    const { result } = play('task');
    act(() => result.current.send('Create a focus area'));
    await run(3000);
    const [key] = pendingDecisionKeys(result.current.messages[result.current.messages.length - 1]);
    expect(key).toBeTruthy();
    expect(result.current.busy).toBe(false);
    act(() => result.current.approve(key!));
    await run(1500);
    const held = partsOf(result).find((p) => p.type === 'data-action-receipt')?.data as { status: string; held_until: string };
    expect(held.status).toBe('held');
    const left = Date.parse(held.held_until) - Date.now();
    expect(left).toBeGreaterThan(SCRIPTED_HOLD_MS - 2500);
    expect(left).toBeLessThanOrEqual(SCRIPTED_HOLD_MS);
    // The card's own calls: not saved while held, saved after, and too late to undo then.
    const during = (await (await fetch(`/api/coachhelm/v3/chat/actions/${key}`)).json()) as { receipt: unknown };
    expect(during.receipt).toBeNull();
    await run(SCRIPTED_HOLD_MS);
    const after = (await (await fetch(`/api/coachhelm/v3/chat/actions/${key}`)).json()) as { receipt: { status: string } };
    expect(after.receipt.status).toBe('completed');
    expect((await fetch(`/api/coachhelm/v3/chat/actions/${key}`, { method: 'DELETE' })).status).toBe(409);
  });

  it('taskScript: any card, and the real result arrives on the Confirm\'s own stream under the held receipt\'s part id', async () => {
    const proposal = { ...ASK_PROPOSAL, idempotency_key: 'k-task-script', action: 'Create task', summary: 'Give Theo a task.' };
    const receipt = { ...ASK_RECEIPT_DONE, action: 'Create task', summary: 'Created a task for Theo.' };
    restore = installScriptedChat(taskScript({ question: 'Give Theo a task', lead: 'Here is the task.', proposal, receipt, pace: 'fast' }));
    const { result } = renderHook(() => useCoachHelmChat({ endpoint: SCRIPTED_CHAT_ENDPOINT }));
    act(() => result.current.send('Give Theo a task'));
    await run(3000);
    const [key] = pendingDecisionKeys(result.current.messages[result.current.messages.length - 1]);
    expect(key).toBe('k-task-script');
    act(() => result.current.approve(key!));
    await run(1200);
    const receipts = () => partsOf(result).filter((p) => p.type === 'data-action-receipt');
    expect((receipts()[0]?.data as { status: string }).status).toBe('held');
    expect(result.current.busy).toBe(true);
    await run(SCRIPTED_HOLD_MS + 500);
    // One receipt part, replaced in place: the card never sees two.
    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]?.data).toMatchObject({ status: 'completed', summary: 'Created a task for Theo.' });
    expect(result.current.busy).toBe(false);
  });

  it('failures reach the hook as they would from the server: a dropped stream, a failed model, a refusal', async () => {
    const lost = play('lost');
    act(() => lost.result.current.send('q'));
    await run(4000);
    expect(lost.result.current.status).toBe('error');
    // What arrived before the connection dropped is kept.
    expect(partsOf(lost.result).some((p) => p.type === 'text')).toBe(true);
    restore();
    cleanup();

    const model = play('model');
    act(() => model.result.current.send('q'));
    await run(4000);
    expect(model.result.current.status).toBe('error');
    expect(model.result.current.error?.message).toBe('Something went wrong while answering. What arrived is above.');
    restore();
    cleanup();

    const budget = play('budget');
    act(() => budget.result.current.send('q'));
    await run(500);
    expect(budget.result.current.status).toBe('error');
    expect((budget.result.current.error as { statusCode?: number }).statusCode).toBe(429);
  });

  it('a retry of a lost turn replaces what the failed attempt drew and ends ready', async () => {
    const { result } = play('retry');
    act(() => result.current.send('q'));
    await run(4000);
    expect(result.current.status).toBe('error');
    act(() => result.current.retry());
    await run(5000);
    expect(result.current.status).toBe('ready');
    expect(result.current.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('the player\'s script holds no card and nothing a coach alone may see', () => {
    const parts = partsOfScript(askScript('player', 'real'));
    expect(parts.some((p) => p.type === 'data-action-proposal' || p.type.startsWith('tool-'))).toBe(false);
    const text = JSON.stringify(askScript('player', 'real').turn.events.map((e) => (typeof e.event === 'function' ? null : e.event)));
    expect(text).not.toMatch(/Theo|Eli Brandt|ranking|team rank/i);
  });
});
