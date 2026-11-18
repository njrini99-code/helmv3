import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';

const prefs = vi.hoisted(() => ({ reduced: false, mode: 'full' }));
vi.mock('../../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => prefs.reduced, chMotionModeNow: () => prefs.mode }));
vi.mock('../../../../../shell/quick-chat/qc-seam', () => ({ useQcSeam: () => null }));
vi.mock('@/app/golf/actions/coachhelm-ask', () => ({ readQuickChatWeek: vi.fn(async () => null) }));
import { DraftVisual, DrillDraft, GoalDraft, LineupDraft, NoteDraft, QualDraft, TaskDraft, TripDraft, WeekDraft, drillRingPoints } from '../DraftVisual';

const trip: Extract<TaskVisual, { kind: 'trip' }> = { kind: 'trip', from: 'Campus', to: 'Hilltop', how: 'van', leave: '2026-11-08', back: null };
const goal: Extract<TaskVisual, { kind: 'goal' }> = { kind: 'goal', player: 'Eli', stat: 'Approach', target: -.5, days: 30 };
let animations: Array<{ cancel: ReturnType<typeof vi.fn> }>;
let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  prefs.reduced = false; prefs.mode = 'full'; animations = [];
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 1));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  animate = vi.fn(() => { const a = { cancel: vi.fn() }; animations.push(a); return a; });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (Element.prototype as unknown as { animate?: unknown }).animate; });
const tick = () => act(() => { vi.advanceTimersByTime(2); });

describe('honest draft figures', () => {
  it('shows no invented goal history or tolerance band', () => {
    const { container } = render(<GoalDraft visual={goal} />);
    expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('No round history');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.ch-ak-dv-band')).toBeNull();
  });
  it('draws only supplied history points and exact target', () => {
    const { container } = render(<GoalDraft visual={{ ...goal, history: [{ at: '2026-10-20', value: -1.2 }, { at: '2026-11-01', value: -.8 }] }} />);
    expect(container.querySelectorAll('.ch-ak-dv-point')).toHaveLength(2);
    expect(container.querySelector('.ch-ak-dv-target')).not.toBeNull();
    expect(container.querySelector('.ch-ak-dv-band')).toBeNull();
    expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('2026-10-20: −1.2');
  });
  it('does not infer consecutive qualifier dates', () => {
    render(<QualDraft visual={{ kind: 'qual', title: 'Fall', rounds: 3, start: '2026-11-08', total: 5, picks: 1, field: 7, deadline: null }} />);
    expect(screen.getAllByText('Date not set')).toHaveLength(2);
    expect(screen.queryByText('Nov 9')).toBeNull();
  });
  it('shows trip rooms and gear only when present', () => {
    const { container, rerender } = render(<TripDraft visual={trip} />);
    expect(container.querySelector('.ch-ak-dv-rooms')).toBeNull();
    expect(container.querySelector('.ch-ak-dv-gear')).toBeNull();
    rerender(<TripDraft visual={{ ...trip, rooms: 'Eli / Theo', gear: ['Rain jacket'] }} />);
    expect(screen.getByText('Eli / Theo')).toBeTruthy();
    expect(screen.getByText('Rain jacket')).toBeTruthy();
  });
  it('keeps overdue tasks overdue and omits unknown reminders', () => {
    const { container } = render(<TaskDraft visual={{ kind: 'task', title: 'Log putts', due: '2026-11-06', who: ['Eli'] }} today="2026-11-08" />);
    expect(screen.getByText('overdue')).toBeTruthy();
    expect(container.querySelector('.ch-ak-dv-reminder')).toBeNull();
  });
  it('pins only the requested recorded hole and preserves missing scores', () => {
    const { container } = render(<NoteDraft visual={{ kind: 'note', player: 'Eli', note: 'Hole 13: choose the safe side.', hole: 13, holes: [{ number: 12, par: 4, score: null }, { number: 13, par: 4, score: 6 }] }} />);
    expect(container.querySelectorAll('.ch-ak-dv-hole-bar')).toHaveLength(1);
    expect(container.querySelectorAll('.ch-ak-dv-pin')).toHaveLength(1);
    expect(screen.getByText('Hole 13 · par 4 · made 6')).toBeTruthy();
  });
  it('does not invent standings, ties, locks, or drill measurements', () => {
    const { container } = render(<><LineupDraft visual={{ kind: 'lineup', seats: [{ slot: 1, name: 'Eli', alternate: false }] }} /><DrillDraft visual={{ kind: 'drill', name: 'Gate drill', area: 'putting', minutes: 15, diagram: { kind: 'gate' } }} /></>);
    expect(container.querySelector('.ch-ak-dv-standing')).toBeNull();
    expect(container.querySelector('.ch-ak-dv-lock')).toBeNull();
    expect(container.querySelectorAll('.ch-ak-dv-drill circle.ch-ak-dv-ball')).toHaveLength(1); // schematic rolling ball only
    expect(screen.queryByText(/5 ft/)).toBeNull();
    expect(drillRingPoints(8)).toEqual(drillRingPoints(8));
    expect(drillRingPoints(Number.NaN)).toEqual([]);
    expect(drillRingPoints(8)).toHaveLength(8);
  });
  it('draws a message from the thread that was read, and omits a last line that was not', () => {
    const { rerender } = render(<DraftVisual visual={{ kind: 'msg', conversationId: 'c', thread: 'Varsity', count: 7, last: 'Are we doing dinner?', draft: 'Wednesday after practice.' }} />);
    expect(screen.getByText('Are we doing dinner?')).toBeTruthy();
    expect(screen.getByText('Wednesday after practice.')).toBeTruthy();
    expect(screen.getByText('Draft · only you can see this')).toBeTruthy();
    rerender(<DraftVisual visual={{ kind: 'msg', conversationId: 'c', thread: 'Varsity', count: 1, last: null, draft: 'See you Tuesday.' }} />);
    expect(screen.queryByText('Are we doing dinner?')).toBeNull();
    expect(screen.getByText('1 person')).toBeTruthy();
  });
  it('dispatches the new drill variant', () => {
    render(<DraftVisual visual={{ kind: 'drill', name: 'Balance', area: 'fitness', minutes: 10 }} />);
    expect(screen.getByRole('figure').getAttribute('aria-label')).toContain('Balance, 10 minutes');
  });
  it('leaves unverified calendar days neutral', () => {
    const { container } = render(<WeekDraft visual={{ kind: 'cal', date: '2026-11-11', start: '16:00', end: '16:45', title: 'Meeting', where: null, who: '7 players', rsvp: true }} />);
    expect(container.querySelector('[data-busy]')).toBeNull();
    expect(screen.getByText('Calendar not checked')).toBeTruthy();
  });
});

describe('fresh-only motion lifecycle', () => {
  it('keeps history static, including when fresh is enabled after mount', () => {
    const { rerender } = render(<TripDraft visual={trip} />); tick();
    rerender(<TripDraft visual={trip} fresh />); tick();
    expect(animate).not.toHaveBeenCalled();
  });
  it.each(['draft', 'landing', 'landed', 'gone'] as const)('does not animate %s under reduced motion', (state) => {
    prefs.reduced = true;
    render(<TripDraft visual={trip} fresh state={state} />); tick();
    expect(animate).not.toHaveBeenCalled();
  });
  it('keeps Animations off static from the first frame', () => {
    prefs.mode = 'off'; render(<TripDraft visual={trip} fresh />); tick();
    expect(animate).not.toHaveBeenCalled();
  });
  it('plays fresh drafts once, cancels on state changes, and never animates layout', () => {
    const { rerender } = render(<QualDraft visual={{ kind: 'qual', title: 'Fall', rounds: 1, start: '2026-11-08', total: 5, picks: 0, field: 7, deadline: null }} fresh />); tick();
    expect(animate).toHaveBeenCalled();
    const count = animate.mock.calls.length;
    for (const call of animate.mock.calls) for (const frame of (call[0] as Keyframe[])) expect(Object.keys(frame).some((k) => ['width', 'height', 'top', 'left'].includes(k))).toBe(false);
    rerender(<QualDraft visual={{ kind: 'qual', title: 'Fall', rounds: 1, start: '2026-11-08', total: 5, picks: 0, field: 7, deadline: null }} fresh state="landing" />); tick();
    expect(animations.every((a) => a.cancel.mock.calls.length > 0)).toBe(true);
    expect(animate.mock.calls.length).toBe(count);
  });
});
