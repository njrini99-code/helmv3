// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageConversationRail.tsx — the inbox's section set and its ONE row fill
 * ----------------------------------------------------------------------------
 * Two defects measured in a real browser at 390×844 against
 * `audit/reference/Main.dc.html`, with a six-conversation fixture:
 *
 *   1. OVER-SEGMENTATION. The rail split the list into an Unread bucket plus
 *      FOUR recency buckets (Today / Yesterday / This Week / Earlier), so six
 *      conversations printed five section headers — a label for nearly every
 *      row. The artboard labels exactly two sections, TODAY and EARLIER, for
 *      seven rows. It also ran time backwards on screen: an unread row stamped
 *      "Yesterday" sat above a section headed TODAY.
 *
 *   2. A FALSE SELECTED ROW ON A PHONE. The page auto-selects the first
 *      conversation on load. A phone hides the rail entirely once a thread is
 *      open, so on a phone `selectedId` describes nothing visible — yet its row
 *      still painted `bg-surface-sunken/90` + an accent ring. That is the only
 *      fill a READ row could receive, so it broke the artboard's single list
 *      contrast (unread lifts on a card, read lies flat) with a third material,
 *      and it collapsed against the search well's identical `surface-sunken`
 *      fill — the rendered evidence M03A F06 asked for.
 *
 * Both are locked here as behaviour, not as source strings.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MessageConversationRail } from './MessageConversationRail';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

/** jsdom has no matchMedia; useMediaQuery reads it. `desktop` drives the gate. */
function stubMatchMedia(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * The fixture below is anchored to THIS instant, not to the wall clock.
 *
 * Its two "today" read rows are `hoursAgo(5)` and `hoursAgo(7)`, which only
 * land on today when the clock is already 8+ hours past local midnight. Read
 * off the real `Date.now()`, the suite therefore passed all afternoon and
 * failed on any run between midnight and ~07:00 — CI runs UTC, so a 03:18
 * UTC run put both rows in yesterday, the Today section never rendered, and
 * the section-set assertion failed on code nobody had touched.
 *
 * The anchor is midday LOCAL, not midday UTC. The rail buckets by local
 * calendar day, so a UTC anchor only moves the bug: at UTC+13 midday UTC is
 * 01:00 the next local day and the 5/7-hour rows fall back into yesterday
 * again. Local midday leaves every offset in the fixture inside the same
 * local day in every timezone. `vi.setSystemTime` in `beforeEach` moves the
 * component's own clock to match, so the rail buckets against the same NOW
 * the rows were built from.
 */
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

function conv(
  id: string,
  name: string,
  unread: number,
  createdAt: string,
): GolfConversationWithMeta {
  return {
    id,
    is_group: false,
    title: null,
    unread_count: unread,
    other_participant: { id: `u-${id}`, name, avatar: null },
    last_message: { content: `msg from ${name}`, created_at: createdAt },
  } as unknown as GolfConversationWithMeta;
}

/**
 * The measured fixture: two unread (one today, one yesterday) and four read
 * spread across today, this week and a fortnight ago — the shape that printed
 * five headers before the collapse.
 */
const FIXTURE: GolfConversationWithMeta[] = [
  conv('c1', 'Alexis Bennett', 2, hoursAgo(2)),
  conv('c2', 'Maya Torres', 1, daysAgo(1)),
  conv('c3', 'Kiawah Trip', 0, hoursAgo(5)),
  conv('c4', 'Jordan Rivera', 0, hoursAgo(7)),
  conv('c5', 'Sam Okafor', 0, daysAgo(3)),
  conv('c6', 'Qualifier Week', 0, daysAgo(10)),
];

/** Every eyebrow section label the rail rendered, in document order. */
function sectionLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('p'))
    .map((p) => p.textContent?.trim() ?? '')
    .filter((t) => ['Unread', 'Today', 'Yesterday', 'This Week', 'Earlier'].includes(t));
}

describe('MessageConversationRail — section set matches the artboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    stubMatchMedia(false);
  });
  afterEach(() => vi.useRealTimers());

  it('labels at most three sections — Unread, Today, Earlier — never the legacy four recency buckets', () => {
    const { container } = render(
      <MessageConversationRail
        conversations={FIXTURE}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const labels = sectionLabels(container);

    // The artboard's set (Main.dc.html:61,111) plus the rail's own Unread bucket.
    expect(labels).toEqual(['Unread', 'Today', 'Earlier']);

    // The two buckets the collapse removed must not come back.
    expect(labels).not.toContain('Yesterday');
    expect(labels).not.toContain('This Week');
  });

  it('prints fewer section headers than it has conversations — the over-segmentation guard', () => {
    const { container } = render(
      <MessageConversationRail
        conversations={FIXTURE}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const rows = container.querySelectorAll('li button');
    expect(rows).toHaveLength(FIXTURE.length);
    // Six rows used to carry FIVE labels. A list whose headers approach its row
    // count has stopped being a list and become a stack of bands. At most one
    // header per two rows; on this fixture that is 3, down from 5.
    expect(sectionLabels(container).length).toBeLessThanOrEqual(rows.length / 2);
  });

  it('renders every conversation exactly once across the collapsed buckets', () => {
    const { container } = render(
      <MessageConversationRail
        conversations={FIXTURE}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const names = Array.from(container.querySelectorAll('li button')).map(
      (b) => (b as HTMLElement).innerText || b.textContent || '',
    );
    for (const c of FIXTURE) {
      const name = c.other_participant?.name ?? '';
      expect(names.filter((n) => n.includes(name))).toHaveLength(1);
    }
  });
});

describe('MessageConversationRail — no selected fill on a phone', () => {
  it('does not mark any row current when a phone renders the list', () => {
    stubMatchMedia(false);
    const { container } = render(
      <MessageConversationRail
        conversations={FIXTURE}
        // The page auto-selects the first conversation on load; on a phone the
        // rail is only ever visible when NO thread is open.
        selectedId="c3"
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
  });

  it('still marks the open conversation current at desktop width, where the thread sits beside it', () => {
    stubMatchMedia(true);
    const { container } = render(
      <MessageConversationRail
        conversations={FIXTURE}
        selectedId="c3"
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect((current[0] as HTMLElement).textContent).toContain('Kiawah Trip');
  });
});
