'use client';

import { createContext, useContext, type ReactNode } from 'react';

const FrontDoorContext = createContext(false);

/**
 * golf_clubhouse_front_door, carried to the client pages that cannot read it themselves. `/golf/join` and
 * `/golf/coach` are client pages with child routes under them (`/golf/join/[code]`, `/golf/coach/pending`), so a layout
 * cannot replace `children` for the one without taking the other; the layout hands the flag down instead and the page
 * draws the Clubhouse screen or its own. It chooses the page that is drawn and nothing else.
 */
export function FrontDoorProvider({ on, children }: { on: boolean; children: ReactNode }) {
  return <FrontDoorContext.Provider value={on}>{children}</FrontDoorContext.Provider>;
}

export const useClubhouseFrontDoor = (): boolean => useContext(FrontDoorContext);
