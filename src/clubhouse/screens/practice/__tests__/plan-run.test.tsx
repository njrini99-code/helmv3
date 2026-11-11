import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';
import { currentBlockIndex, PlanRun, restOfPractice, runWindowOpen, shiftBody } from '../PlanRun';

const save = vi.fn();
const publish = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: (...a: unknown[]) => save(...a) }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: (...a: unknown[]) => publish(...a) }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));

const body = PP_PLAN_PART.draft.body;
const MIN = 60_000;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  save.mockReset().mockResolvedValue({ success: true, version: 4 });
  publish.mockReset().mockResolvedValue({ success: true });
});

describe('the Run window', () => {
  const start = new Date('2026-11-05T19:00:00Z');
  it('opens 15 minutes before and closes at the end', () => {
    expect(runWindowOpen(start.getTime() - 16 * MIN, start, 60)).toBe(false);
    expect(runWindowOpen(start.getTime() - 15 * MIN, start, 60)).toBe(true);
    expect(runWindowOpen(start.getTime() + 60 * MIN, start, 60)).toBe(true);
    expect(runWindowOpen(start.getTime() + 61 * MIN, start, 60)).toBe(false);
  });
  it('finds the block under way, and holds at the first before it starts', () => {
    expect(currentBlockIndex(body, start, start.getTime() - MIN)).toBe(0);
    expect(currentBlockIndex(body, start, start.getTime() + 35 * MIN)).toBe(1);
  });
  it('moves only the block under way, so everything after it shifts', () => {
    const next = shiftBody(body, 0, 5);
    expect(next.variants.main.blocks[0]!.len).toBe(body.variants.main.blocks[0]!.len + 5);
    expect(next.variants.main.blocks[1]!.len).toBe(body.variants.main.blocks[1]!.len);
  });
});

describe('the rest of practice', () => {
  const start = new Date('2026-11-05T19:00:00Z');
  const clock = (d: Date) => d.toISOString().slice(11, 16);
  it('lists every block after the one under way, each at its own start', () => {
    const rest = restOfPractice(body, start, 0, clock);
    expect(rest.map((r) => r.title)).toEqual(body.variants.main.blocks.slice(1).map((b) => b.title));
    expect(rest[0]).toMatchObject({ time: '19:30', line: '3 stations · 60 min' });
    expect(rest[1]!.time).toBe('20:30');
  });
  it('a block named for where it is says so once, and the last block leaves nothing', () => {
    expect(restOfPractice(body, start, 0, clock).find((r) => r.title === 'Holes 1 to 6')!.line).toBe('60 min');
    expect(restOfPractice(body, start, body.variants.main.blocks.length - 1, clock)).toEqual([]);
  });
});

describe('PlanRun', () => {
  const now = Date.now();
  const props = { planId: 'p1', title: 'Plan', version: 3, body, zone: 'America/New_York', serverNow: now };
  it('draws nothing outside its window', () => {
    const { container } = render(<PlanRun {...props} start={new Date(now + 3 * 60 * MIN)} />);
    expect(container.querySelector('.ch-prc-run')).toBeNull();
  });
  it('says where each group is now and next', () => {
    render(<PlanRun {...props} start={new Date(now - 35 * MIN)} />);
    expect(screen.getAllByText(/^Now, until /).length).toBeGreaterThan(0);
    // One clock a row: the next stop starts as this one ends, so Next carries no time of its own unless there is a gap.
    expect(screen.getAllByText('Next').length).toBeGreaterThan(0);
    for (const row of document.querySelectorAll('.ch-prc-run li')) {
      const clocks = row.textContent?.match(/\d{1,2}:\d{2}/g) ?? [];
      expect(new Set(clocks).size).toBe(clocks.length);
    }
    expect(screen.getByText(/^Rotate in \d+ min$/)).toBeTruthy(); // 35 minutes in: the putting rotation
  });
  it('draws what is left beside Now: the blocks after this one, and when practice ends', () => {
    render(<PlanRun {...props} start={new Date(now - 35 * MIN)} />);
    const rest = screen.getByRole('group', { name: 'Up next' });
    expect([...rest.querySelectorAll('li b')].map((b) => b.textContent)).toEqual(['Move', 'Holes 1 to 6', 'Pressure finish', 'Wrap']);
    expect(rest.textContent).toMatch(/Ends \d{1,2}:\d{2}/);
    expect(rest.textContent).not.toContain('Putting rotation');
  });
  it('says so on the last block instead of drawing an empty list', () => {
    render(<PlanRun {...props} start={new Date(now - 178 * MIN)} />);
    expect(screen.getByText('This is the last block.')).toBeTruthy();
  });
  it('saves and republishes in one step, quietly unless the coach says to tell players', async () => {
    render(<PlanRun {...props} start={new Date(now - 35 * MIN)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Shift the rest 5 min later' }));
    expect(screen.getByRole('switch', { name: 'Tell players', hidden: true })).toHaveProperty('checked', false);
    fireEvent.click(screen.getByRole('button', { name: 'Move', hidden: true }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith({ planId: 'p1', expectedVersion: 4, notify: 'none' }));
    expect(save.mock.calls[0]![0]).toMatchObject({ planId: 'p1', expectedVersion: 3, step: 'blocks' });
  });
  it('leaves the published plan alone when the save fails', async () => {
    save.mockResolvedValue({ success: false, error: 'Someone else changed this plan.' });
    render(<PlanRun {...props} start={new Date(now - 35 * MIN)} />);
    fireEvent.click(screen.getByRole('button', { name: '5 min earlier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move', hidden: true }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(publish).not.toHaveBeenCalled();
  });
});
