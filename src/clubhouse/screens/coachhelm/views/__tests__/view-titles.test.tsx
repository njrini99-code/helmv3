import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Each CoachHelm sub-page names itself, once (G5, G12; preview grading 12 Nov, "one title per screen"). Standing and the Deep dive
 * were titled "CoachHelm" under the strip's "Standing" or "Deep dive", with a lone double rule over the title on the phone; the
 * Track record and the Monday brief opened with a "Coach" eyebrow, then the title, under the same lone rule.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));

import { diveLoad, PREVIEW_DIVE, PREVIEW_STANDING, standingLoad } from '../../../../preview/fixtures-coachhelm-views';
import { PREVIEW_TRACK_RECORD, trackLoad } from '../../../../preview/fixtures-coachhelm-track';
import { PREVIEW_MONDAY_BRIEF } from '../../../../preview/fixtures-coachhelm-brief';
import { ToastProvider } from '../../../../ui/Toast';
import { DeepDive } from '../DeepDive';
import { MondayBrief } from '../MondayBrief';
import { DiveSkeleton, StandingSkeleton } from '../Skeletons';
import { Standing } from '../Standing';
import { TrackRecord } from '../TrackRecord';

const wrap = (node: React.ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

const head = () => document.querySelector('main > header.ch-hl-h') as HTMLElement;

beforeEach(() => {
  phoneState.on = false;
});
afterEach(cleanup);

describe('a player’s Standing and Deep dive title themselves (G5, G12)', () => {
  const pages = [
    ['Standing', () => <Standing load={standingLoad(PREVIEW_STANDING)} />],
    ['Deep dive', () => <DeepDive load={diveLoad(PREVIEW_DIVE)} />],
  ] as const;

  it.each(pages)('%s: on a desk the h1 is the page’s own name, not "CoachHelm"', (name, page) => {
    wrap(page());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
  });

  it.each(pages)('%s: on the phone the large title is the page’s name, on the tight head (no rule over it)', (name, page) => {
    phoneState.on = true;
    wrap(page());
    expect(document.getElementById('ch-hl-title')!.textContent).toBe(name);
    expect(head().getAttribute('data-canopy-head')).toBe('tight');
  });

  it('their phone skeletons take the same tight head, so the title does not drop when the page lands', () => {
    phoneState.on = true;
    for (const skel of [<StandingSkeleton key="s" />, <DiveSkeleton key="d" />]) {
      wrap(skel);
      expect(head().getAttribute('data-canopy-head')).toBe('tight');
      cleanup();
    }
  });
});

describe('the Track record and the Monday brief open on one title (G12)', () => {
  const pages = [
    ['Track record', () => <TrackRecord load={trackLoad(PREVIEW_TRACK_RECORD)} />],
    ['Monday brief', () => <MondayBrief load={{ status: 'ready', data: PREVIEW_MONDAY_BRIEF }} />],
  ] as const;

  it.each(pages)('%s: no "Coach" eyebrow over the title; the desk keeps the coach’s full head', (name, page) => {
    wrap(page());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
    expect(document.querySelector('.ch-hl-role')).toBeNull();
    expect(head().getAttribute('data-canopy-head')).toBe('');
  });

  it.each(pages)('%s: on the phone the title opens the page on the tight head, with no eyebrow', (name, page) => {
    phoneState.on = true;
    wrap(page());
    expect(head().querySelector('.ch-hl-h__t')!.textContent).toBe(name);
    expect(document.querySelector('.ch-hl-role')).toBeNull();
    expect(head().getAttribute('data-canopy-head')).toBe('tight');
  });
});

describe('the phone’s tight CoachHelm head has no double rule', () => {
  it('coachhelm.css lifts the phone head’s rule and its padding on the tight head, inside the phone query', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm.css'), 'utf8');
    const phone = css.indexOf('@media (max-width: 820px), (max-height: 500px) and (pointer: coarse) {\n  .ch-hl.is-phone {');
    expect(phone).toBeGreaterThan(-1);
    const rule = css.indexOf(".ch-hl.is-phone > .ch-hl-h[data-canopy-head='tight'] {\n    padding-top: 0;\n    border-top: 0;\n  }");
    expect(rule).toBeGreaterThan(phone);
    // Still inside that block: no other media query opens between them.
    expect(css.slice(phone + 1, rule)).not.toMatch(/@media/);
  });
});
