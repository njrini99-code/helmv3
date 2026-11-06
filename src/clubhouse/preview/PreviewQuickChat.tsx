'use client';

import type { UIMessage } from 'ai';
import { useEffect, useState } from 'react';
import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import QuickChatSession from '../shell/quick-chat/QuickChatSession';
import { QC_FIXTURES, seamFor, type QcFixture } from './fixtures-quick-chat';
import { QcSeam } from '../shell/quick-chat/qc-seam';
import type { ChAskSheetChat } from '../shell/AskSheet';

function fake(f: QcFixture): ChAskSheetChat {
  return function useFakeQuickChat(_o: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
    const [messages] = useState<UIMessage[]>(f.messages);
    return {
      messages,
      status: f.busy ? 'streaming' : 'ready',
      error: f.failed ? new Error('Lost the connection. Nothing was saved.') : undefined,
      busy: !!f.busy,
      conversationId: 'preview',
      context: [],
      addContext: () => {},
      removeContext: () => {},
      send: () => {},
      stop: () => {},
      retry: () => {},
      newConversation: () => {},
      approve: () => {},
      deny: () => {},
    };
  };
}

/** `?qc=<state>` over any coach preview screen. Sets body[data-qc] as the design page does, so `capture.mjs` can wait on it. */
export default function PreviewQuickChat({ state, open, onClose, looking, pathname }: { state: string; open: boolean; onClose: () => void; looking: { label: string; playerId: string | null; playerName: string | null }; pathname: string }) {
  const f = QC_FIXTURES[state] ?? QC_FIXTURES.hello!;
  const [chat] = useState(() => fake(f));
  useEffect(() => {
    document.body.dataset.qc = state;
    return () => {
      delete document.body.dataset.qc;
    };
  }, [state]);
  return (
    <QcSeam.Provider value={seamFor(state)}>
      <QuickChatSession open={open} onClose={onClose} looking={looking} pathname={pathname} chat={chat} />
    </QcSeam.Provider>
  );
}
