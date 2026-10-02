import type { ReactNode } from 'react';
import { clubhouseFontVariables } from '../lib/fonts';
import { Skeleton } from '../ui/States';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';

/**
 * The Clubhouse frame's silhouette for route boundaries that sit ABOVE the
 * dashboard layout (`/golf/loading.tsx`, `(dashboard)/loading.tsx`), where the
 * shell and its role are not known yet. Same chrome as ClubhouseFrame (sidebar
 * on wide screens, top bar, phone tab bar) so the hand-off to the real shell
 * changes only what is inside it. Swap audit F-30: these boundaries painted
 * Fairway's shell and dashboard skeleton on every cold entry, flag on or off.
 * Server-safe: no hooks, no context.
 */
export function ClubhouseShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className={`ch-root ${clubhouseFontVariables}`} data-ui="clubhouse">
      <div className="ch-app">
        <aside className="ch-sidebar" aria-hidden="true">
          <div className="ch-brand">
            <Skeleton width={120} height={14} />
          </div>
        </aside>
        <div className="ch-canvas" id="ch-canvas">
          <header className="ch-topbar" data-phone="root" aria-hidden="true" />
          {children}
        </div>
      </div>
      <nav className="ch-tabbar" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} className="ch-tab">
            <Skeleton width={22} height={22} radius={6} />
            <Skeleton width={40} height={9} />
          </span>
        ))}
      </nav>
    </div>
  );
}
