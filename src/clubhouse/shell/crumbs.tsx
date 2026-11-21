'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDocumentTitle } from '../lib/document-title';

/**
 * A page can name its own breadcrumb trail when the route alone can't (a
 * player's stats: "Stats › Jonah Okafor"). The top bar shows it while the
 * page is mounted and falls back to the navigation's trail after.
 */
const Ctx = createContext<{ trail: string[] | null; set: (t: string[] | null) => void }>({ trail: null, set: () => {} });

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [trail, set] = useState<string[] | null>(null);
  return <Ctx.Provider value={{ trail, set }}>{children}</Ctx.Provider>;
}

export function useCrumbTrail(): string[] | null {
  return useContext(Ctx).trail;
}

/**
 * Sets the top bar's trail for as long as the calling page is mounted; null keeps the navigation's. A trail that names an
 * object under its page ("Stats › Jonah Okafor") also names the window, the tab and the app switcher for it while it is
 * up (S4, D11: a macOS window title per object; lib/document-title.ts gives the route's own title back as it leaves).
 */
export function usePageCrumbs(trail: string[] | null): void {
  const { set } = useContext(Ctx);
  const key = trail ? trail.join('\u0000') : null;
  useDocumentTitle(trail && trail.length > 1 ? trail[trail.length - 1] : null);
  useEffect(() => {
    if (key == null) return;
    set(key.split('\u0000'));
    return () => set(null);
  }, [key, set]);
}
