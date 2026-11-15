import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const room = vi.hoisted(() => ({ phone: false }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: vi.fn(), deletePracticePlan: vi.fn(), copyPlanBody: vi.fn(), recordPracticePlanOpen: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ savePracticePlanDraft: vi.fn(), undoPracticePlanDraft: vi.fn(), listPlanFolders: async () => ({ folders: [] }) }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: vi.fn() }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn() }));
vi.mock('@/components/golf/coachhelm/chat/useCoachHelmChat', () => ({ useCoachHelmChat: () => ({ messages: [], busy: false, error: undefined, send: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/practice', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => room.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));

import type { ChBuilderData } from '../../../../data/practice-home-shape';
import { ToastProvider } from '../../../../ui/Toast';
import { Builder } from '../Builder';
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
const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <ToastProvider>
          <Builder data={data} />
        </ToastProvider>
      </div>
    </LazyMotion>,
  );

beforeEach(() => {
  room.phone = false;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** One primary action a screen: Review used to draw Publish in the head and again in its own strip on a Mac. */
describe('the builder’s Review step has one Publish key', () => {
  it('on a Mac it is the head’s: Review’s strip keeps Print and Delete draft only', () => {
    show();
    const publish = screen.getAllByRole('button', { name: 'Publish' });
    expect(publish).toHaveLength(1);
    expect(publish[0]!.closest('.ch-prb-head')).not.toBeNull();
    const strip = screen.getByRole('region', { name: 'Before you publish' });
    expect(within(strip).getAllByRole('button').map((b) => b.textContent)).toEqual(['Print', 'Delete draft']);
  });
  it('on a phone there is no head, so it is the strip’s', () => {
    room.phone = true;
    show();
    const publish = screen.getAllByRole('button', { name: 'Publish' });
    expect(publish).toHaveLength(1);
    expect(publish[0]!.closest('.ch-prc-strip')).not.toBeNull();
  });
});
