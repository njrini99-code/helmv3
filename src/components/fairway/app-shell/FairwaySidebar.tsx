'use client';

/**
 * ============================================================================
 * Fairway · FairwaySidebar (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The warm-black recessive nav rail (DESIGN-SYSTEM §6 "Sidebar"). Restyles the
 * STRUCTURE/nav-model of `src/components/golf/layout/GolfSidebar` — primary +
 * secondary sections, icon + label + optional badge, segment-boundary active
 * matching, collapsible width — as a NEW Fairway component. The original file
 * is neither imported nor edited.
 *
 * Material (§1, §4.3, §7.2):
 *   • Solid warm-black `nav-bg` (#0C0A09 — NOT pure #000), the recessive chrome.
 *   • `nav-text-dim` labels; the work surface stays the brightest thing.
 *   • Active row = `nav-surface` pill + `nav-accent` left marker + a *whisper* of
 *     glass sheen (the only glass touch the sidebar gets; the rail stays solid).
 *   • Section groups with quiet `overline` headings.
 *   • `.on-dark` scope → focus-visible green ring gains a cream halo so it
 *     survives the black background.
 *   • Motion: slow width/opacity transitions (--fw-ease-glide), reduced-motion safe.
 * ========================================================================== */

import { createContext, forwardRef, memo, useCallback, useContext, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { NavItem, NavSection, ShellLinkComponent, ShellUser } from './types';

/**
 * Lets footer/slot children read whether the rail is collapsed without
 * requiring prop-drilling through the caller's render tree.
 */
export const SidebarCollapseContext = createContext<boolean>(false);

/** Hook for sidebar footer slots. Returns `true` when the rail is collapsed. */
export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapseContext);
}

/** Default link element — a plain anchor (works in isolation + tests). */
const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export interface FairwaySidebarProps {
  /** Grouped nav (primary + secondary + any further sections). */
  sections: readonly NavSection[];
  /** Identity block at the top of the rail. */
  user?: ShellUser;
  /** Brand wordmark slot (logo). Falls back to a "GolfHelm" wordmark. */
  brand?: React.ReactNode;
  /** Pinned footer slot (settings / sign-out). */
  footer?: React.ReactNode;
  /**
   * Extra content rendered inside the identity block, below the user name/team.
   * Used for the team-switcher control (visible only to multi-team coaches).
   * Hidden when the rail is collapsed (icon-only mode).
   */
  identityExtra?: React.ReactNode;
  /** Current pathname for active matching (pass `usePathname()` from the page). */
  pathname?: string;
  /** Collapsed (icon-only) rail. */
  collapsed?: boolean;
  /** Toggle handler; when provided, the collapse affordance renders. */
  onToggleCollapsed?: () => void;
  /** Render mobile-expanded (full width, no fixed positioning, no collapse). */
  isMobile?: boolean;
  /** Fires on any nav link activation (e.g. close the mobile drawer). */
  onNavigate?: () => void;
  /** Link element (defaults to a plain `<a>`; pass Next's `<Link>` in the app). */
  linkComponent?: ShellLinkComponent;
  className?: string;
}

/** Segment-boundary active match (mirrors GolfSidebar's `isActive`). */
function matchActive(href: string, pathname?: string): boolean {
  if (!pathname) return false;
  // A bare dashboard root matches only exactly (avoid catching every child).
  const segments = href.split('/').filter(Boolean);
  if (segments.length <= 2) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

const navRowBase = cn(
  // min-h-11 (44px) meets the iOS touch-target minimum for iPad touch.
  'group relative flex min-h-11 items-center gap-3 rounded-fw-md',
  // spec §3.1 `label` role (13px) — the nav row voice
  'text-body-sm font-medium font-fw-sans tracking-[-0.005em]',
  'transition-[color,background-color] [transition-duration:var(--fw-dur-base)] [transition-timing-function:var(--fw-ease-glide)]',
  'motion-reduce:transition-none',
);

interface SidebarRowProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  Link: ShellLinkComponent;
  onNavigate?: () => void;
}

function SidebarRow({ item, active, collapsed, Link, onNavigate }: SidebarRowProps) {
  const Icon = item.icon;
  const rowRef = useRef<HTMLDivElement>(null);
  const [popoutTop, setPopoutTop] = useState<number | null>(null);

  function showPopout() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setPopoutTop(rect.top + rect.height / 2);
  }

  function hidePopout() {
    setPopoutTop(null);
  }

  return (
    <div
      ref={rowRef}
      className="group/row relative"
    >
      <Link
        href={item.href}
        onClick={onNavigate}
        onMouseEnter={showPopout}
        onMouseLeave={hidePopout}
        onFocus={showPopout}
        onBlur={hidePopout}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          navRowBase,
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3.5 py-2.5',
          active
            ? 'bg-nav-surface text-nav-text ring-1 ring-white/[0.08] [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.05)]'
            : 'text-nav-text-dim hover:bg-nav-surface/60 hover:text-nav-text',
        )}
      >
        <Icon
          size={18}
          aria-hidden
          className={cn('flex-shrink-0 transition-colors', active ? 'text-nav-accent' : 'text-nav-text-dim')}
        />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate whitespace-nowrap">{item.label}</span>
            {item.description ? (
              <span className="mt-0.5 block truncate text-caption font-normal leading-4 text-nav-text-dim">
                {item.description}
              </span>
            ) : null}
          </span>
        )}
        {!collapsed && item.meta ? (
          <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 font-fw-mono text-micro uppercase leading-none text-nav-text-dim">
            {item.meta}
          </span>
        ) : null}
        {!collapsed && item.shortcut ? (
          <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-fw-mono text-micro leading-none text-nav-text-dim">
            {item.shortcut}
          </span>
        ) : null}
        {typeof item.badge === 'number' && item.badge > 0 && !collapsed && (
          <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent-700 px-1.5 py-0.5 font-fw-mono text-micro font-medium leading-none text-text-on-accent">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {typeof item.badge === 'number' && item.badge > 0 && collapsed && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-nav-bg"
          />
        )}
      </Link>
      {collapsed && popoutTop !== null && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none fixed left-[88px] z-[calc(var(--fw-z-nav)+1)] w-[268px] -translate-y-1/2 rounded-xl border border-white/[0.09] bg-nav-surface px-3.5 py-3 text-left shadow-fw-modal',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{ top: popoutTop }}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-nav-text">{item.label}</span>
            {item.shortcut ? (
              <span className="rounded border border-white/[0.1] px-1.5 py-0.5 font-fw-mono text-micro leading-none text-nav-text-dim">
                {item.shortcut}
              </span>
            ) : null}
          </span>
          {item.description ? (
            <span className="mt-1 block text-xs leading-4 text-nav-text-dim">{item.description}</span>
          ) : null}
          {item.meta ? (
            <span className="mt-2 inline-flex rounded-full border border-white/[0.08] px-2 py-0.5 font-fw-mono text-micro uppercase leading-none text-nav-text-dim">
              {item.meta}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

// React.memo (perf packet [shell-render-hygiene]): the desktop rail + mobile
// drawer both mount an instance of this component, and AppShell re-renders on
// every pathname change — memo skips FairwaySidebar's own render (row mapping,
// active-match recompute) whenever its actual props are referentially equal,
// which callers now uphold by memoizing `sections`/`user` upstream.
export const FairwaySidebar = memo(forwardRef<HTMLElement, FairwaySidebarProps>(function FairwaySidebar(
  {
    sections,
    user,
    brand,
    footer,
    identityExtra,
    pathname,
    collapsed = false,
    onToggleCollapsed,
    isMobile = false,
    onNavigate,
    linkComponent,
    className,
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const Link = linkComponent ?? DefaultLink;
  const isCollapsed = isMobile ? false : collapsed;

  const initials = useCallback((name: string) => {
    return (
      name
        .split(' ')
        .map((n) => n[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'U'
    );
  }, []);

  return (
    <SidebarCollapseContext.Provider value={isCollapsed}>
    <aside
      ref={ref}
      aria-label="Main navigation"
      // `.on-dark` activates the cream focus-halo from the design-system base
      // layer so the green focus ring survives the black background (§7.2).
      className={cn(
        'on-dark flex flex-col bg-nav-bg text-nav-text',
        'transition-[width] [transition-duration:var(--fw-dur-slow)] [transition-timing-function:var(--fw-ease-glide)] motion-reduce:transition-none',
        isMobile
          ? 'h-full w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : cn('fixed left-0 top-0 z-[var(--fw-z-nav)] h-dvh pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]', isCollapsed ? 'w-[76px]' : 'w-[260px]'),
        className,
      )}
    >
      {/* Collapse affordance (desktop only) */}
      {!isMobile && onToggleCollapsed && (
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'absolute -right-3 top-7 z-10 flex h-6 w-6 min-h-0 items-center justify-center p-0',
            'rounded-full bg-nav-surface text-nav-text-dim ring-1 ring-white/10',
            'shadow-soft transition-colors [transition-duration:var(--fw-dur-fast)]',
            'hover:bg-nav-surface hover:text-nav-text',
            'active:translate-y-[0.5px]',
          )}
        >
          {isCollapsed ? <IconChevronRight size={14} aria-hidden /> : <IconChevronLeft size={14} aria-hidden />}
        </Button>
      )}

      {/* Brand */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-white/[0.06]',
          isCollapsed ? 'justify-center px-3' : 'px-5',
        )}
      >
        {brand ?? (
          <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-nav-text">
            {isCollapsed ? 'G' : (
              <>
                Golf<span className="text-nav-accent">Helm</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Identity */}
      {user && !isCollapsed && (
        <div className="border-b border-white/[0.06] px-5 pb-3 pt-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-fw-md bg-gradient-to-br from-accent-400 to-accent-700 bg-cover bg-center"
              style={user.avatarUrl ? { backgroundImage: `url("${user.avatarUrl}")` } : undefined}
              role="img"
              aria-label={user.avatarUrl ? `${user.name} avatar` : undefined}
            >
              {!user.avatarUrl && (
                <span className="font-fw-sans text-body-sm font-medium text-text-on-accent">
                  {initials(user.name)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-fw-sans text-body-sm font-medium tracking-[-0.005em] text-nav-text">
                {user.name}
              </p>
              {user.teamName && !identityExtra && (
                <p className="flex items-center gap-1.5 truncate font-fw-sans text-caption font-normal text-nav-text-dim">
                  <span className="h-1 w-1 flex-shrink-0 rounded-full bg-nav-accent" aria-hidden />
                  {user.teamName}
                </p>
              )}
            </div>
          </div>
          {/* Team-switcher slot — only rendered for multi-team coaches, hidden when collapsed. */}
          {identityExtra && <div className="mt-2">{identityExtra}</div>}
        </div>
      )}

      {/* Navigation */}
      <nav
        aria-label="Sections"
        className={cn(
          'scrollbar-hidden flex-1 overflow-y-auto overflow-x-visible py-4',
          isCollapsed ? 'px-3' : 'px-3',
        )}
      >
        {sections.map((section, sIdx) => (
          <div key={section.heading ?? `section-${sIdx}`} className={cn(sIdx > 0 && 'mt-5')}>
            {sIdx > 0 && <div className="mx-3 mb-5 border-t border-white/[0.05]" aria-hidden />}
            {section.heading && !isCollapsed && (
              <p className="px-4 pb-3 pt-1 font-fw-sans text-eyebrow uppercase text-nav-text-dim">
                {section.heading}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <SidebarRow
                  key={item.href + item.label}
                  item={item}
                  active={
                    item.active ??
                    (item.activeMatch && pathname
                      ? item.activeMatch(pathname)
                      : matchActive(item.href, pathname))
                  }
                  collapsed={isCollapsed}
                  Link={Link}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <motion.div
          initial={false}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          className={cn('border-t border-white/[0.06]', isCollapsed ? 'p-2' : 'p-3')}
        >
          {footer}
        </motion.div>
      )}
    </aside>
    </SidebarCollapseContext.Provider>
  );
}));
