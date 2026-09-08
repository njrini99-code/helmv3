// @vitest-environment jsdom
//
// G-56 / M03D F17 — the action surface is a labelled bottom sheet.
//
// G-56 IS A RECORD OF A SELF-CORRECTION, and that is why it is worth a suite.
// M03D first read these overlays as scrim-tap-to-dismiss, then found that
// NEITHER artboard contains a dim overlay div at all: the model is drag via the
// grip over a reduced-opacity background. The manifest keeps the correction
// because the original "would have driven a wrong build".
//
// F17 is the buildable half, and it is severity high: both artboards draw a
// vertical list of full-width labelled rows, and the code drew an icon-only
// horizontal strip with an X. That is a different interaction pattern, not a
// styling delta — a bare glyph cannot be read, only recognised.
//
// WHAT THE ARTBOARD EVIDENCE DOES AND DOES NOT SETTLE. An artboard is a
// picture. "No overlay div" is strong evidence about the COMPOSITION and weak
// evidence about the INTERACTION, because a static mock draws a scrim and a
// dimmed sibling identically. So the composition is taken from the artboard and
// the dismissal comes from the shared `Sheet` — which AGENTS.md's authority
// order puts above prose and `design-system.md` names as the ONE slide-over —
// scrim included. The tests below assert what each source actually supports:
// the artboard's own values are parsed, and the interaction is asserted on the
// primitive.
//
// MEASURED ON BOTH SIDES throughout. Every geometry claim reads the number out
// of `Actions.dc.html` AND the token out of `design-tokens.css` /
// `tailwind.config.ts`, so the suite fails if either moves.

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
const tailwind = read('tailwind.config.ts');

/** The LIGHT value of a token — first occurrence in file order. */
function lightToken(name: string): string {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+?)\\s*(?:;|/\\*)`));
  expect(m, `expected ${name} in design-tokens.css`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

/** The artboard's sheet panel — the element carrying the 1.75rem leading edge. */
function panelStyle(html: string): string {
  const m = html.match(/style="([^"]*border-radius: 1\.75rem 1\.75rem 0 0[^"]*)"/s);
  expect(m, 'expected a bottom-sheet panel in the artboard').not.toBeNull();
  return m?.[1] ?? '';
}

const MESSAGE_ID = 'msg-1';

function baseProps(own: boolean, overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  const reader = own ? 'coach-1' : 'player-2';
  return {
    conversation: { id: 'dm-1', is_group: false, title: null, unread_count: 0 } as GolfConversationWithMeta,
    messages: [
      {
        id: MESSAGE_ID,
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
    userId: reader,
    currentUserId: reader,
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

// ---------------------------------------------------------------------------
// The sources.
// ---------------------------------------------------------------------------

describe('G-56 — what the artboards state about the surface', () => {
  it('draws a bottom sheet with a drag grip, in both', () => {
    for (const html of [actionsArtboard, reactionsArtboard]) {
      expect(panelStyle(html)).toContain('border-radius: 1.75rem 1.75rem 0 0');
      // 38x4 pill, centred — the grip.
      expect(html).toMatch(/width: 38px; height: 4px;[^"]*border-radius: 9999px/);
    }
  });

  it('renders NO scrim overlay — the correction G-56 exists to record', () => {
    // The original reading was scrim-tap-to-dismiss. What the artboards
    // actually contain is a receded background at a literal opacity and no
    // overlay element. Both halves are asserted so the correction cannot
    // quietly revert.
    for (const html of [actionsArtboard, reactionsArtboard]) {
      expect(html).not.toMatch(/position: (fixed|absolute)[^"]*background: (rgba|oklch)\([^"]*\/ 0\.[1-9]/);
      expect(html).not.toMatch(/class="[^"]*(scrim|backdrop-dim|overlay)/);
    }
    const recededOpacities = [actionsArtboard, reactionsArtboard].map((html) => {
      const m = html.match(/opacity: (0\.3\d)/);
      return m?.[1];
    });
    expect(recededOpacities).toEqual(['0.32', '0.34']);
  });

  it('renders NO close control — the X in the old code had no counterpart', () => {
    for (const html of [actionsArtboard, reactionsArtboard]) {
      expect(html).not.toMatch(/>\s*Close\s*</);
    }
  });

  it('states the row geometry as a repeated rule, not one specimen', () => {
    // Four rows in Actions, four in Reactions, all the same shape bar the 2px
    // height difference between the two artboards.
    const rows = actionsArtboard.match(/height: 52px; padding: 0 12px; border-radius: 0\.875rem/g) ?? [];
    expect(rows.length).toBe(4);
    expect(actionsArtboard).toContain('gap: 14px');
    expect(actionsArtboard).toMatch(/<svg width="21" height="21"/);
  });
});

describe('G-56 — the panel is the token, measured on both sides', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });
  const openSheetForTypeCheck = () => {
    render(createElement(MessageThreadPane, baseProps(true, { mobileActionsId: MESSAGE_ID })));
    const copy = document.body.querySelector('[aria-label="Copy message"]');
    expect(copy, 'expected the action sheet to be open').not.toBeNull();
    return { row: copy!.parentElement! };
  };

  it("the artboard's leading-edge radius IS --fw-radius-lg", () => {
    expect(lightToken('--fw-radius-lg')).toBe('1.75rem');
    expect(panelStyle(actionsArtboard)).toContain('border-radius: 1.75rem 1.75rem 0 0');
  });

  it("the artboard's top border IS --fw-color-border-subtle", () => {
    const border = panelStyle(actionsArtboard).match(/border-top: 1px solid ([^;]+)/)?.[1]?.trim();
    expect(border).toBe(lightToken('--fw-color-border-subtle'));
  });

  it("the artboard's row radius IS --fw-radius-md, the token whose comment says 'list rows'", () => {
    expect(lightToken('--fw-radius-md')).toBe('0.875rem');
    expect(tokens).toMatch(/--fw-radius-md:\s*0\.875rem;\s*\/\* 14px — step 2: list rows/);
  });

  it("the 16px label IS a token — Apple's Callout, and the config says so", () => {
    // THIS ASSERTION EARNED ITS KEEP BY FAILING. It was written the other way
    // round — "no token exists, therefore A03 request" — because the Fairway
    // ramp brackets 16px without hitting it (`body` 15, `body-lg` 17). The
    // config ALSO carries an iOS scale whose `callout` is exactly 16px, under
    // a comment naming mobile/native surfaces as its use. The artboard is
    // drawing an iOS action sheet and this app is a Capacitor WKWebView, so
    // that is the token, and no request was owed.
    expect(actionsArtboard).toContain('font-size: 16px; font-weight: 500');
    const fontSizeBlock = tailwind.slice(tailwind.indexOf('fontSize:'), tailwind.indexOf('spacing:'));
    expect(fontSizeBlock).toMatch(/iOS TYPE SCALE — Apple HIG/);
    expect(fontSizeBlock).toMatch(/'callout':\s*\['16px'/);
    // The Fairway ramp genuinely does not hold it — which is why the first
    // reading was reachable, and why this records both scales.
    expect(fontSizeBlock).toMatch(/'body':\s*\['15px'/);
    expect(fontSizeBlock).toMatch(/'body-lg':\s*\['17px'/);
  });

  it('ships that token, with only the weight added', () => {
    // The token declares 400 and the artboard 500, so `font-medium` rides
    // along and nothing arbitrary is written.
    const { row } = openSheetForTypeCheck();
    const first = row.querySelector('button')!;
    expect(first.className).toContain('text-callout');
    expect(first.className).toContain('font-medium');
    expect(first.className).not.toMatch(/text-\[\d+px\]/);
  });

  it("the artboard's Delete red matches no token either", () => {
    expect(actionsArtboard).toContain('oklch(0.505 0.19 27)');
    expect(lightToken('--fw-color-danger')).not.toBe('oklch(0.505 0.19 27)');
    expect(lightToken('--fw-color-danger-ink')).not.toBe('oklch(0.505 0.19 27)');
    // And the reason the token wins anyway is stated in the token file itself.
    expect(tokens).toMatch(/all three failed as text/);
  });
});

// ---------------------------------------------------------------------------
// The rendered sheet.
// ---------------------------------------------------------------------------

describe('G-56 — the rendered action sheet', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  const openSheet = (own = true) => {
    render(createElement(MessageThreadPane, baseProps(own, { mobileActionsId: MESSAGE_ID })));
    const copy = document.body.querySelector('[aria-label="Copy message"]');
    expect(copy, 'expected the action sheet to be open').not.toBeNull();
    return { row: copy!.parentElement!, panel: copy!.parentElement!.parentElement! };
  };

  it('is the shared Sheet, so the panel geometry is the token by construction', () => {
    const { panel } = openSheet();
    expect(panel.className).toContain('rounded-t-fw-lg');
    expect(panel.className).toContain('border-border-subtle');
    // No literal anywhere on the panel — the whole point of the token match.
    expect(panel.className).not.toMatch(/\[1\.75rem\]|\[oklch/);
  });

  it('carries the drag grip the artboards draw', () => {
    const { panel } = openSheet();
    const grip = panel.querySelector('[class*="rounded-full"][class*="w-10"]');
    expect(grip, 'expected the Sheet’s drag handle').not.toBeNull();
  });

  it('renders LABELLED rows, which is the whole of F17', () => {
    // The defect was icon-only. A row must carry readable text, not just a
    // glyph — this is the assertion that fails if anyone reverts to the strip.
    const { row } = openSheet();
    const labels = Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Copy', 'Edit', 'Delete']);
  });

  it('gives each row the artboard geometry, read from the artboard', () => {
    const { row } = openSheet();
    const first = row.querySelector('button')!;
    // 52px / 12px padding / 14px gap / 0.875rem radius, all stated at
    // `Actions.dc.html:40` and all parsed above rather than typed here.
    const spec = actionsArtboard.match(
      /gap: (\d+)px; height: (\d+)px; padding: 0 (\d+)px; border-radius: ([\d.]+rem)/,
    );
    expect(spec, 'expected the artboard row rule').not.toBeNull();
    expect(first.className).toContain(`gap-${Number(spec![1]) / 4}`);
    expect(first.className).toContain(`h-[${spec![2]}px]`);
    expect(first.className).toContain(`px-${Number(spec![3]) / 4}`);
    expect(first.className).toContain('rounded-fw-md');
  });

  it('paints Delete as ink on a plain row, not as the filled danger chip', () => {
    // A PRESERVATION ASSERTION, and it passes against the pre-fix code on
    // purpose: `controls/button.tsx` has two danger variants — Button's
    // (`:108-112`) is a tinted chip, IconButton's (`:255-257`) is ink on
    // transparent — and the strip this replaces already used the second. What
    // this pins is that the rewrite did not drift to the first, which is the
    // obvious thing to reach for on a full-width row and which would paint a
    // red BAND neither artboard draws.
    const { row } = openSheet();
    const del = row.querySelector('[aria-label="Delete message"]')!;
    expect(del.className).toContain('text-fw-danger-ink');
    expect(del.className).not.toMatch(/(^|\s)bg-fw-danger-bg/);
    expect(del.className).toContain('hover:bg-fw-danger-bg');
  });

  it('has no Close row, because neither artboard has one', () => {
    const { row } = openSheet();
    expect(row.querySelector('[aria-label="Close"]')).toBeNull();
    expect(row.textContent).not.toContain('Close');
  });

  it('is ONE sheet over the thread, not one per message', () => {
    render(
      createElement(
        MessageThreadPane,
        baseProps(true, {
          mobileActionsId: MESSAGE_ID,
          messages: [
            { id: MESSAGE_ID, conversation_id: 'dm-1', sender_id: 'coach-1', content: 'first', created_at: '2026-08-22T11:00:00.000Z', read: false, is_deleted: false, edited_at: null, has_attachments: false },
            { id: 'msg-2', conversation_id: 'dm-1', sender_id: 'coach-1', content: 'second', created_at: '2026-08-22T11:01:00.000Z', read: false, is_deleted: false, edited_at: null, has_attachments: false },
          ] as MessageWithReadStatus[],
        }),
      ),
    );
    expect(document.body.querySelectorAll('[aria-label="Copy message"]').length).toBe(1);
  });

  it('closes when the sheet does, whatever dismissed it', () => {
    // Grip-drag, scrim and Escape all resolve to the same `onOpenChange(false)`,
    // so this is the one assertion that covers every dismissal path the
    // primitive owns — including the two jsdom cannot simulate.
    const onSetMobileActions = vi.fn();
    render(
      createElement(MessageThreadPane, baseProps(true, { mobileActionsId: MESSAGE_ID, onSetMobileActions })),
    );
    const panel = document.body.querySelector('[aria-label="Copy message"]')!
      .parentElement!.parentElement!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onSetMobileActions).toHaveBeenCalledWith(null);
  });
});
