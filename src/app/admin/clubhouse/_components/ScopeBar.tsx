'use client';

import { useId, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  SCOPE_PARAMS,
  SCOPE_ROLES,
  SCOPE_VIEWPORTS,
  parseScope,
  type ScopeRole,
  type ScopeViewport,
} from '@/lib/admin/clubhouse/screens';
import { DEFAULT_LIVE, LIVE_PLATFORMS, LIVE_WINDOWS, PLATFORM_WORDS, parseLiveScope } from '@/lib/admin/clubhouse/live-scope';

export interface ScopeBarPage {
  id: string;
  name: string;
}

const ROLE_LABEL: Record<ScopeRole, string> = {
  all: 'All roles',
  coach: 'Coach',
  player: 'Player',
  'signed-out': 'Signed out',
};

const VP_LABEL: Record<ScopeViewport, string> = { all: 'Desk and phone', desk: 'Desk', phone: 'Phone' };

/** Params a scope change resets: a result page past the end of a narrower slice would show nothing. */
const RESET_ON_CHANGE = ['p'];

/**
 * The scope bar (plan §7.3, BR-1503): page, role and viewport, kept in the URL so a pasted link reopens the same
 * slice and moving between Clubhouse screens keeps it (every screen link is built with `withScope`). Native selects:
 * one tap on a phone opens the system picker, and they work with a keyboard as they are.
 *
 * Window, platform, release and team need signals; they join the bar with the live lenses (PR 3).
 */
export function ScopeBar({ pages, live = false }: { pages: readonly ScopeBarPage[]; live?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();
  const current = Object.fromEntries(searchParams?.entries() ?? []);
  const scope = parseScope(current, pages.map((p) => p.id));
  const liveScope = parseLiveScope(current);
  const scoped =
    scope.page !== null || scope.role !== 'all' || scope.vp !== 'all' || liveScope.w !== DEFAULT_LIVE.w || liveScope.pf !== DEFAULT_LIVE.pf;

  function go(next: Partial<Record<(typeof SCOPE_PARAMS)[number] | 'w' | 'pf', string>>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const key of RESET_ON_CHANGE) params.delete(key);
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === 'all' || (key === 'w' && value === DEFAULT_LIVE.w)) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const selectClass =
    'h-9 min-w-0 max-w-full rounded-fw-sm border border-border-control bg-surface px-2 text-body-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:h-11';

  return (
    <div
      role="group"
      aria-label="Scope"
      data-br={BR.shell.scopeBar}
      aria-busy={pending || undefined}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken p-2',
        pending && 'cursor-progress',
      )}
    >
      <label htmlFor={`${id}-page`} className="sr-only">
        Page
      </label>
      <select
        id={`${id}-page`}
        value={scope.page ?? 'all'}
        onChange={(e) => go({ page: e.target.value })}
        className={cn(selectClass, 'flex-1 basis-40 sm:flex-none')}
      >
        <option value="all">All pages</option>
        {pages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} {p.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-role`} className="sr-only">
        Role
      </label>
      <select id={`${id}-role`} value={scope.role} onChange={(e) => go({ role: e.target.value })} className={cn(selectClass, 'flex-1 basis-28 sm:flex-none')}>
        {SCOPE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-vp`} className="sr-only">
        Viewport
      </label>
      <select id={`${id}-vp`} value={scope.vp} onChange={(e) => go({ vp: e.target.value })} className={cn(selectClass, 'flex-1 basis-28 sm:flex-none')}>
        {SCOPE_VIEWPORTS.map((v) => (
          <option key={v} value={v}>
            {VP_LABEL[v]}
          </option>
        ))}
      </select>
      {live ? (
        <>
          <label htmlFor={`${id}-w`} className="sr-only">
            Window
          </label>
          <select id={`${id}-w`} value={liveScope.w} onChange={(e) => go({ w: e.target.value })} className={cn(selectClass, 'flex-1 basis-24 sm:flex-none')}>
            {LIVE_WINDOWS.map((w) => (
              <option key={w} value={w}>
                Last {w}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-pf`} className="sr-only">
            Platform
          </label>
          <select id={`${id}-pf`} value={liveScope.pf} onChange={(e) => go({ pf: e.target.value })} className={cn(selectClass, 'flex-1 basis-32 sm:flex-none')}>
            {LIVE_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'All platforms' : PLATFORM_WORDS[p]}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {scoped ? (
        <button
          type="button"
          onClick={() => go({ page: 'all', role: 'all', vp: 'all', w: DEFAULT_LIVE.w, pf: 'all' })}
          className="inline-flex h-9 items-center gap-1 rounded-fw-sm px-2 text-caption font-medium text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:h-11"
        >
          <X size={14} aria-hidden />
          Clear scope
        </button>
      ) : null}
    </div>
  );
}
