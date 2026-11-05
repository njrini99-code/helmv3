// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskProposalView } from '../../../../../data/coachhelm-chat-thread';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => motion.reduced }));

import { ConfirmCard } from '../ConfirmCard';
import { ArtifactView } from '../Artifact';

const view = (receipt: ActionReceipt | null = null) =>
  ({
    tool: 'create_event',
    status: receipt ? 'confirmed' : 'live',
    approvalId: 'a1',
    receipt,
    proposal: { action: 'Add to calendar', summary: 'Team dinner, Friday', facts: [{ label: 'When', value: 'Friday 6 PM' }], affects: [], notifications: [], missing: [], idempotency_key: 'k' },
  }) as unknown as AskProposalView;
const done = { status: 'completed', action: 'Add to calendar', summary: 'Added', created: [], notifications: [] } as unknown as ActionReceipt;
const failed = { ...done, status: 'failed' } as unknown as ActionReceipt;
const card = (v: AskProposalView) => <ConfirmCard view={v} inlineReceipt={null} onApprove={vi.fn()} onDeny={vi.fn()} />;

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  motion.reduced = false;
  animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
  Element.prototype.animate = animate as never;
});
afterEach(() => {
  cleanup();
  delete (Element.prototype as { animate?: unknown }).animate;
});
const flights = () => animate.mock.calls.filter(([, o]) => (o as { delay?: number })?.delay === 140);

describe('the draft flying home (M-ASK-45)', () => {
  it('flies when the write answers during this visit', () => {
    const { rerender } = render(card(view()));
    expect(flights()).toHaveLength(0);
    rerender(card(view(done)));
    expect(flights()).toHaveLength(1);
  });

  it('draws a reloaded receipt still', () => {
    render(card(view(done)));
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not fly a failed write', () => {
    const { rerender } = render(card(view()));
    rerender(card(view(failed)));
    expect(flights()).toHaveLength(0);
  });

  it('fades the slot in place under Reduce Motion, with no flight', () => {
    motion.reduced = true;
    const { rerender } = render(card(view()));
    rerender(card(view(done)));
    expect(flights()).toHaveLength(0);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});

describe('closing the plan pane (M-ASK-30)', () => {
  it('still closes when no animation is running, as with Animations off', async () => {
    const onClose = vi.fn();
    const art = { title: 'Plan', kind: 'plan', versions: [{ body: 'x' }] } as never;
    const { getByRole } = render(<ArtifactView artifact={art} phone={false} body={() => null} onClose={onClose} />);
    getByRole('button', { name: 'Close' }).click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
