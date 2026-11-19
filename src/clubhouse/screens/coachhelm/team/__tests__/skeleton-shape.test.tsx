import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../../../lib/use-phone', async (orig) => ({ ...(await orig<object>()), useChPhone: () => phone.on }));

import { TEAM_BOARD_DESK_SLOTS, TEAM_BOARD_PHONE_SLOTS, TeamBoardSkeleton } from '../TeamBoardSkeleton';
import { YOUR_WEEK_DESK_COLUMNS, YOUR_WEEK_PHONE_ORDER, YourWeekSkeleton } from '../../file/YourWeekSkeleton';

const src = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse/screens/coachhelm', p), 'utf8');
/** The order the names first appear in a slice of source, so a reordered page fails here until its skeleton follows. */
const orderIn = (text: string, names: Record<string, string>) =>
  Object.entries(names)
    .map(([slot, needle]) => ({ slot, at: text.indexOf(needle) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.slot);

const BOARD_NEEDLES = { hole: '<Hero ', spot: '{spot}', today: '{today}', work: '{working}', huddle: '{huddle}', roster: '{roster}', record: '{record}' };

describe('CoachHelm loads in one shape: each skeleton is the page it stands for, in its order', () => {
  it('the Team page in waiting is the board’s desk grid, its cards in the board’s order', () => {
    phone.on = false;
    const { container } = render(<TeamBoardSkeleton />);
    const main = container.querySelector('main.ch-htb.is-desk')!;
    expect(main.getAttribute('aria-label')).toBe('Loading Team view');
    expect(main.getAttribute('data-ch-arrive')).toBe('crossfade');
    expect(main.querySelectorAll('.dgrid > .dcol')).toHaveLength(2);
    expect([...main.querySelectorAll('[data-ch-team-wait]')].map((n) => n.getAttribute('data-ch-team-wait'))).toEqual([...TEAM_BOARD_DESK_SLOTS]);
    // Never the board's own mark: the board queries data-ch-team-card (the Working on scroll).
    expect(main.querySelector('[data-ch-team-card]')).toBeNull();
    const board = src('team/TeamBoard.tsx');
    const desk = board.slice(board.indexOf('<div className="dgrid">', board.indexOf('} else if (phone) {')));
    expect(orderIn(desk.slice(0, desk.indexOf('</div>\n    );')), BOARD_NEEDLES)).toEqual([...TEAM_BOARD_DESK_SLOTS]);
  });

  it('on a phone, the board’s stack order, the hole at its loaded height (TEAM-28)', () => {
    phone.on = true;
    const { container } = render(<TeamBoardSkeleton />);
    const slots = [...container.querySelectorAll('[data-ch-team-wait]')].map((n) => n.getAttribute('data-ch-team-wait'));
    // The skeleton draws the phone's first five cards; the rest are below the fold.
    expect(slots).toEqual(TEAM_BOARD_PHONE_SLOTS.slice(0, slots.length));
    const board = src('team/TeamBoard.tsx');
    const stack = board.slice(board.indexOf('} else if (phone) {'), board.indexOf('} else {', board.indexOf('} else if (phone) {')));
    expect(orderIn(stack, BOARD_NEEDLES)).toEqual([...TEAM_BOARD_PHONE_SLOTS]);
    phone.on = false;
  });

  it('the route’s Suspense draws it chained, so its blocks do not wait the busy delay a second time', () => {
    const { container } = render(<TeamBoardSkeleton chained />);
    expect(container.querySelector('main')!.getAttribute('data-skel')).toBe('chained');
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
    expect(css).toMatch(/\.ch-htb\[data-skel='chained'\] \.skl,\s*\.ch-htb:not\(\[aria-busy='true'\]\) \[data-ch-team-wait\] \.skl \{\s*animation: none;/);
  });

  it('Your week in waiting is the week’s frame and two columns, its cards in the week’s order', () => {
    phone.on = false;
    const { container } = render(<YourWeekSkeleton />);
    const main = container.querySelector('main.ch-hf.is-desk')!;
    expect(main.getAttribute('data-ch-wait')).toBe('your-week');
    expect(main.querySelector('.dfile > header.ch-hl-h[data-canopy-head="tight"]')).not.toBeNull();
    expect(main.querySelectorAll('.ch-hf-flow > .grid2 > .col')).toHaveLength(2);
    const week = src('file/YourWeek.tsx');
    // The week's own columns: `left` and `right`, the analyst read first on the left when it is on (no skeleton: it is flagged).
    expect(week).toMatch(/const left = \[ownCard, feat, planCard, sgCard\];/);
    expect(week).toMatch(/const right = \[<WorkingCard key="w"[^\n]*, fieldCard, <ReadsCard key="r"/);
    expect(YOUR_WEEK_DESK_COLUMNS).toEqual([
      ['feat', 'plan', 'sg'],
      ['w', 'f', 'r'],
    ]);
    const stack = week.slice(week.indexOf(') : phone ? ('), week.indexOf('<div className="grid2">'));
    expect(orderIn(stack, { feat: '{feat}', w: '<WorkingCard', plan: '{planCard}', f: '{fieldCard}', sg: '{sgCard}', r: '<ReadsCard' })).toEqual([...YOUR_WEEK_PHONE_ORDER]);
  });
});
