'use client';

import { createContext, useContext } from 'react';
import type { QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import type { QcEarlier } from './earlier-today';

/**
 * What the `?qc=` preview hands the panel in place of a signed-in read. The live panel has no seam, so it reads the server. Nothing here
 * can write: a preview plan's Save moves the card on without calling an action.
 */
export interface QcSeamValue {
  week?: QuickChatWeek;
  earlier?: QcEarlier;
  planOn?: boolean;
  /** The task card opens already undone, a state only a tap reaches in the app. */
  taskPhase?: 'undone';
  plan?: { phase: 'draft' | 'saved' | 'told' | 'undone' | 'failed'; menu?: 'open' | 'new'; folders: Array<{ name: string; count: number }> };
}

export const QcSeam = createContext<QcSeamValue | null>(null);
export const useQcSeam = (): QcSeamValue | null => useContext(QcSeam);
