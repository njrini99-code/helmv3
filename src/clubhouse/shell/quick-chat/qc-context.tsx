'use client';

import { createContext, useContext } from 'react';
import type { UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';

export interface QcRun {
  state: 'idle' | 'work' | 'wait' | 'done' | 'failed';
  label: string;
}

export interface Ctx {
  /** The shell's pathname: the page the chat is over. */
  pathname: string;
  on: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  warm: () => void;
  run: QcRun;
  setRun: (r: QcRun) => void;
  flag: boolean;
  setFlag: (v: boolean) => void;
  keyRef: React.RefObject<HTMLSpanElement | null>;
  /** The live chat: the Ask screen renders from it while its run is going. */
  session: UseCoachHelmChatResult | null;
  setSession: (s: UseCoachHelmChatResult | null) => void;
}
export const QcCtx = createContext<Ctx | null>(null);

export function useQcCtx(): Ctx {
  const c = useContext(QcCtx);
  if (!c) throw new Error('useQcCtx outside QuickChatProvider');
  return c;
}

export const HelmMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <g className="wheel">
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7" />
    </g>
    <circle className="ball" cx="12" cy="12" r="4.6" />
  </svg>
);
