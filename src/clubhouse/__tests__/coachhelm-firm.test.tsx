import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Round 2C: with `coachhelm_support_v1` on, the coach board shows only reads at Working hypothesis or firmer. A read rated Not
 * enough yet is not a card; the held-back reads are one collapsed line, "Not enough yet (N)", that opens in place (CH-13942), and a
 * player every one of whose reads is held back is a By player row that says so (CH-13943). Flag off: nothing changes.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));

import { isNotEnoughYet, notEnoughOf, notEnoughRead, splitFirm } from '../data/coachhelm-firm';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PREVIEW_HELM_COACH } from '../preview/fixtures-coachhelm';
import { PREVIEW_HELM_COACH_NOT_ENOUGH } from '../preview/fixtures-coachhelm-firm';
import { ToastProvider } from '../ui/Toast';

afterEach(cleanup);

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const okWrites = () => ({ assign: vi.fn(() => Promise.resolve({ success: true })), dismiss: vi.fn(() => Promise.resolve({ success: true })), undo: vi.fn(() => Promise.resolve({ success: true })) });
const show = (data: ChCoachHelmData) => render(wrap(<CoachBoard data={data} writes={okWrites()} />));
const flat = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');

const read = (id: string, ladder: string | null, strokes: number | null = null) => ({
  id,
  title: `Read ${id}`,
  evidence: {
    ...(ladder ? { ladder, support: { version: 'support_v1', testable: true, n: 12, n_unit: 'attempts', floor: 40, rounds_n: 4, round_floor: 3 } } : {}),
    ...(strokes != null ? { strokes_shrunk: strokes } : {}),
  },
});

describe('splitFirm', () => {
  it('with the flag off, holds nothing back and keeps the head', () => {
    const head = read('a', 'not_enough_yet');
    expect(splitFirm(head, [head, read('b', 'observed')], false)).toEqual({ head, held: [] });
  });

  it('keeps a firm head and holds back every read rated Not enough yet, once each', () => {
    const head = read('a', 'working_hypothesis');
    const thin = read('b', 'not_enough_yet');
    const out = splitFirm(head, [head, thin, read('c', 'likely'), thin], true);
    expect(out.head).toBe(head);
    expect(out.held.map((r) => r.id)).toEqual(['b']);
  });

  it('a held-back head gives way to the firmest other read (strokes times the rung weight)', () => {
    const out = splitFirm(read('a', 'not_enough_yet', 2), [read('b', 'working_hypothesis', 2), read('c', 'observed', 1), read('d', 'observed', 2)], true);
    expect(out.head?.id).toBe('d');
    expect(out.held.map((r) => r.id)).toEqual(['a']);
  });

  it('a read the pass has not rated is never held back, and no head stays no card', () => {
    expect(isNotEnoughYet(read('a', null).evidence)).toBe(false);
    expect(splitFirm(read('a', null), [], true).head?.id).toBe('a');
    const out = splitFirm(undefined, [read('b', 'observed'), read('c', 'not_enough_yet')], true);
    expect(out.head).toBeNull();
    expect(out.held.map((r) => r.id)).toEqual(['c']);
  });

  it('every read held back leaves no card', () => {
    const out = splitFirm(read('a', 'not_enough_yet'), [read('b', 'not_enough_yet')], true);
    expect(out.head).toBeNull();
    expect(out.held).toHaveLength(2);
  });

  it('a held-back read lists its title in the coach’s voice and its Watching count-down', () => {
    const r = notEnoughRead(read('a', 'not_enough_yet'), { role: 'coach', first: 'Priya' });
    expect(r.watching).toBe('Watching: 12 attempts so far. 28 more and this read can say something.');
    expect(notEnoughOf([{ id: 'p', name: 'Priya', card: true, reads: [] }])).toBeUndefined();
    expect(notEnoughOf([{ id: 'p', name: 'Priya', card: true, reads: [r, r] }])?.count).toBe(2);
  });
});

describe('the coach board with Not enough yet held back (CH-13942, CH-13943)', () => {
  it('draws one collapsed line, "Not enough yet (3)", that opens in place to each read', () => {
    show(PREVIEW_HELM_COACH_NOT_ENOUGH);
    const line = document.querySelector('[data-ch-code="CH-13942"]') as HTMLElement;
    expect(line).not.toBeNull();
    const button = screen.getByRole('button', { name: /Not enough yet/ });
    expect(flat(button.textContent)).toBe('Not enough yet (3)');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const list = line.querySelector('.ch-hl-ney__l') as HTMLElement;
    expect(list.closest('[hidden]')).not.toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(list.closest('[hidden]')).toBeNull();
    const items = [...list.querySelectorAll('li')].map((li) => flat(li.textContent));
    expect(items).toHaveLength(3);
    expect(items.some((t) => t.startsWith('Priya Natarajan · Putting break') && t.includes('Watching: 28 attempts so far. 12 more'))).toBe(true);
  });

  it('a held-back head is not the card: Eli’s card is his firm read, and Priya, all held back, is a By player row that says so', () => {
    show(PREVIEW_HELM_COACH_NOT_ENOUGH);
    const eli = PREVIEW_HELM_COACH_NOT_ENOUGH.players.list.find((p) => p.id === 'pl-eli')!;
    expect(eli.top.id).toBe('in-pen-eli');
    expect(PREVIEW_HELM_COACH_NOT_ENOUGH.players.list.some((p) => p.id === 'pl-priya')).toBe(false);
    const row = document.querySelector('[data-ch-code="CH-13943"]') as HTMLElement;
    expect(flat(row.textContent)).toContain('Priya NatarajanNot enough yet');
    expect(row.tagName).toBe('DIV');
  });

  it('with the flag off (no notEnough on the data) the board draws neither', () => {
    show(PREVIEW_HELM_COACH);
    expect(document.querySelector('[data-ch-code="CH-13942"]')).toBeNull();
    expect(document.querySelector('[data-ch-code="CH-13943"]')).toBeNull();
  });
});
