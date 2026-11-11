// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capTask } from '../../../../../preview/fixtures-chat-capabilities';
import { ApproveAll, batchPlan, type WaitingCard } from '..';

afterEach(cleanup);

const card = (tool: string, over: Partial<WaitingCard> = {}): WaitingCard => {
  const cap = capTask(tool)!;
  return { key: tool, tool, proposal: cap.proposal, ...over };
};
const FOUR = [card('create_event'), card('create_team_announcement'), card('create_goal'), card('lock_lineup')];

describe('approve all · which cards it may confirm together', () => {
  it('never includes a card that cannot be undone: a lineup lock is confirmed on its own', () => {
    const plan = batchPlan(FOUR);
    expect(plan.go.map((g) => g.key)).toEqual(['create_event', 'create_team_announcement', 'create_goal']);
    expect(plan.left).toEqual([{ key: 'lock_lineup', head: expect.any(String), why: 'no_undo' }]);
  });

  it('leaves out a card with a detail missing and a card with an edit open, and says why', () => {
    const missing = card('create_event');
    const plan = batchPlan([{ ...missing, proposal: { ...missing.proposal, missing: ['Start time'] } }, card('create_team_announcement', { editing: true }), card('create_goal'), card('create_task')]);
    expect(plan.left.map((l) => l.why)).toEqual(['missing', 'editing']);
    expect(plan.go.map((g) => g.key)).toEqual(['create_goal', 'create_task']);
  });

  it('keeps the order the cards were proposed in, which is the order the server confirms them in', () => {
    expect(batchPlan([card('create_goal'), card('create_event')]).go.map((g) => g.key)).toEqual(['create_goal', 'create_event']);
  });

  it('counts each person once across the cards that send', () => {
    const a = card('create_team_announcement');
    const both = batchPlan([a, { ...a, key: 'again' }]);
    expect(both.people).toBe(batchPlan([a]).people);
    expect(both.says).toMatch(/^2 actions\. 2 send to \d+ (person|people)\.$/);
  });
});

describe('approve all · the bar', () => {
  it('is not drawn for one card: that is the card’s own Confirm', () => {
    const { container } = render(<ApproveAll cards={[card('create_event'), card('lock_lineup')]} />);
    expect(container.firstChild).toBeNull();
  });

  it('names what it will approve and what it leaves, and hands back only those keys', () => {
    const onApproveAll = vi.fn();
    render(<ApproveAll cards={FOUR} onApproveAll={onApproveAll} />);
    expect(screen.getByText('Approve 3 of 4 together')).toBeTruthy();
    expect(screen.getByText('Not included: it cannot be undone, so it is confirmed on its own.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve these 3' }));
    expect(onApproveAll).toHaveBeenCalledWith(['create_event', 'create_team_announcement', 'create_goal']);
  });

  it('holds all of them in one window with one Undo', () => {
    const onUndoAll = vi.fn();
    render(<ApproveAll cards={FOUR} phase="held" seconds={6} onUndoAll={onUndoAll} />);
    expect(screen.getByText('Not saved yet. All 3 save in 6 seconds.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo all 3' }));
    expect(onUndoAll).toHaveBeenCalledWith(['create_event', 'create_team_announcement', 'create_goal']);
  });

  it('says where a batch stopped and that the rest wait again', () => {
    render(<ApproveAll cards={FOUR} phase="stopped" stoppedAt={{ head: 'Team announcement', reopened: 1 }} />);
    expect(screen.getByText(/Stopped at “Team announcement”/)).toBeTruthy();
    expect(screen.getByText(/nothing after it was tried\. 1 card is waiting for you again\./)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
