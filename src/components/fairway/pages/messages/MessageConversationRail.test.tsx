// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageConversationRail.tsx — one zero-state widget, no duplicate numeral
 * ----------------------------------------------------------------------------
 * Regression coverage for #97/#105/#162:
 *   • #97/#105 — the empty inbox used to render an "awaiting signal — 0 of 1"
 *     Readout gauge stacked directly beside the honest "No conversations yet"
 *     EmptyState — two zero-state widgets disagreeing in the same card.
 *   • #162 — a populated inbox rendered a big standalone mono numeral
 *     ("CONVERSATION" / "1") in the rail's own panel bezel, duplicating the
 *     "1 conversation" line the page masthead already renders just above it.
 * The fix removes the rail's own count Readout entirely (the masthead is the
 * one place the count renders), so this locks: no `data-slot="readout"` node
 * ever renders inside the rail, in either state.
 * ========================================================================== */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessageConversationRail } from './MessageConversationRail';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

const groupAvatarMock = vi.hoisted(() => ({
  current: new Map<string, Array<{ name: string; avatar: string | null }>>(),
}));

vi.mock('@/hooks/golf/use-golf-group-avatars', () => ({
  useGolfGroupAvatars: () => groupAvatarMock.current,
}));

const source = readFileSync(
  join(process.cwd(), 'src/components/fairway/pages/messages/MessageConversationRail.tsx'),
  'utf8',
);
const searchResultStart = source.indexOf('function SearchResultRow');
const searchResultEnd = source.indexOf('export function MessageConversationRail');
const searchResultSource = source.slice(searchResultStart, searchResultEnd);
const conversationRowStart = source.indexOf('function ConversationRow');
const conversationRowSource = source.slice(conversationRowStart, searchResultStart);

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

afterEach(() => {
  groupAvatarMock.current = new Map();
});

const groupConversation = {
  id: 'group-travel',
  is_group: true,
  participant_count: 4,
  title: 'Tournament travel notes',
  unread_count: 0,
  last_message: {
    content: 'Rooming preferences are ready.',
    created_at: '2026-09-04T12:00:00.000Z',
  },
} as unknown as GolfConversationWithMeta;

describe('MessageConversationRail — no duplicate count readout', () => {
  it('renders exactly one zero-state widget when there are no conversations, with no Readout numeral', () => {
    const { container, getByText, queryByText } = render(
      <MessageConversationRail
        conversations={[]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
        loading={false}
        error={false}
      />,
    );

    // The single, honest zero-state widget.
    expect(getByText('No conversations yet')).toBeInTheDocument();

    // No second, contradictory zero gauge (the old "awaiting signal" Readout).
    expect(container.querySelector('[data-slot="readout"]')).toBeNull();
    expect(queryByText(/awaiting signal/i)).toBeNull();
    expect(queryByText(/0 of 1/i)).toBeNull();
  });

  it('never renders a standalone count Readout numeral in a populated inbox either', () => {
    const conversations: GolfConversationWithMeta[] = [
      {
        id: 'c1',
        is_group: false,
        title: null,
        unread_count: 0,
        other_participant: { id: 'u1', name: 'Jordan Lee', avatar: null },
        last_message: { content: 'See you at practice', created_at: new Date().toISOString() },
      } as unknown as GolfConversationWithMeta,
    ];

    const { container } = render(
      <MessageConversationRail
        conversations={conversations}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
        loading={false}
        error={false}
      />,
    );

    // The count now lives ONLY in the page masthead — never duplicated here
    // as a big mono numeral inside the rail's own panel bezel.
    expect(container.querySelector('[data-slot="readout"]')).toBeNull();
  });
});

describe('MessageConversationRail — Fairway inbox controls', () => {
  it('forces the flat mobile background across loading, error, empty, and loaded branches', () => {
    expect(source.match(/!bg-transparent/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(source).not.toContain('max-md:bg-transparent');
  });

  it('uses the canonical clearable SearchField instead of the legacy form input', () => {
    expect(source).toContain("from '@/components/fairway/command/search-field'");
    expect(source).toContain('<SearchField');
    expect(source).toContain('size="md"');
    expect(source).toContain('onClear={() => setSearchQuery(\'\')}');
    expect(source).not.toContain("from '@/components/fairway/forms/Input'");
  });

  it('renders cross-conversation search hits as unopinionated press targets', () => {
    expect(searchResultStart).toBeGreaterThanOrEqual(0);
    expect(searchResultEnd).toBeGreaterThan(searchResultStart);
    expect(searchResultSource).toContain('<PressTarget');
    expect(searchResultSource).not.toContain('<Button');
  });

  it('keeps conversation and search results as flat editorial rows', () => {
    expect(conversationRowSource).not.toContain('rounded-fw-md');
    expect(conversationRowSource).not.toContain('ring-inset ring-accent');
    expect(conversationRowSource).not.toContain('shadow-flat');
    expect(searchResultSource).not.toContain('rounded-fw-md');
    expect(searchResultSource).not.toContain('ring-inset ring-accent');
  });
});

describe('MessageConversationRail — group avatar identity', () => {
  it('does not invent an initials avatar when the group has no real photos', () => {
    groupAvatarMock.current = new Map([
      [groupConversation.id, [
        { name: 'Alexis Bennett', avatar: null },
        { name: 'Jordan Rivera', avatar: null },
      ]],
    ]);

    const { container } = render(
      <MessageConversationRail
        conversations={[groupConversation]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-slot="fw-avatar-group"]')).toBeNull();
    expect(container.querySelector('[data-slot="fw-avatar"]')).toBeNull();
  });

  it('uses a small real-photo stack only when at least two members have photos', () => {
    const safeImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
    groupAvatarMock.current = new Map([
      [groupConversation.id, [
        { name: 'Alexis Bennett', avatar: safeImage },
        { name: 'Jordan Rivera', avatar: safeImage },
      ]],
    ]);

    const { container } = render(
      <MessageConversationRail
        conversations={[groupConversation]}
        selectedId={null}
        onSelect={vi.fn()}
        onNewMessage={vi.fn()}
      />,
    );

    const group = container.querySelector('[data-slot="fw-avatar-group"]');
    expect(group).not.toBeNull();
    expect(group?.querySelector('img')).toHaveAttribute('src', safeImage);
  });
});
