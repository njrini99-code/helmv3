import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));
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
  it('the lens has no plan, track record, dismissed read or coach control in the DOM (S-FILE.lens 4)', () => {
    render(<PlayerFile load={{ status: 'ready', data: previewPlayerFile('default') }} roster={null} initialLens="player" />, { wrapper: Wrap });
    const text = document.body.textContent ?? '';
    expect(text).toContain('As Jonah sees it');
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

  it('holds no coach plan, no track record, no dismissed read and no More menu', () => {
    render(<YourWeek load={{ status: 'ready', data: week('default') }} />, { wrapper: Wrap });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Your week');
    expect(text).not.toContain(NOTE);
    expect(text).not.toContain('Fairways hit on par 5s');
    expect(screen.queryByRole('button', { name: /More for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign/ })).toBeNull();
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
});
