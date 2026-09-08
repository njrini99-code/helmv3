// @vitest-environment jsdom
//
// G-55 — the message actions, and the separator that gives Delete its distance.
//
// THE FINDING AS WRITTEN IS PARTLY WRONG, and `audit/DECISIONS.md:31` records
// the correction rather than the original claim. M00 called this "three
// sources, three orders". There are two: `Reactions.dc.html` and §12.4's prose
// agree exactly — Reply, Copy, Edit, — separator — Delete — and only
// `Actions.dc.html` differs, by leading with Copy. Both artboards are parsed
// below and the disagreement is asserted to be exactly that one swap, so this
// suite fails if a future artboard actually does introduce a third order.
//
// What follows from the correction is that Copy-then-Edit-then-Delete was
// ALREADY the shipped relative order. The real defect is the part that carries
// the meaning: nothing separated the one irreversible action from the two
// reversible ones. Both artboards draw a rule there. The code drew none, on
// either the mobile long-press row or the desktop hover row.
//
// REPLY IS ABSENT ON PURPOSE. It is deferred as G-20c — the affordance is not
// built — and a test that demanded it would be asserting a plan rather than a
// decision. What this suite pins instead is that the three actions that DO
// exist sit in the decided relative order, which is the part of the frozen
// order that is implementable today.
//
// MEASURED ON BOTH SIDES for the value that has a token: the separator colour
// is parsed out of `Actions.dc.html` AND out of `design-tokens.css` and
// compared, so the suite fails if either moves. The ORDER is asserted
// behaviourally — rendered DOM, real children, real order — because order is
// observable in jsdom and a source-regex over a 1500-line component is not the
// honest way to check something the reader can actually see.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const actionsArtboard = read('audit/reference/Actions.dc.html');
const reactionsArtboard = read('audit/reference/Reactions.dc.html');
const tokens = read('src/styles/design-tokens.css');

/** The labelled rows of an artboard's action list, in the order it draws them. */
function artboardActionOrder(html: string): string[] {
  const wanted = new Set(['Copy', 'Reply', 'Edit', 'Delete']);
  const labels: string[] = [];
  for (const m of html.matchAll(/<span style="font-size: 16px; font-weight: 500;?[^"]*">([^<]+)<\/span>/g)) {
    const label = (m[1] ?? '').trim();
    if (wanted.has(label)) labels.push(label);
  }
  return labels;
}

/** The `background` of the 1px rule an artboard draws inside its action list. */
function artboardSeparatorColor(html: string): string {
  const m = html.match(/<div style="height: 1px;[^"]*background: ([^;"]+)[;"]/);
  expect(m, 'expected a 1px separator rule in the artboard').not.toBeNull();
  return (m?.[1] ?? '').trim();
}

/**
 * The LIGHT value of a token. Every `--fw-*` name is declared twice — once in
 * the light block, once in the dark one — so the first occurrence in file order
 * is light. (The same de-duplication the sibling token suites in this directory
 * use, for the same reason.)
 */
function lightToken(name: string): string {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(m, `expected ${name} in design-tokens.css`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

// ---------------------------------------------------------------------------
// The sources, before anything is asserted about the code.
// ---------------------------------------------------------------------------

describe('G-55 — what the artboards actually say', () => {
  it('Reactions draws the decided order', () => {
    expect(artboardActionOrder(reactionsArtboard)).toEqual(['Reply', 'Copy', 'Edit', 'Delete']);
  });

  it('Actions differs from it by exactly one swap, not by being a third order', () => {
    const actions = artboardActionOrder(actionsArtboard);
    expect(actions).toEqual(['Copy', 'Reply', 'Edit', 'Delete']);
    // Same set, same tail — the only disagreement is which of Copy/Reply leads.
    expect([...actions].sort()).toEqual([...artboardActionOrder(reactionsArtboard)].sort());
    expect(actions.slice(2)).toEqual(artboardActionOrder(reactionsArtboard).slice(2));
  });

  it('both put Delete last, behind a rule', () => {
    for (const html of [actionsArtboard, reactionsArtboard]) {
      expect(artboardActionOrder(html).at(-1)).toBe('Delete');
      const sepAt = html.indexOf('height: 1px;');
      const deleteAt = html.lastIndexOf('>Delete<');
      const editAt = html.lastIndexOf('>Edit<');
      expect(sepAt).toBeGreaterThan(editAt);
      expect(sepAt).toBeLessThan(deleteAt);
    }
  });
});

describe('G-55 — the separator colour is a token, measured on both sides', () => {
  it("Actions' rule is byte-identical to --fw-color-border-subtle", () => {
    // This is the whole reason `bg-border-subtle` is the right class rather
    // than a copied literal. If either side is retuned, this fails.
    expect(artboardSeparatorColor(actionsArtboard)).toBe(lightToken('--fw-color-border-subtle'));
  });

  it("Reactions' rule is a DIFFERENT colour, which is why the tie needed breaking", () => {
    // Recorded rather than glossed: the two artboards disagree here too. The
    // one matching a token wins under AGENTS.md's authority order, so no
    // preference had to be invented.
    expect(artboardSeparatorColor(reactionsArtboard)).not.toBe(
      artboardSeparatorColor(actionsArtboard),
    );
  });

  it('maps `bg-border-subtle` to that same token, so the class is the value', () => {
    const config = read('tailwind.config.ts');
    expect(config).toMatch(/'border-subtle':\s*tokenColor\('--fw-color-border-subtle'\)/);
  });
});

// ---------------------------------------------------------------------------
// The rendered rows.
// ---------------------------------------------------------------------------

const conversation = {
  id: 'dm-1',
  is_group: false,
  title: null,
  unread_count: 0,
} as GolfConversationWithMeta;

const OWN_MESSAGE_ID = 'msg-own-1';

function baseProps(overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  return {
    conversation,
    messages: [
      {
        id: OWN_MESSAGE_ID,
        conversation_id: 'dm-1',
        sender_id: 'coach-1',
        content: 'Tee time moved to 7:40',
        created_at: '2026-08-22T11:00:00.000Z',
        read: false,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
      },
    ] as MessageWithReadStatus[],
    loading: false,
    userId: 'coach-1',
    currentUserId: 'coach-1',
    isOtherTyping: false,
    onBack: vi.fn(),
    onNewMessage: vi.fn(),
    editingMessageId: null,
    editContent: '',
    isEditSaving: false,
    deleteConfirmId: null,
    mobileActionsId: null,
    onStartEdit: vi.fn(),
    onEditContentChange: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onDeleteClick: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onSetMobileActions: vi.fn(),
    ...overrides,
  } as MessageThreadPaneProps;
}

/**
 * An action row, described the way a reader perceives it: the accessible name
 * of each control, and `separator` wherever a hairline sits between two of
 * them. Reading the row's own children keeps this a statement about position
 * rather than about markup.
 */
function describeRow(row: Element): string[] {
  return Array.from(row.children).map((child) => {
    const label = child.getAttribute('aria-label');
    if (label) return label;
    // A hairline in either orientation: `w-px` on the horizontal hover row,
    // `h-px` in the vertical sheet G-56 moved the actions into.
    if (
      child.getAttribute('aria-hidden') === 'true' &&
      (child.className.includes('w-px') || child.className.includes('h-px'))
    ) {
      return 'separator';
    }
    return child.tagName.toLowerCase();
  });
}

describe('G-55 — the rendered action rows', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('separates Delete from the reversible actions in the action sheet', () => {
    render(createElement(MessageThreadPane, baseProps({ mobileActionsId: OWN_MESSAGE_ID })));
    // G-56 moved the actions into the shared `Sheet`, which renders as a fixed
    // panel rather than inside the render container — so this reads the
    // document, not `container`. The property is unchanged.
    const copy = document.body.querySelector('[aria-label="Copy message"]');
    expect(copy, 'expected the action sheet to be open').not.toBeNull();
    // ANCHORED ON THE PROPERTY THIS FINDING OWNS: the rule sits between the
    // reversible actions and Delete. Close is filtered out deliberately — it
    // is a sheet dismissal with no slot in either artboard, it currently
    // trails Delete, and where it belongs is G-56's call when this row
    // becomes a real labelled sheet. Pinning its index here would mean a
    // correct G-56 fix arrives as a failure in a suite that has no opinion
    // about it, and someone edits an assertion to let a fix through.
    // G-56 removed the Close row — it had no counterpart in either artboard,
    // and the sheet dismisses by grip-drag, scrim and Escape. So the filter
    // that used to keep this suite out of G-56's business is no longer needed:
    // every entry in this row is one G-55 owns.
    expect(describeRow(copy!.parentElement!)).toEqual([
      'Copy message',
      'Edit message',
      'separator',
      'Delete message',
    ]);
  });

  it('separates Delete on the desktop hover row too', () => {
    // The defect was symmetrical and so is the fix: the hover row carried the
    // same two reversible actions flush against the destructive one.
    const { container } = render(createElement(MessageThreadPane, baseProps()));
    const edit = container.querySelector('[aria-label="Edit message"]');
    expect(edit, 'expected the desktop hover row').not.toBeNull();
    const row = edit!.parentElement!;
    expect(row.className).toContain('lg:flex');

    expect(describeRow(row)).toEqual(['Edit message', 'separator', 'Delete message']);
  });

  it('gives the rule BOTH of the artboard\u2019s margins, now that it runs the same way', () => {
    // Under G-55 this could only check one number. The sheet's rule is
    // horizontal like the artboard's, so `margin: 6px 12px` maps directly:
    // 6px across the gap it opens, 12px along its length. Both parsed, so the
    // derivation fails if the artboard is respaced.
    const margin = actionsArtboard.match(/<div style="height: 1px; margin: (\d+)px (\d+)px;/);
    expect(margin?.[1], 'expected the artboard rule to state a margin').toBeDefined();
    const across = Number(margin?.[1]);
    const along = Number(margin?.[2]);
    expect([across, along]).toEqual([6, 12]);

    render(createElement(MessageThreadPane, baseProps({ mobileActionsId: OWN_MESSAGE_ID })));
    const rule = document.body.querySelector('[aria-hidden="true"][class*="h-px"]');
    expect(rule, 'expected the sheet to draw a horizontal rule').not.toBeNull();
    // Tailwind's spacing scale is 0.25rem per step at a 16px root.
    expect(rule!.className).toContain(`my-${across / 4}`);
    expect(rule!.className).toContain(`mx-${along / 4}`);
  });

  it('paints both separators with the token, not a literal', () => {
    render(createElement(MessageThreadPane, baseProps({ mobileActionsId: OWN_MESSAGE_ID })));
    // Two rules, in two orientations: the desktop hover row's vertical one and
    // the sheet's horizontal one.
    const rules = Array.from(
      document.body.querySelectorAll('[aria-hidden="true"][class*="-px"]'),
    ).filter((el) => el.className.includes('w-px') || el.className.includes('h-px'));
    expect(rules.length).toBe(2);
    for (const rule of rules) {
      expect(rule.className).toContain('bg-border-subtle');
      // A hairline, and only a hairline — the artboards' rule is 1px.
      expect(rule.className).toMatch(/\b[wh]-px\b/);
      expect(rule.className).not.toMatch(/\bbg-\[/);
    }
  });

  it('keeps Delete destructive, which the separator reinforces rather than replaces', () => {
    const { container } = render(
      createElement(MessageThreadPane, baseProps({ mobileActionsId: OWN_MESSAGE_ID })),
    );
    // Both artboards colour Delete oklch(0.505 0.19 27) and keep the rule. The
    // separator is additional distance, not a substitute for the colour.
    for (const html of [actionsArtboard, reactionsArtboard]) {
      expect(html).toContain('color: oklch(0.505 0.19 27);">Delete<');
    }
    const deletes = Array.from(container.querySelectorAll('[aria-label="Delete message"]'));
    expect(deletes.length).toBeGreaterThan(0);
    for (const btn of deletes) {
      expect(btn.className).toMatch(/danger|text-fw-danger|bg-fw-danger/);
    }
  });

  it('draws no separator on an incoming message, because nothing there is destructive', () => {
    // §12.4: incoming messages omit Edit and Delete. G-42 gave them the rest
    // of the row — Copy and Close — so this is no longer "no row at all"; it
    // is "no destructive half", which is what the separator exists to fence
    // and therefore what this suite owns. The row's own contents are asserted
    // in MessageThreadPane.incomingActions.test.ts.
    render(
      createElement(
        MessageThreadPane,
        // Own-ness is `sender_id === userId || sender_id === currentUserId`,
        // so BOTH identities have to move for the message to be incoming.
        // Setting only one leaves it own and the row still renders — which is
        // what the first run of this test found.
        baseProps({ userId: 'player-2', currentUserId: 'player-2', mobileActionsId: OWN_MESSAGE_ID }),
      ),
    );
    const container = document.body;
    // PINNED BY WHAT IS THERE, not only by what is not. Asserting two nulls
    // alone would pass for two stacked reasons — the tap row could lose its
    // separator OR the own-only hover row (which carries one of its own) could
    // stop rendering — and it would keep passing if a separator leaked into an
    // incoming row while Delete happened to be absent.
    const copy = container.querySelector('[aria-label="Copy message"]');
    expect(copy, 'G-42 gives an incoming message a Copy row').not.toBeNull();
    expect(describeRow(copy!.parentElement!)).toEqual(['Copy message']);

    expect(container.querySelector('[aria-label="Delete message"]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"][class*="w-px"]')).toBeNull();
  });
});
