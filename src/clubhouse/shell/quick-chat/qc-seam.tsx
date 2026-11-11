'use client';

import { createContext, useContext } from 'react';

/**
 * What the `?qc=` preview hands the panel in place of a signed-in read. The live panel has no seam, so it reads the server.
 */
export interface QcSeamValue {
  planOn?: boolean;
  /** The keyboard's height, drawn as a block under the sheet: the capture browser has no keyboard to raise. */
  keyboard?: number;
  /** Today's thread was there before this open: the "Earlier today" rule is drawn over it. */
  today?: boolean;
}

export const QcSeam = createContext<QcSeamValue | null>(null);
export const useQcSeam = (): QcSeamValue | null => useContext(QcSeam);
