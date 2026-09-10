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
import { NavPendingDot } from './NavPending';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { NavItem, NavSection, ShellLinkComponent, ShellUser } from './types';

/**
 * `item.shortcut` (Bridge's only current producer, `AdminShell.tsx`) has
 * always been rendered as a plain visible badge with no machine-readable
 * companion — reachable by a sighted keyboard user who spots the badge, but
 * never announced or discoverable via assistive tech. AdminShell's global
 * keydown handler matches a bare digit as-is and a bare letter only in its
 * Shift-produced uppercase form (deliberately, so letter shortcuts can never
 * collide with a plain, unmodified reserved key — see
 * `RESERVED_LOCAL_SHORTCUTS` in `admin-nav.ts`), so the real gesture behind
 * an uppercase-letter badge is Shift+<letter>, not the bare letter the badge
 * text shows. Formats that gesture correctly for `aria-keyshortcuts`
 * (https://www.w3.org/TR/wai-aria-1.1/#aria-keyshortcuts); anything that
 * isn't exactly one digit or one uppercase letter is left unannounced rather
 * than guessed at.
 */
function ariaKeyShortcut(shortcut: string | undefined): string | undefined {
  if (!shortcut || shortcut.length !== 1) return undefined;
  if (/[0-9]/.test(shortcut)) return shortcut;
  if (/[A-Z]/.test(shortcut)) return `Shift+${shortcut}`;
  return undefined;
}

/**
 * Lets footer/slot children read whether the rail is collapsed without
 * requiring prop-drilling through the caller's render tree.
 */
export const SidebarCollapseContext = createContext<boolean>(false);

/** Hook for sidebar footer slots. Returns `true` when the rail is collapsed. */
export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapseContext);
}

/** The rail's material — see `FairwaySidebarProps['tone']` below. */
export type SidebarTone = 'dark' | 'cream' | 'green';

/**
 * Lets footer/brand slot children (rendered as `brand`/`footer` props from the
 * PRODUCT shell, not this file) read the rail's tone without prop-drilling —
 * mirrors `SidebarCollapseContext` above. Defaults to `'dark'`, matching
 * `FairwaySidebarProps['tone']`'s own default, so a slot rendered outside this
 * provider (tests, Storybook) still gets the long-standing warm-black recipe.
 */
export const SidebarToneContext = createContext<SidebarTone>('dark');

/** Hook for sidebar brand/footer slots. Returns the rail's current tone. */
export function useSidebarTone(): SidebarTone {
  return useContext(SidebarToneContext);
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
  /**
   * Default `true` (existing behavior — no visible scrollbar track on the
   * dark rail). Pass `false` at short viewport heights so the nav's
   * scrollability has a visible affordance (audit finding #2,
   * GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02): with this hidden, a nav that is
   * scrollable (`scrollHeight > clientHeight`) offered no cue at all that
   * the items below the fold existed.
   */
  hideScrollbar?: boolean;
  /**
   * The rail's material (fairway-facelift BRIEF.md §2/§3 — "premium warm
   * cream canvas with structural Fairway green"). Default `'dark'` renders
   * the EXACT existing warm-black recipe byte-for-byte — the baseball and
   * admin shells share the `nav-*` aliases this reads and must never change.
   * `'cream'` (golf desktop only) swaps the rail onto the same `--fw-color-*`
   * surface/text tokens the canvas and cards already use, so it sits beside
   * a cream canvas as one instrument instead of a bolted-on dark SaaS rail.
   */
  tone?: SidebarTone;
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
  tone: SidebarTone;
  Link: ShellLinkComponent;
  onNavigate?: () => void;
}

function SidebarRow({ item, active, collapsed, tone, Link, onNavigate }: SidebarRowProps) {
  const cream = tone === 'cream';
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
        aria-keyshortcuts={ariaKeyShortcut(item.shortcut)}
        title={collapsed ? item.label : undefined}
        className={cn(
          navRowBase,
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3.5 py-2.5',
          // Active row carries the BRAND, not just a lighter grey. On the dark
          // rail a neutral pill reads as "slightly less off" rather than as
          // "you are here"; a green-tinted well plus a green ring makes the
          // single most-looked-at piece of chrome in the app the place the
          // black-and-green identity actually shows up. On the cream rail
          // the row sits on `bg-surface-sunken` already, so the active state
          // is a tinted-glass capsule (`fw-frost-selection`, BRIEF.md §2)
          // instead of a same-toned pill that would vanish into the rail.
          // The capsule itself lives on the inset overlay span below, NOT on
          // this element — `.fw-frost-selection`'s `prefers-reduced-
          // transparency` fallback sets its OWN `color` to the on-accent ink
          // (globals.css), and that rule and this `text-accent-700` utility
          // sit in the same cascade layer, so which one would win on a
          // shared element is a coin flip. Keeping the class off the text-
          // bearing element sidesteps that entirely — see FairwayBottomNav's
          // identical split (frost on an absolute sibling, ink on the row).
          active
            ? cream
              ? 'text-accent-700'
              : 'bg-nav-surface text-nav-text ring-1 ring-nav-accent/25 [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.06)]'
            : cream
              ? 'text-text-secondary hover:bg-surface-tint hover:text-text-primary'
              : 'text-nav-text-dim hover:bg-nav-surface/50 hover:text-nav-text',
        )}
      >
        {active && cream && (
          // Decorative background layer only — no text lives here (see the
          // comment above). `relative z-10` on every visible child below
          // lifts it above this absolutely-positioned overlay so the label,
          // icon and badges are never painted over, in either transparency
          // mode.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-fw-md border fw-frost-selection"
          />
        )}
        <Icon
          size={18}
          aria-hidden
          className={cn(
            'relative z-10 flex-shrink-0 transition-colors',
            active ? (cream ? 'text-accent-700' : 'text-nav-accent') : cream ? 'text-text-secondary' : 'text-nav-text-dim',
          )}
        />
        {!collapsed && (
          <span className="relative z-10 min-w-0 flex-1">
            <span className="block truncate whitespace-nowrap">{item.label}</span>
            {item.description ? (
              <span className={cn('mt-0.5 block truncate text-caption font-normal leading-4', cream ? 'text-text-tertiary' : 'text-nav-text-dim')}>
                {item.description}
              </span>
            ) : null}
          </span>
        )}
        {!collapsed && item.meta ? (
          <span
            className={cn(
              'relative z-10 rounded-full border px-1.5 py-0.5 font-fw-mono text-micro uppercase leading-none',
              cream ? 'border-border-subtle text-text-tertiary' : 'border-white/[0.08] text-nav-text-dim',
            )}
          >
            {item.meta}
          </span>
        ) : null}
        {!collapsed && item.shortcut ? (
          // aria-hidden: the machine-readable form lives on the Link's own
          // aria-keyshortcuts above. Without this, an expanded (non-aria-
          // labelled) row's accessible name would append the raw badge text
          // after the description — "…every source that saw it 3" — which
          // reads as noise, not a shortcut announcement.
          <span
            aria-hidden="true"
            className={cn(
              'relative z-10 rounded border px-1.5 py-0.5 font-fw-mono text-micro leading-none',
              cream ? 'border-border-subtle text-text-tertiary' : 'border-white/[0.08] text-nav-text-dim',
            )}
          >
            {item.shortcut}
          </span>
        ) : null}
        {typeof item.badge === 'number' && item.badge > 0 && !collapsed && (
          <span className="relative z-10 ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent-650 px-1.5 py-0.5 font-fw-mono text-micro font-medium leading-none text-text-on-accent">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {/* In-flight feedback on the row the user actually clicked. Renders
            nothing when idle, so it costs no layout on a settled sidebar.
            Collapsed rows are icon-only and centered, so an inline dot would
            shove the icon off-centre — pin it to the corner there instead. */}
        <NavPendingDot
          className={collapsed ? 'z-10 absolute right-1.5 top-1.5 ml-0' : 'relative z-10'}
        />
        {typeof item.badge === 'number' && item.badge > 0 && collapsed && (
          // The ring is a cutout matching whichever surface the dot sits on
          // (not a "badge token" — see `bg-accent-500` above, unchanged in
          // both tones), so it still reads as inset rather than a mismatched
          // dark halo dropped onto the cream rail.
          <span
            aria-hidden
            className={cn(
              'z-10 absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500 ring-2',
              cream ? 'ring-surface-sunken' : 'ring-nav-bg',
            )}
          />
        )}
      </Link>
      {collapsed && popoutTop !== null && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none fixed left-[88px] z-[calc(var(--fw-z-nav)+1)] w-[268px] -translate-y-1/2 rounded-xl border px-3.5 py-3 text-left shadow-fw-modal',
            cream ? 'border-border-subtle bg-surface' : 'border-white/[0.09] bg-nav-surface',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{ top: popoutTop }}
        >
          <span className="flex items-center justify-between gap-3">
            <span className={cn('truncate text-sm font-semibold', cream ? 'text-text-primary' : 'text-nav-text')}>
              {item.label}
            </span>
            {item.shortcut ? (
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 font-fw-mono text-micro leading-none',
                  cream ? 'border-border-subtle text-text-tertiary' : 'border-white/[0.1] text-nav-text-dim',
                )}
              >
                {item.shortcut}
              </span>
            ) : null}
          </span>
          {item.description ? (
            <span className={cn('mt-1 block text-xs leading-4', cream ? 'text-text-tertiary' : 'text-nav-text-dim')}>
              {item.description}
            </span>
          ) : null}
          {item.meta ? (
            <span
              className={cn(
                'mt-2 inline-flex rounded-full border px-2 py-0.5 font-fw-mono text-micro uppercase leading-none',
                cream ? 'border-border-subtle text-text-tertiary' : 'border-white/[0.08] text-nav-text-dim',
              )}
            >
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
    hideScrollbar = true,
    tone = 'dark',
    className,
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const Link = linkComponent ?? DefaultLink;
  const isCollapsed = isMobile ? false : collapsed;
  const cream = tone === 'cream';

  // Take the first LETTER of each word, ignoring punctuation-only tokens.
  //
  // The old `split(' ').map(n => n[0])` took whatever character led each token,
  // so the demo coach "Coach (Demo)" rendered as "C(" in the rail while the
  // More sheet showed "CD" for the same user (audit 2026-07-24, M1). Any name
  // with a parenthetical, hyphen or middle initial hit this.
  const initials = useCallback((name: string) => {
    return (
      name
        .split(/\s+/)
        .map((word) => word.match(/\p{L}/u)?.[0] ?? '')
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'U'
    );
  }, []);

  return (
    <SidebarCollapseContext.Provider value={isCollapsed}>
    <SidebarToneContext.Provider value={tone}>
    <aside
      ref={ref}
      aria-label="Main navigation"
      // `.on-dark` activates the cream focus-halo from the design-system base
      // layer so the green focus ring survives the black background (§7.2).
      // The cream tone sits on the app's own light surface, where the default
      // focus ring already reads fine, so it skips this scope entirely.
      className={cn(
        'flex flex-col',
        cream ? 'bg-surface-sunken text-text-primary border-r border-border-subtle' : 'on-dark bg-nav-bg text-nav-text',
        // Green: the dark recipe with the nav tokens re-pointed at the
        // Fairway green ramp (design-tokens.css `.fw-rail-green`).
        tone === 'green' && 'fw-rail-green',
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
            'rounded-full shadow-soft transition-colors [transition-duration:var(--fw-dur-fast)] active:translate-y-[0.5px]',
            cream
              ? 'bg-surface text-text-tertiary ring-1 ring-border-subtle hover:bg-surface-tint hover:text-text-primary'
              : 'bg-nav-surface text-nav-text-dim ring-1 ring-white/10 hover:bg-nav-surface hover:text-nav-text',
          )}
        >
          {isCollapsed ? <IconChevronRight size={14} aria-hidden /> : <IconChevronLeft size={14} aria-hidden />}
        </Button>
      )}

      {/* Brand */}
      <div
        className={cn(
          'flex h-16 items-center border-b',
          cream ? 'border-border-subtle' : 'border-white/[0.06]',
          isCollapsed ? 'justify-center px-3' : 'px-5',
        )}
      >
        {brand ?? (
          <span
            className={cn(
              'font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em]',
              cream ? 'text-text-primary' : 'text-nav-text',
            )}
          >
            {isCollapsed ? 'G' : (
              <>
                Golf<span className={cream ? 'text-accent-700' : 'text-nav-accent'}>Helm</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Identity */}
      {user && !isCollapsed && (
        <div className={cn('border-b px-5 pb-3 pt-5', cream ? 'border-border-subtle' : 'border-white/[0.06]')}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-fw-md bg-gradient-to-br from-accent-400 to-accent-700 bg-cover bg-center"
              style={user.avatarUrl ? { backgroundImage: `url("${user.avatarUrl}")` } : undefined}
              /*
                Decorative, not role="img": the user's name renders visibly on
                the very next line, so a label here only doubles it. The old
                `aria-label={avatarUrl ? … : undefined}` also left a NAMELESS
                role="img" on every account without an avatar — the axe
                role-img-alt hit on `.bg-gradient-to-br` (audit L5 / P-33).
              */
              aria-hidden="true"
            >
              {!user.avatarUrl && (
                <span className="font-fw-sans text-body-sm font-medium text-text-on-accent">
                  {initials(user.name)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate font-fw-sans text-body-sm font-medium tracking-[-0.005em]',
                  cream ? 'text-text-primary' : 'text-nav-text',
                )}
              >
                {user.name}
              </p>
              {user.teamName && !identityExtra && (
                <p
                  className={cn(
                    'flex items-center gap-1.5 truncate font-fw-sans text-caption font-normal',
                    cream ? 'text-text-secondary' : 'text-nav-text-dim',
                  )}
                >
                  {/* A fill dot — never `text-accent-700` (theme-flipped INK,
                      not a fill; see tailwind.config.ts). `accent-500` is the
                      same solid green the collapsed badge dot below uses. */}
                  <span
                    className={cn('h-1 w-1 flex-shrink-0 rounded-full', cream ? 'bg-accent-500' : 'bg-nav-accent')}
                    aria-hidden
                  />
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
          'flex-1 overflow-y-auto overflow-x-visible py-4',
          hideScrollbar && 'scrollbar-hidden',
          isCollapsed ? 'px-3' : 'px-3',
        )}
      >
        {sections.map((section, sIdx) => (
          <div key={section.heading ?? `section-${sIdx}`} className={cn(sIdx > 0 && 'mt-5')}>
            {sIdx > 0 && (
              <div className={cn('mx-3 mb-5 border-t', cream ? 'border-border-subtle' : 'border-white/[0.05]')} aria-hidden />
            )}
            {section.heading && !isCollapsed && (
              <p
                className={cn(
                  'px-4 pb-3 pt-1 font-fw-sans text-eyebrow uppercase',
                  cream ? 'text-text-tertiary' : 'text-nav-text-dim',
                )}
              >
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
                  tone={tone}
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
          className={cn('border-t', cream ? 'border-border-subtle' : 'border-white/[0.06]', isCollapsed ? 'p-2' : 'p-3')}
        >
          {footer}
        </motion.div>
      )}
    </aside>
    </SidebarToneContext.Provider>
    </SidebarCollapseContext.Provider>
  );
}));
