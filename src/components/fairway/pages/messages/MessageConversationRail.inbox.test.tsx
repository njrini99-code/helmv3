// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageConversationRail — the inbox reads as a list, not as a sort order
 * ----------------------------------------------------------------------------
 * Three properties of the approved Messages design, each of which a refactor
 * could quietly undo because none of them is expressed as a prop:
 *
 *   1. UNREAD LIFTS. An unread row is a card on the champagne (`bg-surface` +
 *      the lit `shadow-fw-card`); a read row has no surface of its own. If both
 *      tiers gained a surface, or the unread one lost it, the rail would still
 *      render and still be wrong — the distinction is the entire signal.
 *   2. UNREAD NO LONGER RE-SORTS THE LIST. The rail used to hoist unread
 *      conversations into a block above the recency groups, so a thread moved
 *      position when it went unread. Chronology now holds and the row carries
 *      the state.
 *   3. THE SCOPE PILLS ACTUALLY SCOPE. Unread/Groups are the triage that the
 *      permanent hoist used to impose.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageConversationRail } from './MessageConversationRail';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

const NOW = new Date();

function conv(over: Partial<GolfConversationWithMeta> & { id: string }): GolfConversationWithMeta {
  return {
    title: null,
    is_group: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    unread_count: 0,
    last_message: {
      id: `m-${over.id}`,
      content: 'the last thing said',
      created_at: NOW.toISOString(),
      sender_id: 'u2',
    },
    other_participant: {
      id: 'u2',
      name: 'Cole Bennett',
      avatar: null,
      subtitle: 'Class of 2027',
      type: 'player',
    },
    // Spread LAST so `id` and every override actually win. Spreading it first
    // and then restating `id: over.id` is the TS2783 shape where the later
    // literal silently overwrites the caller — here it happened to agree, which
    // is exactly why it would have gone unnoticed.
    ...over,
  } as GolfConversationWithMeta;
}

/**
 * The rendered LIST row for a conversation.
 *
 * Matched on the row's own button rather than on the name text, because the
 * name also appears inside `Avatar` (as its accessible fallback) and, when the
 * Recent rail is showing, on that tile too — so a bare `getByText` finds
 * several nodes for one conversation.
 */
function rowFor(name: string): HTMLElement {
  const rows = screen
    .getAllByRole('button')
    .filter((b) => b.textContent?.includes('the last thing said') && b.textContent?.includes(name));
  expect(rows, `expected exactly one list row for "${name}"`).toHaveLength(1);
  return rows[0] as HTMLElement;
}

describe('MessageConversationRail — every row is a surface, unread is an edge', () => {
  it('lifts EVERY row onto the lit card, and marks unread with an accent edge', () => {
    render(
      <MessageConversationRail
        conversations={[
          conv({ id: 'a', unread_count: 3 }),
          conv({ id: 'b', other_participant: { id: 'u3', name: 'Alexis Bennett', avatar: null, subtitle: '', type: 'player' } }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const unread = rowFor('Cole Bennett').className;
    const read = rowFor('Alexis Bennett').className;

    // BOTH rows are cards: the cream fill AND the lit-from-above shadow.
    // `shadow-flat` would render the same geometry without the inset specular
    // that makes it read as lifted, so the token name is asserted, not "a
    // shadow is present".
    //
    // This assertion was the inverse until the design was seen on a real
    // account: read rows had NO surface, on the reasoning that "if both tiers
    // are cards the lift says nothing". An inbox someone keeps up with is
    // entirely read, and the screen went completely flat — the structure
    // existed only in the state the user is trying to eliminate.
    for (const row of [unread, read]) {
      expect(row).toContain('bg-surface');
      expect(row).toContain('shadow-fw-card');
    }

    // The distinction moved to a channel that costs no depth. If unread ever
    // stops carrying its own edge, the two tiers become indistinguishable —
    // that is the failure this now pins.
    expect(unread).toContain('ring-accent-500/30');
    expect(read).not.toContain('ring-accent-500/30');
  });

  it('does not hoist unread conversations above the recency groups', () => {
    render(
      <MessageConversationRail
        conversations={[
          conv({ id: 'a', other_participant: { id: 'u3', name: 'Alexis Bennett', avatar: null, subtitle: '', type: 'player' } }),
          conv({ id: 'b', unread_count: 2 }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    // No separate "Unread" section heading — the pill is the triage now.
    // `getAllByText` because "Unread" is also the scope pill's label.
    const headings = screen.getAllByText('Unread');
    expect(headings.some((el) => el.tagName === 'P')).toBe(false);

    // And the hook's order survives: the read conversation came first and
    // still is first, even though the other one is unread.
    const rows = screen.getAllByRole('button').filter((b) => b.textContent?.includes('the last thing said'));
    expect(rows[0]?.textContent).toContain('Alexis Bennett');
  });

  it('scopes the list to unread when the Unread pill is pressed, and back again', async () => {
    const user = userEvent.setup();
    render(
      <MessageConversationRail
        conversations={[
          conv({ id: 'a', unread_count: 1 }),
          conv({ id: 'b', other_participant: { id: 'u3', name: 'Alexis Bennett', avatar: null, subtitle: '', type: 'player' } }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const pill = screen.getByRole('button', { name: /^Unread/ });
    expect(pill).toHaveAttribute('aria-pressed', 'false');

    await user.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Alexis Bennett')).toBeNull();
    expect(rowFor('Cole Bennett')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(rowFor('Alexis Bennett')).toBeInTheDocument();
  });

  it('says so when a scope matches nothing, instead of going blank like a failed load', async () => {
    const user = userEvent.setup();
    render(
      <MessageConversationRail
        conversations={[conv({ id: 'a' })]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(screen.getByText('Nothing unread')).toBeInTheDocument();
  });

  it('opens the compose sheet from the scope row, which is where the design puts it', async () => {
    const user = userEvent.setup();
    const onNewMessage = vi.fn();
    render(
      <MessageConversationRail
        conversations={[conv({ id: 'a' })]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={onNewMessage}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(onNewMessage).toHaveBeenCalledTimes(1);
  });
});

describe('MessageConversationRail — the Recent rail claims only what it knows', () => {
  it('stays hidden below three 1:1 conversations, where "the people you message" is not a claim', () => {
    const { container } = render(
      <MessageConversationRail
        conversations={[conv({ id: 'a' }), conv({ id: 'b' })]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );
    expect(within(container).queryByText('Recent')).toBeNull();
  });

  it('shows it at three, and never labels it "Pinned" — nothing in the schema is pinned', () => {
    render(
      <MessageConversationRail
        conversations={[conv({ id: 'a' }), conv({ id: 'b' }), conv({ id: 'c' })]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.queryByText('Pinned')).toBeNull();
  });

  it('excludes groups — five identical group glyphs in a row identify nobody', () => {
    render(
      <MessageConversationRail
        conversations={[
          conv({ id: 'a' }),
          conv({ id: 'b' }),
          conv({ id: 'c', is_group: true, title: 'Travel — Kiawah', participant_count: 9 }),
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );
    // Three conversations, but only two of them are people, so the rail is
    // below its threshold and does not render.
    expect(screen.queryByText('Recent')).toBeNull();
  });
});
