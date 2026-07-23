/**
 * ============================================================================
 * ActionItemsPanel — header-count / render coherence (W1 audit)
 * ----------------------------------------------------------------------------
 * Regression coverage for the count-contradiction finding: the "Action Items"
 * header badge showed the FULL `items.length` while the list below it only
 * ever rendered `items.slice(0, 6)` — on any team with more than 6 open items
 * the header disagreed with what the coach could actually see (the same
 * `enhancedData.actionItems` array also fed the coach dashboard's "N items
 * need you" hero at the time, coach-signal.ts — since removed as intentional
 * product direction; see attention-queue.ts). The fix renders the full list
 * so the badge always describes exactly what's on screen.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ActionItemsPanel } from './FairwayCoachDashboard';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

function makeItems(count: number): ActionItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    type: 'task' as const,
    title: `Task ${i}`,
    date: '2026-07-01',
  }));
}

describe('ActionItemsPanel — count/render coherence', () => {
  it('renders every item the header badge counts (9 items → 9 rows, not slice(0, 6))', () => {
    render(<ActionItemsPanel items={makeItems(9)} />);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    // The header badge must equal the number of rows actually rendered.
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('matches header count to render count for a small list too (no off-by-default assumptions)', () => {
    render(<ActionItemsPanel items={makeItems(3)} />);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the honest empty state (no badge) when there are no action items', () => {
    render(<ActionItemsPanel items={[]} />);

    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * ActionItemsPanel — announcements are separated, never counted as backlog
 * ----------------------------------------------------------------------------
 * Attention model: the "Action Items" badge counts ACTIONABLE work only (tasks
 * + deadlines). Announcements have no accept/resolve step, so they render in a
 * clearly-labelled, separately-counted "Announcements" strip and must never
 * inflate the actionable badge.
 * ========================================================================== */
describe('ActionItemsPanel — announcements are informational, not backlog', () => {
  function mixed(): ActionItem[] {
    return [
      { id: 't1', type: 'task', title: 'Task one', date: '2026-07-01' },
      { id: 't2', type: 'deadline', title: 'Deadline two', date: '2026-07-01', overdue: true },
      { id: 'a1', type: 'announcement', title: 'Bus leaves at 6am', date: '2026-07-01' },
    ];
  }

  it('badge counts only actionable items, not announcements', () => {
    render(<ActionItemsPanel items={mixed()} />);
    // 2 actionable (task + deadline), announcement excluded from the badge.
    const heading = screen.getByRole('heading', { name: 'Action Items' });
    const headerRow = heading.parentElement!;
    expect(within(headerRow).getByText('2')).toBeInTheDocument();
    expect(within(headerRow).queryByText('3')).not.toBeInTheDocument();
  });

  it('renders announcements under their own labelled, separately-counted strip', () => {
    render(<ActionItemsPanel items={mixed()} />);
    const strip = screen.getByRole('region', { name: 'Announcements' });
    expect(within(strip).getByText('Bus leaves at 6am')).toBeInTheDocument();
    expect(within(strip).getByText('1')).toBeInTheDocument();
    // The announcement must NOT appear in the actionable list.
    expect(within(strip).queryByText('Task one')).not.toBeInTheDocument();
  });

  it('an announcement-only payload does not show "All caught up" as if idle', () => {
    render(
      <ActionItemsPanel
        items={[{ id: 'a1', type: 'announcement', title: 'Team photo Friday', date: '2026-07-01' }]}
      />,
    );
    // No actionable backlog badge, honest "no tasks" note, announcement shown.
    expect(screen.getByText('No tasks or deadlines waiting')).toBeInTheDocument();
    expect(screen.getByText('Team photo Friday')).toBeInTheDocument();
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * ActionItemsPanel — row sized by container, not by content length (audit W2)
 * ----------------------------------------------------------------------------
 * Regression guard for the "task-preview rows measure wider than the 390px
 * viewport (offscreenX=true)" finding: a long task title ("Complete Swing
 * Mechanics Self-Assessment Video", 41 chars) was previously sized by its own
 * content instead of its row, so it rendered up to 437px wide on a 390px
 * viewport with no wrap/ellipsis. The fix (already shipped, #957) chains
 * `min-w-0` through every flex/grid boundary the title sits inside — `<li>` →
 * `<Inset>` → the title's own flex column. jsdom has no layout engine, so this
 * can't assert a literal pixel width; it asserts the class-level contract that
 * makes that width impossible in a real browser.
 *
 * audit #47 (round 2): the title's OWN clipping used to be a single-line
 * `truncate`, which on a narrow mobile width was observed cutting mid-word
 * with no ellipsis affordance (the span sits directly inside a row that also
 * wraps its date/badge line beneath it, so the clip landed silently). The
 * title now wraps at word boundaries (`whitespace-normal break-words`) and
 * caps at two lines with a real ellipsis (`line-clamp-2`) instead of a bare
 * single-line `truncate` — never a mid-word cut with no affordance.
 * ========================================================================== */
describe('ActionItemsPanel — long titles are sized by their row, not their content', () => {
  it('wraps a long task title at word boundaries and clamps to 2 lines, never a bare mid-word truncate', () => {
    const longTitle = 'Complete Swing Mechanics Self-Assessment Video';
    render(
      <ActionItemsPanel
        items={[{ id: 'long-1', type: 'task', title: longTitle, date: '2026-06-13', overdue: true }]}
      />,
    );

    const title = screen.getByText(longTitle);
    // `whitespace-normal` (wraps at word boundaries, the opposite of the old
    // single-line `truncate`'s `white-space: nowrap`) + `break-words` (only
    // breaks mid-word as a last resort, never by default) + `line-clamp-2`
    // (a real ellipsis if it's still too long after wrapping).
    expect(title.className).toMatch(/\bwhitespace-normal\b/);
    expect(title.className).toMatch(/\bbreak-words\b/);
    expect(title.className).toMatch(/\bline-clamp-2\b/);
    // The old single-line-only contract must be gone.
    expect(title.className).not.toMatch(/\btruncate\b/);
  });

  it('chains min-w-0 from the <li> down to the title\'s own flex column (the floor line-clamp needs to bite)', () => {
    const longTitle = 'Submit Spring Invitational Travel Preferences Form';
    render(
      <ActionItemsPanel items={[{ id: 'long-2', type: 'task', title: longTitle, date: '2026-06-11' }]}
      />,
    );

    const title = screen.getByText(longTitle);
    const listItem = title.closest('li');
    expect(listItem).not.toBeNull();
    expect(listItem!.className).toMatch(/\bmin-w-0\b/);

    // The title's direct flex wrapper (icon-adjacent column) must also carry
    // min-w-0 + flex-1 — without it, the title span has no shrinkable
    // ancestor to wrap/clamp against and silently renders at full content
    // width instead.
    const flexColumn = title.parentElement;
    expect(flexColumn).not.toBeNull();
    expect(flexColumn!.className).toMatch(/\bmin-w-0\b/);
    expect(flexColumn!.className).toMatch(/\bflex-1\b/);
  });
});
