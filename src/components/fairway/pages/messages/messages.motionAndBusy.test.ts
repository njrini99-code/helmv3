/**
 * Touch response, busy affordances and loading states across the Messages tree.
 *
 * Five gaps, one property each, all found by reading the tree against its own
 * standards rather than against taste — every assertion below cites a place
 * where this repo had already decided the answer and one Messages surface was
 * not following it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) =>
  readFileSync(join(process.cwd(), 'src/components/fairway/pages/messages', p), 'utf-8');

/** Comment-stripped, so a docstring explaining a fix cannot satisfy an assertion. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const rail = strip(read('MessageConversationRail.tsx'));
const thread = strip(read('MessageThreadPane.tsx'));
const composer = strip(read('MessageComposer.tsx'));
const group = strip(read('GroupDetailsSheet.tsx'));
const newMessage = strip(read('FairwayNewMessageSheet.tsx'));
const broadcast = strip(read('FairwayTeamBroadcastSheet.tsx'));

const press = readFileSync(
  join(process.cwd(), 'src/components/fairway/controls/_internal.ts'),
  'utf-8',
);

describe('the thread’s first paint is a shape-matched skeleton', () => {
  it('uses the Skeleton primitive, not hand-rolled grey bars', () => {
    expect(thread).toContain("Skeleton } from '@/components/fairway/feedback'");
    // The three static `bg-surface-sunken` divs are gone: no shimmer, no
    // a11y group, no reserved slot.
    expect(thread).not.toContain('<div className="h-4 w-3/4 rounded bg-surface-sunken" />');
  });

  it('carries the loading a11y contract Skeleton.tsx states', () => {
    // Skeleton.tsx's header: "Every skeleton group carries role="status" +
    // aria-busy + an SR-only label". The rail already did; the thread did not.
    const idx = thread.indexOf('SKELETON_BUBBLES.map');
    expect(idx).toBeGreaterThan(-1);
    const branch = thread.slice(Math.max(0, idx - 600), idx);
    expect(branch).toContain('role="status"');
    expect(branch).toContain('aria-busy="true"');
    expect(branch).toContain('aria-live="polite"');
    expect(branch).toContain('<span className="sr-only">Loading messages…</span>');
  });

  it('reserves the bubble’s own slot — sides alternate and the gutter is held', () => {
    // A placeholder that does not sit where the message will sit trades one
    // jump for two. It alternates, and an incoming row keeps the 32px avatar
    // column so the text edge does not move when the real thread lands.
    expect(thread).toContain('const SKELETON_BUBBLES = [');
    const decl = thread.slice(
      thread.indexOf('const SKELETON_BUBBLES = ['),
      thread.indexOf('] as const;', thread.indexOf('const SKELETON_BUBBLES = [')),
    );
    expect(decl.match(/own: false/g) ?? []).toHaveLength(2);
    expect(decl.match(/own: true/g) ?? []).toHaveLength(2);
    expect(thread).toContain('{!bubble.own && <Skeleton circle className="h-8 w-8 flex-shrink-0 bg-surface" />}');
    expect(thread).toContain("bubble.own ? 'rounded-br-sm' : 'rounded-bl-sm'");
  });
});

describe('a send in flight is a spinner, not the typing vocabulary', () => {
  it('does not draw bouncing dots on the send button', () => {
    // Three animated dots in a chat mean "someone is typing" — this tree draws
    // exactly that in MessageThreadPane's TypingIndicator, whose own comment
    // also records that animate-bounce on dots was tried and rejected.
    expect(composer).not.toContain('motion-safe:animate-bounce');
  });

  it('uses the in-repo control-busy glyph', () => {
    // ToastStack.tsx's idiom, and the same shape Button's own `busy` draws.
    expect(composer).toContain(
      '<Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />',
    );
    expect(composer).toContain('animate-spin motion-reduce:animate-none');
  });

  it('tells assistive tech, which the aria-hidden dots never did', () => {
    expect(composer).toContain('aria-busy={sending || undefined}');
    expect(composer).toContain("aria-label={sending ? 'Sending message' : 'Send message'}");
  });

  it('the TypingIndicator keeps its own register — the two are still distinct', () => {
    expect(thread).toContain("animate={{ opacity: [0.25, 1, 0.25] }}");
    expect(thread).not.toContain('animate-bounce');
  });
});

describe('GroupDetailsSheet says WHICH action is running', () => {
  it('passes the primitive’s busy prop, like the two sibling sheets already do', () => {
    // FairwayNewMessageSheet and FairwayTeamBroadcastSheet both pass busy= on
    // their CTA; this sheet set disabled={busy} on five controls and busy= on
    // none, so a tap greyed the sheet out and drew no progress anywhere.
    expect(newMessage).toContain('busy={creating}');
    expect(broadcast).toContain('busy={creating}');
    expect(group).toContain('busy={busy}');
  });

  it('scopes the spinner to the pressed row, never to every Add at once', () => {
    // Add is rendered once per candidate. A single flag handed to busy= would
    // claim several requests are running when one is.
    expect(group).toContain('const [pendingKey, setPendingKey] = React.useState<string | null>(null);');
    expect(group).toContain('pending={pendingKey === `add:${c.userId}`}');
    expect(group).toContain('busy={pending}');
    expect(group).toContain('`add:${c.userId}`,');
  });

  it('clears the key on every exit path, including the failure one', () => {
    const runIdx = group.indexOf('const run = React.useCallback(');
    expect(runIdx).toBeGreaterThan(-1);
    const body = group.slice(runIdx, runIdx + 900);
    expect(body).toContain('setPendingKey(key ?? null);');
    expect(body).toContain('setPendingKey(null);');
    // and on close, so a reopened sheet never starts mid-spin
    expect(group).toContain('setPendingKey(null);');
  });
});

describe('every touch point acknowledges a tap', () => {
  it('the rail’s rows transition transform, so fwPress can actually settle', () => {
    // The rows are Buttons, so the primitive's base carries fwPress. A bare
    // `transition-colors` displaces the base's property list through cn and
    // transform was in it — the press fired but snapped, and the spring easing
    // governed nothing.
    expect(press).toContain('active:scale-[0.98]');
    expect(rail.match(/transition-\[color,background-color,transform\]/g) ?? []).toHaveLength(2);
    expect(rail).not.toContain("outline-none transition-colors");
  });

  it('does NOT put box-shadow back in the row’s transition list', () => {
    // fwTransition transitions box-shadow too. A row shadow is what the
    // one-cadence pass removed; re-adding it here invites per-row depth back.
    // The depth belongs to the list.
    expect(rail).not.toMatch(/transition-\[[^\]]*box-shadow[^\]]*\]/);
  });

  it('the raw recipient rows carry the canonical press recipe', () => {
    // Raw <button>s inherit nothing from the control family. Inlined rather
    // than imported: nothing outside controls/ imports _internal, and the
    // underscore is announcing a boundary. Both halves are pinned against the
    // source of truth so the copy cannot drift from it.
    expect(press).toContain('active:translate-y-[0.5px] active:scale-[0.98]');
    expect(press).toContain('motion-reduce:active:translate-y-0 motion-reduce:active:scale-100');
    for (const [name, src] of [
      ['FairwayNewMessageSheet', newMessage],
      ['FairwayTeamBroadcastSheet', broadcast],
    ] as const) {
      expect(src, name).toContain("'active:translate-y-[0.5px] active:scale-[0.98]',");
      expect(src, name).toContain(
        "'active:[transition-timing-function:var(--fw-ease-spring)]',",
      );
      expect(src, name).toContain(
        "'motion-reduce:active:translate-y-0 motion-reduce:active:scale-100',",
      );
      // and the transform has to be transitioned for the spring to mean anything
      expect(src, name).toContain(
        "'transition-[color,background-color,transform] [transition-duration:var(--fw-dur-fast)]',",
      );
    }
  });

  it('every motion added here pairs with a reduced-motion collapse', () => {
    for (const [name, src] of [
      ['MessageConversationRail', rail],
      ['MessageThreadPane', thread],
      ['MessageComposer', composer],
      ['FairwayNewMessageSheet', newMessage],
      ['FairwayTeamBroadcastSheet', broadcast],
    ] as const) {
      expect(src, name).toMatch(/motion-reduce:|useReducedMotion|motion-safe:/);
    }
  });
});
