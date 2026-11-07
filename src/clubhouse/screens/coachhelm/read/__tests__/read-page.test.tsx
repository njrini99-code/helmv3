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
import { ReadPage, ReadSkeleton } from '../ReadPage';
import { RoundsCard } from '../cards';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { penalties } from '../../../../preview/fixtures-coachhelm';
import { toChInsight } from '../../../../data/coachhelm-map';
import { toChDeepInsight, diveCounts, type ChDeepDive } from '../../../../data/coachhelm-dive-shape';
import { toChReadView } from '../../../../data/coachhelm-read-view-shape';
import { READ_CALLS } from '../../../../data/coachhelm-read-calls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const links = screen.getAllByRole('link', { name: 'Message Priya' });
    for (const a of links) expect(a.getAttribute('href')).toBe(`/golf/dashboard/messages?player=${encodeURIComponent(HELM_PLAYERS.priya.id)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss this read' }));
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

/** A row as production stores it, through the real shapers: `diagnosis` with no `cause`, so the Why card is the legacy branch. */
function viewOf(evidence: Record<string, unknown>, role: 'coach' | 'player' = 'coach'): ChViewLoad<ChReadView> {
  const base = penalties(HELM_PLAYERS.priya.id, 'in-27');
  const raw = { ...base, evidence: { ...base.evidence, ...evidence } } as EvidenceInsight;
  const viewer = role === 'coach' ? ({ role: 'coach', first: 'Priya' } as const) : ({ role: 'player' } as const);
  const deep = toChDeepInsight(raw, toChInsight(raw, { viewer } as never), { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (t) => t, role);
  const dive: ChDeepDive = { list: [deep], tour: 'Tour', rounds: 21 as never, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts([deep]) };
  return { status: 'ready', data: toChReadView(dive, new Map([[raw.id, raw]]), raw.id, role, { playerId: role === 'coach' ? raw.player_id : null, name: 'Priya Natarajan', first: 'Priya' }, { ...READ_CALLS, teamPool: false }) };
}

describe('READ-S1 how sure, in a coach’s words', () => {
  const LEAK = /recency|variance|not measured|sample-adequacy|adequate|of target|observations;/i;
  const stored = { metric: 'approach_proximity_50_125ft', unit: 'percent', window_basis: undefined, detail: {}, sample_n: 27, confidence: 0.9, confidence_factors: { sample_adequacy: 0.9, recency: 1, variance: 0.5, factors_measured: false } };
  const diagnosis = (confidence_reason: string) => ({ symptom: 'Greens hit', root_cause: 'Long approaches finish short of the green', causality_level: 'observed_sequence', drivers: [], recommended_action: 'Work on carry', confidence_reason });

  it('reads “27 approaches. Enough for a solid read.”', () => {
    show(viewOf(stored), COACH);
    expect(document.querySelector('#csure')?.textContent).toContain('27 approaches. Enough for a solid read.');
  });

  it.each([
    '27 observations; recency/variance not measured (sample-adequacy only); sample 90% of target',
    '27 observations; recency measured 0.80; variance measured 0.60; sample adequate',
    'sample adequate',
  ])('a row stored with “%s” does not reach the page, on any card', (reason) => {
    show(viewOf({ ...stored, diagnosis: diagnosis(reason) }), COACH);
    const main = screen.getByRole('main');
    // The legacy Why card is what drew it: it is here, with the cause and without the reason.
    expect(main.querySelector('#cwhy')?.textContent).toContain('Long approaches finish short of the green');
    expect(main.textContent).not.toMatch(LEAK);
  });

  it('a reason a person wrote still reads', () => {
    show(viewOf({ ...stored, diagnosis: diagnosis('Both groups have enough approaches to compare') }), COACH);
    expect(document.querySelector('#cwhy')?.textContent).toContain('Both groups have enough approaches to compare');
  });

  it('a player reads the count alone', () => {
    show(viewOf(stored, 'player'), PLAYER);
    const sure = document.querySelector('#csure')?.textContent ?? '';
    expect(sure).toContain('27 approaches');
    expect(sure).not.toContain('Enough for');
  });
});

describe('READ-S2 the rounds card', () => {
  const detail = (rounds: Partial<ReturnType<typeof previewReadView>['read'] extends infer D ? (D extends { rounds: infer R } ? R : never) : never>) => ({ ...previewReadView(undefined, 'coach').read!, rounds: { total: 0, list: [], ...rounds } });
  const round = (id: string, date: string) => ({ id, date, course: 'Hilltop', score: '76', toPar: '+4', toPar18: 4, nine: false, href: `/golf/dashboard/rounds/${id}`, counted: 0 });
  const paint = (el: ReactNode) => render(el, { wrapper: ({ children }) => <LazyMotion features={domAnimation}>{children}</LazyMotion> });

  it('lists the rounds it joined, each a link to its review', () => {
    paint(<RoundsCard d={detail({ total: 2, list: [round('r2', 'Oct 15'), round('r1', 'Oct 8')] })} failed={false} voice={COACH} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/golf/dashboard/rounds/r2', '/golf/dashboard/rounds/r1']);
    expect(document.querySelector('#crounds')?.textContent).toContain('2 rounds');
    expect(document.querySelector('[data-ch-code="CH-13382"]')).toBeNull();
  });

  it('one round is one round', () => {
    paint(<RoundsCard d={detail({ total: 1, list: [round('r1', 'Oct 8')] })} failed={false} voice={COACH} />);
    expect(document.querySelector('#crounds .meta')?.textContent).toBe('1 round');
  });

  it('a failed read is CH-13281, whatever the list holds', () => {
    paint(<RoundsCard d={detail({ total: 0, list: [] })} failed voice={COACH} />);
    expect(document.querySelector('[data-ch-code="CH-13281"]')?.textContent).toContain('didn’t load');
    expect(document.querySelector('[data-ch-code="CH-13382"]')).toBeNull();
  });

  it('nothing to list says why, by name, and never “no rounds”', () => {
    paint(<RoundsCard d={detail({ total: 0, list: [] })} failed={false} voice={COACH} />);
    expect(document.querySelector('[data-ch-code="CH-13382"]')?.textContent).toBe('This read does not name the rounds it was made from. It uses Priya’s stats over its window, so there is no list to show.');
    cleanup();
    paint(<RoundsCard d={detail({ total: 14, list: [] })} failed={false} voice={PLAYER} />);
    expect(document.querySelector('[data-ch-code="CH-13382"]')?.textContent).toBe('This read was made from 14 rounds, but none of them can be listed here. They may be rounds you have since removed.');
  });
});

describe('READ-S4 the skeleton is the page’s shape', () => {
  const columns = (root: Element) => [...root.querySelector('.ch-hr-desk')!.children].map((c) => (c.classList.contains('ch-hr-col') ? [...c.classList].filter((x) => x.startsWith('ch-hr-col') || x === 'is-evidence').join(' ') : 'rail'));

  it('its three columns are the page’s, placed by one rule: 250, main, 320', () => {
    const skeleton = render(<ReadSkeleton />);
    const held = columns(skeleton.container);
    skeleton.unmount();
    show(ready('coach'), COACH);
    expect(held).toEqual(['rail', 'ch-hr-col', 'ch-hr-col is-evidence']);
    expect(columns(document.body)).toEqual(held);
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-read.css'), 'utf8');
    expect(css).toMatch(/\.ch-hr\.is-desk \.ch-hr-desk \{[^}]*grid-template-columns: 250px minmax\(0, 1fr\) 320px;/);
  });

  it('it is a route skeleton by the mark RouteFrame and base.css look for, and asks to crossfade', () => {
    const { container } = render(<ReadSkeleton />);
    const main = container.querySelector("main[aria-busy='true'][aria-label^='Loading']") as HTMLElement;
    expect(main).toBeTruthy();
    expect(main.dataset.chArrive).toBe('crossfade');
  });
});
