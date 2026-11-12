import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Port of 7b47e7559a: a coach who opens a round from Team rounds sees "Rounds" on the review's Back on the first paint,
 * reload included. The note of where they came from is in session storage, which a server render cannot read, so Team
 * rounds' link says it too (`?from=rounds`), the route hands it on, and the server render and its hydration agree.
 */
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds/x' }));

import { PREVIEW_REVIEW_COACH } from '../../../preview/fixtures-round-review';
import { ToastProvider } from '../../../ui/Toast';
import { RoundReview } from '../RoundReview';
import { teamRoundsLinks } from '../TeamRounds';

/** The desktop Back link of a server render: its words and where it goes. */
function serverBack(fromRounds: boolean): [string, string] {
  const html = renderToString(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <RoundReview review={PREVIEW_REVIEW_COACH} fromRounds={fromRounds} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  const a = /<a[^>]*class="ch-rv-back"[^>]*>[\s\S]*?<\/a>/.exec(html)?.[0] ?? '';
  return [a.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim(), /href="([^"]*)"/.exec(a)?.[1]?.replace(/&amp;/g, '&') ?? ''];
}

describe('a round opened from Team rounds names its Back on the first paint (port of 7b47e7559a)', () => {
  it('Team rounds’ link to a review says where it came from', () => {
    const id = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
    expect(teamRoundsLinks.review(id)).toBe(`/golf/dashboard/rounds/${id}?from=rounds`);
  });

  it('the server render of a coach’s review reads Rounds with it, and the player’s Stats without it', () => {
    expect(serverBack(true)).toEqual(['Rounds', '/golf/dashboard/rounds']);
    expect(serverBack(false)).toEqual([PREVIEW_REVIEW_COACH.playerName, `/golf/dashboard/stats?player=${PREVIEW_REVIEW_COACH.playerId}&tab=rounds`]);
  });

  it('the dashboard route reads ?from=rounds and hands it to the review', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx'), 'utf8');
    expect(page).toContain("fromRounds={query?.from === 'rounds'} />");
    const route = readFileSync(join(process.cwd(), 'src/clubhouse/routes/round-review.tsx'), 'utf8');
    expect(route).toContain('fromRounds={fromRounds} />');
  });
});
