import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
// The live writes are server actions; every test here passes its own.
vi.mock('../screens/coachhelm/writes', () => ({ LIVE_ANALYST_READ_WRITES: { focus: vi.fn(), mark: vi.fn() } }));

import { buildTeamReads } from '@/lib/coachhelm/v3/analyst/reads/build';
import { readsTeam } from '@/lib/coachhelm/v3/analyst/reads/__tests__/team';
import { toChAnalystRead, withCoachActions } from '../data/coachhelm-analyst-read-shape';
import { ToastProvider } from '../ui/Toast';
import type { ChAnalystReadWrites } from '../screens/coachhelm/writes';
import { AnalystReadCard } from '../screens/coachhelm/file/AnalystRead';

afterEach(cleanup);

// jsdom has no <dialog> methods.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};

const payload = buildTeamReads(readsTeam().rows()).payloads.find((p) => (p.priority?.evidence.length ?? 0) > 0)!;
const read = toChAnalystRead(payload);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const SINCE = 'Focus set 18 Nov on approach, 1.4 strokes a round lost then. No round counted since yet.';

function show(writes: Partial<ChAnalystReadWrites>, r = read) {
  const all: ChAnalystReadWrites = { focus: vi.fn().mockResolvedValue({ success: true, data: { setOn: '2026-11-18', since: SINCE, word: 'Too early' } }), mark: vi.fn().mockResolvedValue({ success: true }), ...writes };
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root ch-hf" data-ui="clubhouse">
          <AnalystReadCard load={{ status: 'ready', read: r }} first="Eli" writes={all} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return all;
}

describe('a coach acts on CoachHelm’s read', () => {
  it('Set as focus shows the focus at once, then the server’s line; it sends the player, the card and a one-time id', async () => {
    const u = userEvent.setup();
    const w = show({});
    await u.click(screen.getByRole('button', { name: 'Set as focus' }));
    await waitFor(() => expect(screen.getByText(SINCE)).toBeInTheDocument());
    expect(w.focus).toHaveBeenCalledWith({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), playerId: payload.player_id, cardKey: payload.priority!.key });
    expect(screen.queryByRole('button', { name: 'Set as focus' })).toBeNull();
    expect(code('CH-13015')).toBeNull();
  });

  it('CH-13015 a failed Set as focus takes the focus back, says so, and Try again sends the same id', async () => {
    const u = userEvent.setup();
    const focus = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValue({ success: true, data: { setOn: '2026-11-18', since: SINCE, word: 'Too early' } });
    show({ focus });
    await u.click(screen.getByRole('button', { name: 'Set as focus' }));
    await expectCode('CH-13015', /Couldn’t set the focus for Eli/);
    expect(screen.queryByText(SINCE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Set as focus' })).toBeInTheDocument();
    await u.click(within(code('CH-13015') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText(SINCE)).toBeInTheDocument());
    expect(focus).toHaveBeenCalledTimes(2);
    expect(focus.mock.calls[1]).toEqual(focus.mock.calls[0]);
  });

  it('Not useful steps the read down at once', async () => {
    const u = userEvent.setup();
    const w = show({});
    await u.click(screen.getByRole('button', { name: 'Not useful' }));
    await waitFor(() => expect(screen.getByText(/You marked this read of Eli not useful\. It stays down until the evidence changes\./)).toBeInTheDocument());
    expect(w.mark).toHaveBeenCalledWith({ id: expect.any(String), playerId: payload.player_id, cardKey: payload.priority!.key, verdict: 'not_useful' });
  });

  it('CH-13016 a failed Not useful puts the read back and says so', async () => {
    const u = userEvent.setup();
    show({ mark: vi.fn().mockResolvedValue({ success: false, error: 'nope' }) });
    await u.click(screen.getByRole('button', { name: 'Not useful' }));
    await expectCode('CH-13016', /Couldn’t mark Eli’s read as not useful/);
    expect(screen.getByText(payload.priority!.headline)).toBeInTheDocument();
  });

  it('Wrong asks for a reason, sends it, and steps the read down with it', async () => {
    const u = userEvent.setup();
    const w = show({});
    await u.click(screen.getByRole('button', { name: 'Wrong' }));
    const send = await screen.findByRole('button', { name: 'Mark as wrong' });
    expect(send).toBeDisabled();
    await u.type(screen.getByRole('textbox', { name: 'Reason' }), 'Played hurt for three of these');
    await u.click(screen.getByRole('button', { name: 'Mark as wrong' }));
    await waitFor(() => expect(screen.getByText(/You marked this read of Eli wrong: Played hurt for three of these\./)).toBeInTheDocument());
    expect(w.mark).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'wrong', reason: 'Played hurt for three of these' }));
  });

  it('CH-13017 a failed Wrong puts the read back and says so', async () => {
    const u = userEvent.setup();
    show({ mark: vi.fn().mockResolvedValue({ success: false, error: 'nope' }) });
    await u.click(screen.getByRole('button', { name: 'Wrong' }));
    await u.type(await screen.findByRole('textbox', { name: 'Reason' }), 'Wrong course');
    await u.click(screen.getByRole('button', { name: 'Mark as wrong' }));
    await expectCode('CH-13017', /Couldn’t mark Eli’s read as wrong/);
    expect(screen.getByText(payload.priority!.headline)).toBeInTheDocument();
  });
});

describe('the card after the coach’s own actions, before the next saved read', () => {
  const key = payload.priority!.key;
  const link = { card_key: key, part: payload.priority!.area, set_on: '2026-11-03', value_on_day: 1.4, rounds_on_day: 9, team_lost_on_day: 0.8, created_at: '2026-11-03T15:00:00Z' };
  it('a focus set on this card says when, on what, and that no round is counted yet', () => {
    const out = withCoachActions(read, '2026-11-02T00:00:00Z', { feedback: null, focus: link });
    expect(out.focus).toEqual({ setOn: '2026-11-03', since: `Focus set 3 Nov on ${payload.priority!.area_label.toLowerCase()}, 1.4 strokes a round lost then. No round counted since yet.`, word: 'Too early' });
  });
  it('a verdict newer than the saved read steps it down; an older one, or one on another card, does not', () => {
    const fb = { card_key: key, verdict: 'wrong' as const, reason: 'Played hurt', created_at: '2026-11-05T00:00:00Z' };
    expect(withCoachActions(read, '2026-11-04T00:00:00Z', { feedback: fb, focus: null }).suppressed).toEqual({ verdict: 'Wrong', reason: 'Played hurt' });
    expect(withCoachActions(read, '2026-11-06T00:00:00Z', { feedback: fb, focus: null }).suppressed).toBeNull();
    expect(withCoachActions(read, '2026-11-04T00:00:00Z', { feedback: { ...fb, card_key: 'priority:other' }, focus: { ...link, card_key: 'priority:other' } })).toEqual(read);
  });
});
