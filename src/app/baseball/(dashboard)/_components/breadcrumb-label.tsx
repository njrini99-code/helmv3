'use client';

// =============================================================================
// breadcrumb-label.tsx — the minimal label-override channel for the shell's
// top-bar breadcrumb trail (COHERENCE_RULING_2026-07-08.md Ruling 4).
//
// PROBLEM: BaseballFairwayShell's buildBreadcrumbs derives every crumb from
// the nav registry / URL segments alone. That works for static routes, but a
// dynamic detail route (players/[id], stats/games/[gameId], dev-plans/[id])
// has no registry entry for the record itself — only the page component,
// already fetching the record server-side, knows the real name.
//
// MECHANISM: a tiny context keyed by PATHNAME (not a single "current" slot),
// so a stale label from a page a user just navigated away from can never leak
// onto the next route regardless of unmount/mount ordering. Detail pages
// render <BreadcrumbLabel name={...} /> once they have the record; it renders
// nothing and registers the label under `usePathname()` for the shell to read
// via `useBreadcrumbLabel(pathname)`. No new state library — just context +
// two hooks, mirroring the render-null mount pattern already used by
// BaseballProgramBrand.
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

interface BreadcrumbLabelContextValue {
  labels: Readonly<Record<string, string>>;
  setLabel: (pathname: string, name: string) => void;
  clearLabel: (pathname: string) => void;
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue | null>(null);

/** Mounted once by BaseballFairwayShell, above both the shell chrome (reader)
 *  and `{children}` (writer) so both sides share one context instance. */
export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Readonly<Record<string, string>>>({});

  const setLabel = useCallback((pathname: string, name: string) => {
    setLabels((prev) => (prev[pathname] === name ? prev : { ...prev, [pathname]: name }));
  }, []);

  const clearLabel = useCallback((pathname: string) => {
    setLabels((prev) => {
      if (!(pathname in prev)) return prev;
      const next = { ...prev };
      delete next[pathname];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ labels, setLabel, clearLabel }), [labels, setLabel, clearLabel]);

  return <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>;
}

/** Shell-side read: the override label registered for the CURRENT pathname, if any. */
export function useBreadcrumbLabel(pathname: string | null): string | undefined {
  const ctx = useContext(BreadcrumbLabelContext);
  if (!ctx || !pathname) return undefined;
  return ctx.labels[pathname];
}

/**
 * Page-side write: render this once the real record name is known (player
 * name, opponent, plan title, …) so the shell's breadcrumb trail shows it
 * instead of falling back to a generic hub label. Renders nothing. Registers
 * under the CURRENT route only and de-registers on unmount/name-change, so
 * navigating away never leaves a stale label for another route to pick up.
 */
export function BreadcrumbLabel({ name }: { name: string | null | undefined }) {
  const pathname = usePathname();
  const ctx = useContext(BreadcrumbLabelContext);
  // Depend on the individual (stable, useCallback-memoized) setters rather
  // than the whole context value — `value` gets a new identity every time
  // ANY page's label changes (shared `labels` state), which would otherwise
  // re-fire this effect for every unrelated label update.
  const setLabel = ctx?.setLabel;
  const clearLabel = ctx?.clearLabel;

  useEffect(() => {
    if (!setLabel || !clearLabel || !pathname || !name) return;
    setLabel(pathname, name);
    return () => clearLabel(pathname);
  }, [setLabel, clearLabel, pathname, name]);

  return null;
}
