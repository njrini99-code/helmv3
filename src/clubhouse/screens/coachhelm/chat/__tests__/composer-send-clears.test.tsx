import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Send empties the box (staging, 2026-11-08: "Where is the team losing…" stayed in the box after it was sent). Two things put
 * the sent text back, and both only show when the page swaps the hero composer for the docked one on the first send:
 *  - the draft kept for the tab was written as it was typed and cleared by an effect, which never runs for a box that unmounts
 *    in the same commit as the send, so the docked box restored the sent text from storage;
 *  - the question that arrived on the address (`?q=`) seeded every composer that mounted, the docked one included.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { RouteScope } from '../../../../lib/session-state';
import { ToastProvider } from '../../../../ui/Toast';
import { AskComposer } from '../Composer';
import { useSeedOnce } from '../drafts';

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;

/** The page: a hero composer until something is sent, the docked one after (Ask.tsx's `composer('hero' | 'dock')`). */
function Page({ seeded = null }: { seeded?: string | null }) {
  const [sent, setSent] = useState(false);
  const [seed, consume] = useSeedOnce(seeded);
  return (
    <RouteScope.Provider value="/golf/coachhelm">
      <ToastProvider>
        <AskComposer
          key={sent ? 'dock' : 'hero'}
          variant={sent ? 'dock' : 'hero'}
          seed={seed}
          draftKey="coach-1:new"
          phone={false}
          players={[]}
          busy={false}
          failed={false}
          blocked={false}
          onSend={() => {
            consume();
            setSent(true);
          }}
          onStop={vi.fn()}
        />
      </ToastProvider>
    </RouteScope.Provider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('send empties the box', () => {
  it('a typed question: the docked box that replaces the hero starts empty and keeps no draft', async () => {
    render(<Page />);
    fireEvent.change(box(), { target: { value: 'Where is the team losing the most strokes?' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(box().value).toBe('');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('a question that arrived on the address: sent once, it does not seed the docked box again', async () => {
    render(<Page seeded="Where is the team losing the most strokes?" />);
    expect(box().value).toBe('Where is the team losing the most strokes?');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(box().value).toBe('');
  });

  it('a draft the coach left is still there when they come back', () => {
    window.sessionStorage.setItem('ch:ask:draft:/golf/coachhelm\u0000coach-1:new', 'half a question');
    render(<Page />);
    expect(box().value).toBe('half a question');
  });
});
