import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import { previewPlayerFile, previewPlayerWeek } from '../../../../preview/fixtures-coachhelm-player-file';
import { ToastProvider } from '../../../../ui/Toast';
import type { ChFileIntent, ChPlayerWeek } from '../../../../data/coachhelm-file-shape';
import type { ChPlayerWrites } from '../../writes';
import { IntentSheet } from '../IntentSheet';
import { PlayerFile } from '../PlayerFile';
import { YourWeek } from '../YourWeek';
import '../../../../__tests__/dialog-polyfill';

/** Lenses W-LNS-4, W-LNS-8, W-LNS-14, W-LNS-15, W-LNS-16, S-FILE 31, S-FILE.lens, S-FILE.plan and S-BOARD: the coach's file, its lens and the player's own page in the DOM. */

const NOTE = 'Wants to play number one by spring.';
const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);

/** The field card's dots other than the player's own mark and the mean. */
const teammateDots = () => document.querySelectorAll('.dots > i:not(.mean):not(.me)');

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ cancel: () => {}, finished: Promise.resolve() })) as unknown as Element['animate'];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the coach file and the lens', () => {
  it('the read card is not a button wrapped around its actions: the title is the button', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('default') }} roster={null} />, { wrapper: Wrap });
    const card = document.querySelector('[data-ch="file-feature"]') as HTMLElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
    expect(within(card).getByRole('button', { name: /^Open the read:/ }).closest('h3')).not.toBeNull();
  });

  it('the lens has no plan, track record, dismissed read or coach control in the DOM (S-FILE.lens 4)', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('default') }} roster={null} initialLens="player" />, { wrapper: Wrap });
    const text = document.body.textContent ?? '';
    expect(text).toContain('As Eli sees it');
    for (const coachOnly of [NOTE, 'Fairways hit on par 5s', 'Track record', 'Only you']) expect(text).not.toContain(coachOnly);
    expect(document.querySelector('.dots')).not.toBeNull();
    expect(teammateDots()).toHaveLength(0);
  });

  it('the coach view holds what the lens does not, on the same fixture', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('default') }} roster={null} />, { wrapper: Wrap });
    const text = document.body.textContent ?? '';
    for (const coachOnly of [NOTE, 'Fairways hit on par 5s', 'Track record', 'Only you']) expect(text).toContain(coachOnly);
    expect(teammateDots()).toHaveLength(5);
  });

  it('with no focus yet, Assign is on the coach view and off the lens', () => {
    const data = previewPlayerFile('noplan');
    render(<PlayerFile load={{ status: 'ready', data }} roster={null} />, { wrapper: Wrap });
    expect(screen.getAllByRole('button', { name: /Assign as focus/ }).length).toBeGreaterThan(0);
    cleanup();
    render(<PlayerFile load={{ status: 'ready', data }} roster={null} initialLens="player" />, { wrapper: Wrap });
    expect(screen.queryByRole('button', { name: /Assign as focus/ })).toBeNull();
  });

  it('a failed intent read says so and never reads as not set', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('intentfailed') }} roster={null} />, { wrapper: Wrap });
    expect(document.querySelector('[data-ch-code="CH-13761"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Not set yet');
  });

  it('no row at all reads Not set yet, never a made-up default (S-FILE 29)', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('nointent') }} roster={null} />, { wrapper: Wrap });
    expect(document.body.textContent).toContain('Not set yet');
  });
});

describe('every figure on the file names the window it reads (one number, one source)', () => {
  it('the strokes card says the last ten, and its link to Standing says Standing’s own window', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('default') }} roster={null} />, { wrapper: Wrap });
    const card = document.querySelector('[data-ch-anchor="sg"]') as HTMLElement;
    expect(card.textContent).toContain('Last 10 rounds');
    expect(card.textContent).not.toContain('All time ·');
    expect(within(card).getByRole('link', { name: 'Full standing, all time' })).toBeTruthy();
    // A separator never starts a line, and the link keeps the space before it (it sat two pixels over it).
    expect(card.querySelector('.card__n')!.textContent).toContain('Last 10 rounds\u00a0· strokes per round. Full standing, all time');
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-file.css'), 'utf8');
    expect(css).toMatch(/\.ch-hf p \.lnk \{ position: relative; margin: 0; \}/);
  });

  it('a Team cell that comes from the standing rows says their window; a read’s own team figure is plain Team', () => {
    const data = previewPlayerFile('default');
    const first = render(<PlayerFile load={{ status: 'ready', data }} roster={null} />, { wrapper: Wrap });
    const cells = () => [...document.querySelectorAll('[data-ch="file-feature"] .feat__cmp span')].map((x) => x.textContent);
    expect(cells()).toContain('Team, all time');
    // The window is its own line under "Team" (it broke after "all" in the phone's cell); a reader still hears "Team, all time".
    const team = [...document.querySelectorAll('[data-ch="file-feature"] .feat__cmp > div > span')].find((x) => x.textContent === 'Team, all time')!;
    expect(team.querySelector('small')?.textContent).toBe('all time');
    expect(team.querySelector('.ch-sr-only')?.textContent).toBe(', ');
    first.unmount();
    // The same read carrying its own team figure: that is the one the Team board's sheet draws, so the cell is plain "Team".
    const feat = data.cards.feat!;
    const own = { ...data, cards: { ...data.cards, feat: { ...feat, base: { ...feat.base, compare: { ...feat.base.compare!, team: 0.9 } } } } };
    render(<PlayerFile load={{ status: 'ready', data: own }} roster={null} />, { wrapper: Wrap });
    expect(cells()).toContain('Team');
    expect(cells()).not.toContain('Team, all time');
    expect(document.querySelector('[data-ch="file-feature"] .feat__cmp')!.textContent).toContain('0.9');
  });
});

describe('IntentSheet (W-LNS-8)', () => {
  const VALUE: ChFileIntent = { aim: 'develop', alerts: 'balanced', watching: [], note: 'old' };

  function sheet(save: (i: never) => Promise<{ ok: boolean; error?: string }>, onSaved = vi.fn(), onClose = vi.fn()) {
    render(<IntentSheet open playerId="p1" first="Eli" value={VALUE} save={save as never} onSaved={onSaved} onClose={onClose} />, { wrapper: Wrap });
    return { onSaved, onClose };
  }

  it('Save plan writes once while Saving, for this player, with the note trimmed', async () => {
    let answer: (r: { ok: boolean }) => void = () => {};
    const save = vi.fn(() => new Promise<{ ok: boolean }>((res) => (answer = res)));
    const { onSaved } = sheet(save);
    const note = screen.getByRole('textbox');
    await userEvent.clear(note);
    await userEvent.type(note, '  new note  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    const busy = screen.getByRole('button', { name: 'Saving' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await userEvent.click(busy);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([{ player_id: 'p1', narrative_goal: 'develop', alert_posture: 'balanced', highlight_categories: [], notes: 'new note' }]);
    expect(onSaved).not.toHaveBeenCalled();
    answer({ ok: true });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ aim: 'develop', alerts: 'balanced', watching: [], note: 'new note' }));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('a refused save shows CH-13760, keeps the text and saves nothing locally', async () => {
    const { onSaved, onClose } = sheet(vi.fn(async () => ({ ok: false, error: 'no' })));
    const note = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(note, ' more');
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13760"]')).not.toBeNull());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(note.value).toBe('old more');
  });

  it('the note is capped at 2000 characters', () => {
    sheet(vi.fn(async () => ({ ok: true })));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).maxLength).toBe(2000);
  });
});

describe('the player page (S-BOARD, W-LNS-14, W-LNS-15)', () => {
  const week = (state: string): ChPlayerWeek => previewPlayerWeek(state);

  it('130801 holds no coach plan, no track record, no dismissed read, no More menu and no coach control (Assign, Dismiss, Undo)', () => {
    render(<YourWeek load={{ status: 'ready', data: week('default') }} />, { wrapper: Wrap });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Your week');
    expect(text).not.toContain(NOTE);
    expect(text).not.toContain('Fairways hit on par 5s');
    expect(screen.queryByRole('button', { name: /More for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign|Dismiss|Undo|Share/ })).toBeNull();
  });

  it('on a desk the page opens with the player’s CoachHelm head: the page title, the line, and the views inside the head', () => {
    render(<YourWeek load={{ status: 'ready', data: week('default') }} />, { wrapper: Wrap });
    const main = screen.getByRole('main');
    // The canopy is what gives the head the page title's style (shell.css), and the tight head has no rule over the title.
    expect(main.getAttribute('data-canopy')).toBe('');
    const head = main.querySelector('header.ch-hl-h') as HTMLElement;
    expect(head.getAttribute('data-canopy-head')).toBe('tight');
    const title = within(head).getByRole('heading', { level: 1, name: 'Your week' });
    expect(main.getAttribute('aria-labelledby')).toBe(title.id);
    expect(head.textContent).toMatch(/21 rounds · refreshed/);
    // The views stand in the head's own aside (inside the page's gutter), never in the 300px box that ran them to the page's edge.
    expect(within(head.querySelector('.ch-hl-h__aside') as HTMLElement).getByRole('radiogroup', { name: 'CoachHelm view' })).toBeTruthy();
    expect(main.querySelector('.dhead, .aseg')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('What’s working says its figure once: the title carries it, and the line under it is the area and how firm the read is', () => {
    render(<YourWeek load={{ status: 'ready', data: week('default') }} />, { wrapper: Wrap });
    const row = within(screen.getByRole('region', { name: 'What’s working' })).getByRole('button');
    expect(row.querySelector('b')!.textContent).toBe('Double bogey-or-worse rate: 1.6%');
    expect(row.querySelector('small')!.textContent).toBe('Course and scoring · Solid read');
    expect(row.textContent!.match(/1\.6%/g)).toHaveLength(1);
  });

  it('draws no dot for another player on the field card', () => {
    render(<YourWeek load={{ status: 'ready', data: week('default') }} />, { wrapper: Wrap });
    expect(document.querySelector('.dots')).not.toBeNull();
    expect(teammateDots()).toHaveLength(0);
  });

  it('Accept calls the player write once with the proposal id; a refusal shows CH-13004 and keeps the buttons', async () => {
    const writes: ChPlayerWrites = { accept: vi.fn(async () => ({ success: false, error: 'no' })), decline: vi.fn(async () => ({ success: true })) };
    render(<YourWeek load={{ status: 'ready', data: week('proposed') }} writes={writes} />, { wrapper: Wrap });
    const proposals = screen.getAllByRole('button', { name: 'Accept' }).filter((b) => !(b as HTMLButtonElement).disabled);
    expect(proposals.length).toBeGreaterThan(0);
    await userEvent.click(proposals[0]!);
    expect(writes.accept).toHaveBeenCalledTimes(1);
    expect(writes.accept).toHaveBeenCalledWith('fa-1');
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13004"]')).not.toBeNull());
    expect(screen.getAllByRole('button', { name: 'Accept' }).length).toBeGreaterThan(0);
    expect(within(document.body).queryByText('Declined')).toBeNull();
  });

  it('Decline is held: nothing writes until the page is left, then once; a refusal shows CH-13005 and brings the buttons back', async () => {
    const writes: ChPlayerWrites = { accept: vi.fn(async () => ({ success: true })), decline: vi.fn(async () => ({ success: false, error: 'no' })) };
    render(<YourWeek load={{ status: 'ready', data: week('proposed') }} writes={writes} />, { wrapper: Wrap });
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' }).filter((b) => !(b as HTMLButtonElement).disabled)[0]!);
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13912"]')).not.toBeNull());
    expect(writes.decline).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-13005"]')).not.toBeNull());
    expect(writes.decline).toHaveBeenCalledTimes(1);
    expect(writes.decline).toHaveBeenCalledWith('fa-1');
    expect(writes.accept).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Accept' }).some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('Undo on a held Decline means the write is never sent', async () => {
    const writes: ChPlayerWrites = { accept: vi.fn(async () => ({ success: true })), decline: vi.fn(async () => ({ success: true })) };
    render(<YourWeek load={{ status: 'ready', data: week('proposed') }} writes={writes} />, { wrapper: Wrap });
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' }).filter((b) => !(b as HTMLButtonElement).disabled)[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    window.dispatchEvent(new Event('pagehide'));
    expect(writes.decline).not.toHaveBeenCalled();
  });
});
