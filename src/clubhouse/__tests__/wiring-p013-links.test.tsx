import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P013 wiring pass (2026-10-17): links CoachHelm draws, checked against where production sends the same control.
 *
 * - Ask's receipt chips and pulse findings carry the chat engine's own (Fairway) addresses. Production links them; Clubhouse
 *   drew a moved address (/tasks, /announcements, /intelligence) as plain text. They now open the Clubhouse screen the
 *   address's own alias redirect opens.
 * - The Game profile's "What CoachHelm sees" rows were a plain anchor (a full reload of the app); they were made a client link,
 *   and went with the Game profile when it folded into Standing (its How you play section draws no such rows).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));
// Marks a client link so a plain anchor and next/link can be told apart.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));

import { askLinkHref } from '../data/coachhelm-chat-links';
import { AskReceiptCard } from '../screens/coachhelm/chat/ActionCard';

afterEach(cleanup);

const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);

describe('askLinkHref: the chat engine’s addresses, opened in Clubhouse for a coach', () => {
  it('a moved address opens the screen its alias redirect opens, in one step', () => {
    expect(askLinkHref('/golf/dashboard/tasks')).toBe('/golf/dashboard/team-hub?tab=tasks');
    expect(askLinkHref('/golf/dashboard/tasks?task=t-1')).toBe('/golf/dashboard/team-hub?tab=tasks&task=t-1');
    expect(askLinkHref('/golf/dashboard/announcements')).toBe('/golf/dashboard/team-hub?tab=ann');
    expect(askLinkHref('/golf/dashboard/intelligence?view=players')).toBe('/golf/dashboard/coachhelm');
    expect(askLinkHref('/golf/dashboard/intelligence?view=signals')).toBe('/golf/dashboard/coachhelm');
    expect(askLinkHref('/golf/dashboard/intelligence?view=chat')).toBe('/golf/dashboard/coachhelm?view=ask');
    expect(askLinkHref('/golf/dashboard/intelligence?player=p-1&view=players')).toBe('/golf/dashboard/coachhelm?player=p-1');
  });

  it('a rebuilt address is kept as it is, and one with no Clubhouse screen for a coach is no link', () => {
    expect(askLinkHref('/golf/dashboard/calendar')).toBe('/golf/dashboard/calendar');
    expect(askLinkHref('/golf/dashboard/roster')).toBe('/golf/dashboard/roster');
    expect(askLinkHref('/golf/dashboard/scouting')).toBeNull();
    // An id that is not one is dropped, never carried into the address.
    expect(askLinkHref('/golf/dashboard/tasks?task=a%20b')).toBe('/golf/dashboard/team-hub?tab=tasks');
  });

  it('every address the chat engine writes into a receipt or a pulse item opens a Clubhouse screen (a guard on the engine’s source)', () => {
    const files = ['action-planners.ts', 'practice-planner.ts', 'program-pulse.ts'].map((f) => readFileSync(`src/lib/coachhelm/v3/chat/${f}`, 'utf8'));
    const hrefs = [...new Set(files.flatMap((src) => [...src.matchAll(/href:\s*['`](\/golf\/dashboard[^'`]*)['`]/g)].map((m) => m[1]!)))];
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) expect([href, askLinkHref(href)]).toEqual([href, expect.stringMatching(/^\/golf\/dashboard/)]);
  });
});

describe('Ask’s receipt chips', () => {
  it('a created task is a link to Team Hub’s Tasks, as production’s chip links to Tasks; an announcement to its tab', () => {
    render(
      wrap(
        <AskReceiptCard
          onAskAgain={vi.fn()}
          receipt={{
            status: 'completed',
            action: 'Assign a task',
            summary: 'Assigned to 3 players',
            created: [
              { kind: 'task', count: 1, href: '/golf/dashboard/tasks', label: 'Putting ladder' },
              { kind: 'announcement', count: 1, href: '/golf/dashboard/announcements' },
              { kind: 'note', count: 2 },
            ],
            notifications: [],
            partial_failures: [],
            retryable: false,
            at: '2026-10-17T12:00:00.000Z',
          }}
        />,
      ),
    );
    const card = screen.getByRole('region', { name: 'Assign a task, completed' });
    const links = within(card).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['1 task', '/golf/dashboard/team-hub?tab=tasks'],
      ['1 announcement', '/golf/dashboard/team-hub?tab=ann'],
    ]);
    // No address, no link: the count is text.
    expect(within(card).getByText('2 notes').tagName).toBe('SPAN');
  });
});
