import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../../../../shell/nav', async (orig) => ({ ...(await orig<typeof import('../../../../shell/nav')>()), rebuiltHref: (href: string) => href }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import { ToastProvider } from '../../../../ui/Toast';
import { previewReadView } from '../../../../preview/fixtures-coachhelm-read';
import { HELM_PLAYERS } from '../../../../preview/fixtures-coachhelm';
import type { ChViewLoad, ChViewVoice } from '../../../../data/coachhelm-views-shape';
import type { ChReadView } from '../../../../data/coachhelm-read-view-shape';
import type { ChCoachHelmWrites } from '../../writes';
import { ReadPage } from '../ReadPage';
import '../../../../__tests__/dialog-polyfill';

/** W-READ-2, W-READ-6, W-READ-8, W-READ-13, S-READ.do 4, S-READ.sure 5, S-READ.gone: the read page as each viewer gets it, from the real shapers. */

const COACH: ChViewVoice = { role: 'coach', playerId: HELM_PLAYERS.priya.id, name: HELM_PLAYERS.priya.name, first: 'Priya', line: '' } as ChViewVoice;
const PLAYER: ChViewVoice = { role: 'player' } as ChViewVoice;

const writesSpy = (): ChCoachHelmWrites => ({ assign: vi.fn(async () => ({ success: true })), dismiss: vi.fn(async () => ({ success: true })), undo: vi.fn(async () => ({ success: true })) });

function show(load: ChViewLoad<ChReadView>, voice: ChViewVoice, writes: ChCoachHelmWrites = writesSpy()) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>{children}</ToastProvider>
    </LazyMotion>
  );
  render(<ReadPage load={load} voice={voice} writes={writes} />, { wrapper: Wrap });
  return writes;
}
const ready = (role: 'coach' | 'player', gone = false): ChViewLoad<ChReadView> => ({ status: 'ready', data: previewReadView(undefined, role, gone) });

// jsdom has no Web Animations; the Assigned chip's flash calls it once.
beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a player on their own read', () => {
  it('has no Assign, Dismiss or Message, and no Coach only well, in the DOM', () => {
    show(ready('player'), PLAYER);
    expect(screen.getByRole('main').getAttribute('data-ch-screen')).toBe('coachhelm-read');
    expect(screen.getByRole('heading', { name: 'Why CoachHelm thinks so' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /assign as focus/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /propose again/i })).toBeNull();
    expect(screen.queryByText(/^Message /)).toBeNull();
  });

  it('the Coach only well is gated by viewer, even if a rung reached the payload (S-READ.sure 5)', () => {
    const withRung = (role: 'coach' | 'player'): ChViewLoad<ChReadView> => {
      const data = previewReadView(undefined, role);
      return { status: 'ready', data: { ...data, read: { ...data.read!, sure: { ...data.read!.sure, rung: { word: 'Likely', range: '1.1 to 2.9' } } } } };
    };
    show(withRung('coach'), COACH);
    expect(screen.getByText('Coach only')).toBeTruthy();
    expect(screen.getByText('1.1 to 2.9')).toBeTruthy();
    cleanup();
    show(withRung('player'), PLAYER);
    expect(screen.queryByText('Coach only')).toBeNull();
    expect(screen.queryByText('1.1 to 2.9')).toBeNull();
  });

  it('the More sheet offers a player no Dismiss and no Message', async () => {
    show(ready('player'), PLAYER);
    await userEvent.click(screen.getByRole('button', { name: 'More for this read' }));
    expect(screen.queryByText('Dismiss this read')).toBeNull();
    expect(screen.queryByText(/^Message /)).toBeNull();
  });

  it('no other player name reaches the DOM, and no likely cause does', () => {
    show(ready('player'), PLAYER);
    const text = document.body.textContent ?? '';
    for (const p of [HELM_PLAYERS.eli, HELM_PLAYERS.jonah]) expect(text).not.toContain(p.name);
    expect(text).not.toContain('Long par 4s');
  });

  it('an id not on the player own list is the gone card, with nothing of the read', () => {
    show(ready('player', true), PLAYER);
    expect(document.querySelector('[data-ch-code="CH-13861"]')).not.toBeNull();
    expect(screen.getByText('This read is no longer open')).toBeTruthy();
    expect(screen.getByText(/Your open reads are on the board/)).toBeTruthy();
    expect(screen.queryByText('Why CoachHelm thinks so')).toBeNull();
  });
});

describe('a coach on a read', () => {
  it('Assign sends one write for this player, and the chip shows only after it lands', async () => {
    let answer: (r: { success: boolean }) => void = () => {};
    const assign = vi.fn(() => new Promise<{ success: boolean }>((res) => (answer = res)));
    show(ready('coach'), COACH, { ...writesSpy(), assign });
    const button = screen.getByRole('button', { name: 'Assign as focus' });
    await userEvent.click(button);
    expect(assign).toHaveBeenCalledTimes(1);
    expect((assign.mock.calls[0] as unknown as [{ playerId: string }])[0].playerId).toBe(HELM_PLAYERS.priya.id);
    expect(document.querySelector('[data-ch-code="CH-13601"]')).toBeNull();
    answer({ success: true });
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13601"]')).not.toBeNull());
  });

  it('a refused Assign leaves the button and shows CH-13001', async () => {
    show(ready('coach'), COACH, { ...writesSpy(), assign: vi.fn(async () => ({ success: false, error: 'no' })) });
    await userEvent.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13001"]')).not.toBeNull());
    expect(document.querySelector('[data-ch-code="CH-13601"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
  });

  it('More offers Dismiss, which writes once, and a Message link with an empty body', async () => {
    const writes = show(ready('coach'), COACH);
    await userEvent.click(screen.getByRole('button', { name: 'More for this read' }));
    const links = screen.getAllByRole('link', { name: 'Message Priya' });
    for (const a of links) expect(a.getAttribute('href')).toBe(`/golf/dashboard/messages?player=${encodeURIComponent(HELM_PLAYERS.priya.id)}`);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dismiss this read' }));
    expect(writes.dismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13901"]')).not.toBeNull());
  });

  it('the coach view holds what the player tests look for, on the same fixture', () => {
    show(ready('coach'), COACH);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Long par 4s');
    expect(text).toContain(HELM_PLAYERS.eli.name);
    expect(text).toContain(HELM_PLAYERS.jonah.name);
  });

  it('no Ask link while Ask is off', () => {
    show(ready('coach'), COACH);
    expect(screen.queryByText(/Ask about this read/)).toBeNull();
    expect(screen.queryByText(/Add to practice plan/)).toBeNull();
  });

});

describe('the states around a read (W-READ-6)', () => {
  it('a thrown feed is CH-13866, with Try again that refreshes once', async () => {
    show({ status: 'failed' }, PLAYER);
    expect(document.querySelector('[data-ch-code="CH-13866"]')).not.toBeNull();
    expect(document.querySelector('[data-ch-code="CH-13860"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('off is CH-13313 with the reason, and offers no read', () => {
    show({ status: 'off', reason: 'CoachHelm is off for this team.' }, PLAYER);
    expect(document.querySelector('[data-ch-code="CH-13313"]')).not.toBeNull();
    expect(screen.getByText('CoachHelm is off for this team.')).toBeTruthy();
  });
});
