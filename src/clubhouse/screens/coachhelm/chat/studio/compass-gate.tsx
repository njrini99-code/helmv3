'use client';

import { createContext, useContext } from 'react';

/**
 * Whether this Ask may draw the Miss Compass, and how its "Ask about these shots" sends (CoachHelm Studio Phase 1). Ask's page
 * provides it from the loader's team flag (`ChAskData.missCompass`, coach only); everywhere else (the shell's Ask sheet, Fairway,
 * a preview without it) it is off, and a miss pattern draws as it always did, whatever the stored block holds.
 */
export interface MissCompassGateValue {
  on: boolean;
  /** Sends the next question about a selection (`engine/about.ts`, `shots:<direction>`). False when it could not be sent now. */
  askAbout?: (text: string, about: { evidence_ref: string; key: string }) => boolean;
}

export const MissCompassGate = createContext<MissCompassGateValue>({ on: false });

export const useMissCompassGate = (): MissCompassGateValue => useContext(MissCompassGate);
