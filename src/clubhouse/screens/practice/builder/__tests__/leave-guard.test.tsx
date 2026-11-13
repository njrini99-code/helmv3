import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const room = vi.hoisted(() => ({ phone: false }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
const autosave = vi.hoisted(() => ({ state: { status: 'failed', error: { code: 'CH-17104', message: 'A block names a group that isn’t in this plan.' } as { code: string; message: string } | null, unsaved: true } }));
vi.mock('../useAutosave', () => ({ restoredDraft: () => null, useAutosave: () => ({ status: autosave.state.status, error: autosave.state.error, flush: async () => 4, retry: vi.fn(), unsaved: () => autosave.state.unsaved }) }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: vi.fn(), deletePracticePlan: vi.fn(), copyPlanBody: vi.fn(), recordPracticePlanOpen: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ savePracticePlanDraft: vi.fn(), undoPracticePlanDraft: vi.fn(), listPlanFolders: async () => ({ folders: [] }) }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn() }));
vi.mock('@/components/golf/coachhelm/chat/useCoachHelmChat', () => ({ useCoachHelmChat: () => ({ messages: [], busy: false, error: undefined, send: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/practice', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => room.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));

import type { ChBuilderData } from '../../../../data/practice-home-shape';
import { ToastProvider } from '../../../../ui/Toast';
import { Builder, type BuilderPreview } from '../Builder';
import { PT_PLAN } from '../../../../preview/fixtures-practice-thread';
import { addBlock, emptyBody, makeBlock } from '../builder-model';

const ROSTER = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Ava Lind' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Eli Brandt' }];
const base = emptyBody('Lakeside', ROSTER.map((r) => r.id), false);
const data: ChBuilderData = {
  planId: 'plan-1',
  teamId: 'team-1',
  eventId: 'event-1',
  version: 4,
  status: 'draft',
  edited: false,
  title: 'Thursday practice',
  meta: 'Thu, Nov 5 · 2:00 to 5:00 PM',
  dayWord: 'Thursday',
  start: '2026-11-05T19:00:00Z',
  end: '2026-11-05T22:00:00Z',
  zone: 'America/New_York',
  team: 'Demo',
  coaches: ['Coach Lin'],
  roster: ROSTER,
  body: addBlock(base, makeBlock('team', base, 't')),
  why: {},
  step: 'review',
  drills: [],
  helperOn: false,
  facts: [],
};
const show = (preview?: BuilderPreview) =>
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <ToastProvider>
          <Builder data={data} preview={preview} />
        </ToastProvider>
      </div>
    </LazyMotion>,
  );

beforeEach(() => {
  room.phone = false;
  nav.push.mockClear();
  autosave.state = { status: 'failed', error: { code: 'CH-17104', message: 'A block names a group that isn’t in this plan.' }, unsaved: true };
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Coach audit 13 Nov: the head said only "Couldn't save", and Back left a failed save with no word, losing the block and groups. */
describe('a failed save in the builder', () => {
  it('says why in the head', () => {
    show();
    expect(screen.getByRole('status').textContent).toContain('Couldn’t save: A block names a group that isn’t in this plan.');
  });

  it('asks before Back leaves edits that did not save, and leaves on Leave', async () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: /Practice/ })[0]!);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy());
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/golf/dashboard/practice'));
  });

  it('leaves at once when everything saved', async () => {
    autosave.state = { status: 'saved', error: null, unsaved: false };
    show();
    fireEvent.click(screen.getAllByRole('button', { name: /Practice/ })[0]!);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/golf/dashboard/practice'));
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull();
  });
});

/** Coach audit 13 Nov, §5 #3b: CoachHelm's suggested blocks vanished when the coach left without keeping them, with no word. */
describe('un-kept CoachHelm suggestions', () => {
  beforeEach(() => {
    autosave.state = { status: 'saved', error: null, unsaved: false };
  });
  it('Back asks before leaving them, and stays on Cancel', async () => {
    show({ ghosts: PT_PLAN });
    fireEvent.click(screen.getAllByRole('button', { name: /Practice/ })[0]!);
    const ask = await screen.findByRole('dialog', { name: 'Leave without keeping the suggestions?' });
    expect(ask.textContent).toMatch(/CoachHelm’s \d+ suggestions aren’t in the plan/);
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Leave without keeping the suggestions?' })).toBeNull());
    expect(nav.push).not.toHaveBeenCalled();
  });
  it('leaves at once once they are kept', async () => {
    show({ ghosts: PT_PLAN, kept: true });
    fireEvent.click(screen.getAllByRole('button', { name: /Practice/ })[0]!);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/golf/dashboard/practice'));
  });
  it('one question names both when edits also did not save', async () => {
    autosave.state = { status: 'failed', error: { code: 'CH-13080', message: 'The connection dropped.' }, unsaved: true };
    show({ ghosts: PT_PLAN });
    fireEvent.click(screen.getAllByRole('button', { name: /Practice/ })[0]!);
    const ask = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(ask.textContent).toContain('Your latest changes haven’t saved.');
    expect(ask.textContent).toMatch(/suggestions aren’t in the plan/);
    expect(screen.getAllByRole('dialog').filter((d) => d.hasAttribute('open'))).toHaveLength(1);
  });
});
