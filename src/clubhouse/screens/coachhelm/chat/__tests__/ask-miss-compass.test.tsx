/**
 * Ask's page turns the Miss Compass on for a coach whose team the flag lists (`ChAskData.missCompass`), and its "Ask about these
 * shots" sends the next question with the selection as `about` (engine/about.ts `shots:<direction>`), through the same gate as
 * a starter: not while a reply is on its way. A player's Ask never has it. The thread is a stand-in that reads the gate.
 */
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('../EvidencePanel', () => ({ AskEvidencePanel: () => null }));
vi.mock('../Thread', async () => {
  const { useMissCompassGate } = await import('../studio/compass-gate');
  return {
    AskThread: () => {
      const gate = useMissCompassGate();
      return (
        <div data-testid="thread" data-compass={String(gate.on)}>
          <button type="button" onClick={() => gate.askAbout?.('Ask about the 46 shots that missed right', { evidence_ref: 'e7', key: 'shots:right' })}>
            stub ask about these shots
          </button>
        </div>
      );
    },
  };
});

import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChAskData, ChAskLoad } from '../../../../data/coachhelm-chat-shape';
import { ASK_MSGS_ANSWER } from '../../../../preview/fixtures-ask-thread';
import { PREVIEW_ASK_DATA } from '../../../../preview/fixtures-ask';
import { ClubhouseMarker } from '../../../../shell/context';
import { PhoneChromeProvider } from '../../../../shell/phone-chrome';
import { ToastProvider } from '../../../../ui/Toast';
import { Ask, type ChAskChat } from '../Ask';

afterEach(cleanup);

function fakeChat(state: { messages?: UIMessage[]; busy?: boolean } = {}) {
  const calls = { send: vi.fn(), stop: vi.fn(), retry: vi.fn(), newConversation: vi.fn(), approve: vi.fn(), deny: vi.fn() };
  const hook = ((options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult => ({
    messages: options.initialMessages ?? state.messages ?? [],
    status: state.busy ? 'streaming' : 'ready',
    error: undefined,
    busy: state.busy ?? false,
    conversationId: null,
    context: [],
    addContext: () => {},
    removeContext: () => {},
    ...calls,
  })) as ChAskChat;
  return { hook, calls };
}

/** A conversation already open, so the thread (and the gate it reads) is on screen. */
const thread = (over: Partial<ChAskData>): ChAskLoad => ({ status: 'ready', data: { ...PREVIEW_ASK_DATA, thread: { id: 'c-1', title: 'Approach misses', messages: ASK_MSGS_ANSWER }, ...over } as ChAskData });
const show = (load: ChAskLoad, chat = fakeChat()) => {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
          <ClubhouseMarker role="coach">
            <div className="ch-root" data-ui="clubhouse">
              <Ask load={load} chat={chat.hook} />
            </div>
          </ClubhouseMarker>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
  return chat;
};

describe('Ask turns the Miss Compass on for a flagged coach team, and sends its selection', () => {
  it('on: "Ask about these shots" sends the question with the selection as about', () => {
    const chat = show(thread({ missCompass: true }));
    expect(screen.getByTestId('thread')).toHaveAttribute('data-compass', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'stub ask about these shots' }));
    expect(chat.calls.send).toHaveBeenCalledTimes(1);
    expect(chat.calls.send).toHaveBeenCalledWith('Ask about the 46 shots that missed right', { about: { evidence_ref: 'e7', key: 'shots:right' } });
  });

  it('not while a reply is on its way', () => {
    const chat = show(thread({ missCompass: true }), fakeChat({ busy: true }));
    fireEvent.click(screen.getByRole('button', { name: 'stub ask about these shots' }));
    expect(chat.calls.send).not.toHaveBeenCalled();
  });

  it('off without the flag, and off on a player’s Ask whatever the data says', () => {
    show(thread({}));
    expect(screen.getByTestId('thread')).toHaveAttribute('data-compass', 'false');
    cleanup();
    show(thread({ missCompass: true, role: 'player', firstName: 'Jonah' }));
    expect(screen.getByTestId('thread')).toHaveAttribute('data-compass', 'false');
  });
});
