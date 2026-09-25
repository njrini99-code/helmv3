'use client';

/**
 * A route's own trailing action in the shared top bar (DASH-18).
 *
 * The shell renders one `TopBarRouteActionOutlet` inside the bar's action
 * cluster. A page renders `<TopBarRouteAction>` anywhere in its tree and the
 * children portal into that outlet, so the page keeps its state and handlers
 * while the control sits in the one app bar every other route uses. Nothing
 * renders when no shell outlet is mounted (tests, standalone pages).
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Slot = { node: HTMLElement | null; setNode: (node: HTMLElement | null) => void };

const TopBarRouteActionContext = createContext<Slot | null>(null);

export function TopBarRouteActionProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return <TopBarRouteActionContext.Provider value={{ node, setNode }}>{children}</TopBarRouteActionContext.Provider>;
}

export function TopBarRouteActionOutlet() {
  const slot = useContext(TopBarRouteActionContext);
  return <div ref={slot?.setNode} data-slot="fw-topbar-route-action" className="flex items-center gap-1 empty:hidden" />;
}

export function TopBarRouteAction({ children }: { children: ReactNode }) {
  const node = useContext(TopBarRouteActionContext)?.node ?? null;
  return node ? createPortal(children, node) : null;
}
