'use client';

import { createContext, useContext } from 'react';
import type { QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { QcEarlier } from './earlier-today';

/**
 * What the `?qc=` preview hands the panel in place of a signed-in read. The live panel has no seam, so it reads the server. Nothing here
 * can write: a preview plan's Save moves the card on without calling an action.
 */
export interface QcSeamValue {
  week?: QuickChatWeek;
  earlier?: QcEarlier;
  planOn?: boolean;
  /** In place of the three calls a held card makes (`GET`, `DELETE`, `POST ?now=1` on `actions/[key]`): the preview never reaches the network. */
  act?: (key: string, op: 'poll' | 'undo' | 'now') => Promise<{ receipt?: ActionReceipt | null } | null>;
  /** The keyboard's height, drawn as a block under the sheet: the capture browser has no keyboard to raise. */
  keyboard?: number;
  /** Today's thread was restored from an earlier open: the "Earlier today" rule is drawn over it. */
  today?: boolean;
  /** The task card opens already undone, a state only a tap reaches in the app. */
  taskPhase?: 'undone';
  plan?: { phase: 'draft' | 'saved' | 'told' | 'undone' | 'failed'; menu?: 'open' | 'new'; folders: Array<{ name: string; count: number }> };
}

export const QcSeam = createContext<QcSeamValue | null>(null);
export const useQcSeam = (): QcSeamValue | null => useContext(QcSeam);
