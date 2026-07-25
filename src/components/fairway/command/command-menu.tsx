'use client';

/**
 * ============================================================================
 * Fairway · command · CommandMenu (the ⌘K palette)
 * ----------------------------------------------------------------------------
 * The global find-and-act surface — a `cmdk` palette floated inside the warm
 * cream Liquid Glass overlay (DESIGN-SYSTEM.md §4.3 allow-list #2 "Command
 * palette (⌘K) — the summoned overlay panel, `--blur-strong`"; §6 "cmdk palette
 * (routes + actions + recent) on warm `.glass-strong` over scrim").
 *
 * Behavior is headless via `cmdk` (Command): it owns the fuzzy matcher, the
 * roving keyboard navigation (↑/↓ / Home / End / Enter), scroll-into-view of the
 * active item, and the empty state. We own ONLY the warm chrome: the dim scrim,
 * the glass panel (local GlassSurface), the grouped/recent/zero-state layout,
 * the cinematic materialize motion, focus restore, scroll-lock, and Escape.
 *
 * Composable, data-driven API (a reusable primitive — NOT wired to any route):
 *  - `open` / `onOpenChange` controlled visibility (also self-binds ⌘K/Ctrl-K
 *    when `bindShortcut` is set),
 *  - `groups`      → grouped command results,
 *  - `recent`      → recent items (shown above groups when the query is empty),
 *  - `suggestions` → zero-state suggestions (shown when there's no recent + empty
 *    query — "what can I do here"),
 *  - `onSelect(item)` fired on Enter/click; the consumer routes/acts.
 *
 * Motion: the glass panel MATERIALIZES (opacity 0→1 + scale 0.97→1 + small
 * upward drift) on `--ease-emph`, the scrim crossfades — both collapse to
 * opacity-only when `prefers-reduced-motion` (framer-motion `useReducedMotion`).
 * We never animate `backdrop-filter` (jank).
 *
 * A11y: role="dialog" aria-modal panel, focus moves to the input on open and is
 * restored to the opener on close, body scroll locked while open, Escape closes,
 * scrim click closes, visible green focus ring on every interactive element.
 * Because we declare aria-modal, we also TRAP Tab/Shift+Tab inside the panel and
 * mark the rest of the page `inert` while open (matching ModalShell) — without a
 * trap, focus would escape to background controls while the UI claims modality
 * (WCAG 2.4.3 + 4.1.2).
 * ============================================================================
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import { Skeleton } from '@/components/fairway/feedback';
import { GlassSurface } from './glass-surface';
import {
  SearchGlyph,
  ArrowUpDownGlyph,
  ReturnGlyph,
  ClockGlyph,
  SparkleGlyph,
  GoGlyph,
} from './icons';

/* ── public types ────────────────────────────────────────────────────────── */

export interface CommandItem {
  /** Stable unique id (used as cmdk value + React key). */
  id: string;
  /** Primary label. */
  label: string;
  /** Optional secondary line. */
  description?: string;
  /** Optional leading icon node (decorative). */
  icon?: ReactNode;
  /** Extra search terms folded into the fuzzy match. */
  keywords?: string[];
  /** Optional trailing shortcut hint (e.g. "G then R"). */
  shortcut?: string;
  /** Tone for the leading icon chip — drives a warm accent / danger tint. */
  tone?: 'default' | 'accent' | 'danger';
  /** Disable selection of this row. */
  disabled?: boolean;
  /** Arbitrary payload the consumer reads in onSelect. */
  data?: unknown;
}

export interface CommandGroup {
  /** Group heading (omit for an unlabeled group). */
  heading?: string;
  items: CommandItem[];
}

export interface CommandMenuProps {
  /** Controlled open state. */
  open: boolean;
  /** Open/close callback (also called on Escape / scrim click / select). */
  onOpenChange: (open: boolean) => void;
  /** Grouped command results. */
  groups: CommandGroup[];
  /** Recent items, surfaced above groups while the query is empty. */
  recent?: CommandItem[];
  /** Zero-state suggestions (empty query + no recent). */
  suggestions?: CommandItem[];
  /** Fired when an item is chosen. Returns the picked item; you route/act. */
  onSelect: (item: CommandItem) => void;
  /** Input placeholder. */
  placeholder?: string;
  /** Empty-results message (shown when a query matches nothing). */
  emptyMessage?: string;
  /** Loading flag — shows a quiet loading row instead of results. */
  loading?: boolean;
  /** Self-bind ⌘K / Ctrl-K to toggle. Default `true`. */
  bindShortcut?: boolean;
  /** Accessible label for the dialog. Default "Command menu". */
  label?: string;
  /** Extra classes for the glass panel. */
  className?: string;
}

/* ── motion variants (gated on reduced-motion at call sites) ─────────────── */

const EASE_EMPH = [0.32, 0.72, 0, 1] as const;

const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.28, ease: EASE_EMPH } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE_EMPH } },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -8 },
  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.38, ease: EASE_EMPH },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -6,
    transition: { duration: 0.18, ease: EASE_EMPH },
  },
};

/* ── row ─────────────────────────────────────────────────────────────────── */

function toneChip(tone: CommandItem['tone']) {
  switch (tone) {
    case 'accent':
      return 'bg-accent-100 text-accent-700 group-data-[selected=true]:bg-accent-200';
    case 'danger':
      return 'bg-fw-danger-bg text-fw-danger-ink';
    default:
      return 'bg-inset text-text-secondary group-data-[selected=true]:bg-accent-100 group-data-[selected=true]:text-accent-700';
  }
}

interface RowProps {
  item: CommandItem;
  onPick: (item: CommandItem) => void;
}

function CommandRow({ item, onPick }: RowProps) {
  return (
    <Command.Item
      // Value is what cmdk fuzzy-matches against — fold in label + desc + keywords.
      value={`${item.label} ${item.description ?? ''} ${(item.keywords ?? []).join(' ')} ${item.id}`}
      disabled={item.disabled}
      onSelect={() => onPick(item)}
      data-slot="command-item"
      className={cn(
        'group flex cursor-pointer select-none items-center gap-3 rounded-fw-md px-3 py-2.5 outline-none',
        'text-text-secondary',
        'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        // cmdk drives selection via [data-selected]; keep mouse hover in sync
        'data-[selected=true]:bg-accent-50 data-[selected=true]:text-text-primary',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
      )}
    >
      {item.icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-fw-sm transition-colors [transition-duration:180ms]',
            '[&_svg]:h-[18px] [&_svg]:w-[18px]',
            toneChip(item.tone),
          )}
        >
          {item.icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-fw-sans text-body font-medium leading-tight text-text-primary">
          {item.label}
        </span>
        {item.description ? (
          <span className="truncate font-fw-sans text-caption font-normal leading-tight text-text-tertiary">
            {item.description}
          </span>
        ) : null}
      </span>

      {item.shortcut ? (
        <kbd
          aria-hidden="true"
          className="ml-auto hidden shrink-0 select-none rounded-fw-sm border border-border-subtle bg-surface px-1.5 py-0.5 font-fw-mono text-eyebrow font-medium tracking-normal text-text-tertiary sm:inline-block"
        >
          {item.shortcut}
        </kbd>
      ) : null}

      {/* "go" affordance appears only on the active row */}
      <GoGlyph
        aria-hidden="true"
        className="ml-1 h-4 w-4 shrink-0 text-accent-600 opacity-0 transition-opacity [transition-duration:180ms] group-data-[selected=true]:opacity-100"
      />
    </Command.Item>
  );
}

/* ── component ───────────────────────────────────────────────────────────── */

/**
 * CommandMenu — the summoned ⌘K palette. Controlled via `open`/`onOpenChange`;
 * composes the warm GlassSurface + cmdk engine into a keyboardable global
 * find-and-act surface. Reusable: pass any groups/recent/suggestions + handle
 * selection yourself.
 */
export function CommandMenu({
  open,
  onOpenChange,
  groups,
  recent,
  suggestions,
  onSelect,
  placeholder = 'Search commands, players, rounds…',
  emptyMessage = 'No results found.',
  loading = false,
  bindShortcut = true,
  label = 'Command menu',
  className,
}: CommandMenuProps) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // Premium scroll-edge fade: a long results list bleeds top/bottom into the
  // glass instead of hard-cutting (Raycast/Spotlight feel). No fade when short.
  const { ref: listFadeRef, fadeStyle: listFadeStyle } = useScrollFade<HTMLDivElement>('y');

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  // Self-bound ⌘K / Ctrl-K toggle.
  useEffect(() => {
    if (!bindShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindShortcut, open, onOpenChange]);

  // Scroll-lock + focus capture/restore + background-inert while open.
  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Isolate the background: mark every top-level body child OTHER than our
    // portal root `inert` (removes it from tab order + the a11y tree) so a
    // declared aria-modal surface actually behaves modally. We portal into
    // <body>, so our root is a direct body child tagged data-fw-command-root.
    const inerted: HTMLElement[] = [];
    Array.from(document.body.children).forEach((el) => {
      if (
        el instanceof HTMLElement &&
        !el.hasAttribute('data-fw-command-root') &&
        !el.inert
      ) {
        el.inert = true;
        inerted.push(el);
      }
    });
    // Defer focus to next frame so the panel is in the DOM.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
      inerted.forEach((el) => {
        el.inert = false;
      });
      cancelAnimationFrame(raf);
      // Restore focus to whatever opened the menu.
      openerRef.current?.focus?.();
    };
  }, [open]);

  // Reset the query whenever the menu closes so it reopens clean.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const handlePick = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return;
      onSelect(item);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const isEmptyQuery = query.trim().length === 0;
  const hasRecent = !!recent && recent.length > 0;
  const hasSuggestions = !!suggestions && suggestions.length > 0;
  // Zero-state = empty query, no recent, but we have suggestions.
  const showSuggestions = isEmptyQuery && !hasRecent && hasSuggestions;
  const showRecent = isEmptyQuery && hasRecent;

  const motionProps = useMemo(
    () =>
      reduceMotion
        ? {
            scrim: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
            panel: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
          }
        : {
            scrim: { variants: scrimVariants, initial: 'hidden', animate: 'shown', exit: 'exit' },
            panel: { variants: panelVariants, initial: 'hidden', animate: 'shown', exit: 'exit' },
          },
    [reduceMotion],
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="fw-command-root"
          data-fw-command-root=""
          className="fixed inset-0 z-[70] flex items-start justify-center"
          // pad from top — palette sits in the upper third (Apple/Raycast feel)
          style={{ paddingTop: 'max(12vh, 4rem)', paddingLeft: '1rem', paddingRight: '1rem' }}
        >
          {/* Dim scrim — cheap, NOT a blurred backdrop (§4.3 perf rule). */}
          <motion.button
            type="button"
            aria-label="Close command menu"
            onClick={close}
            className="absolute inset-0 cursor-default bg-[oklch(0.18_0.01_55_/_0.28)]"
            {...motionProps.scrim}
            transition={reduceMotion ? { duration: 0.18 } : undefined}
          />

          {/* Glass panel */}
          <motion.div
            ref={panelRef}
            className="relative w-full max-w-xl"
            {...motionProps.panel}
            transition={reduceMotion ? { duration: 0.18 } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
              }
              // Trap Tab/Shift+Tab within the panel — cmdk's `loop` only loops
              // ARROW-key item nav, not Tab, so without this focus would leave
              // the modal for background controls (WCAG 2.4.3 / 4.1.2).
              if (e.key === 'Tab') {
                const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
                  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
                );
                if (!focusables || focusables.length === 0) {
                  // Nothing else focusable — keep focus on the input.
                  e.preventDefault();
                  inputRef.current?.focus();
                  return;
                }
                const first = focusables[0]!;
                const last = focusables[focusables.length - 1]!;
                const active = document.activeElement;
                if (e.shiftKey && active === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && active === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <GlassSurface
              intensity="strong"
              className={cn('overflow-hidden', className)}
            >
              <Command
                label={label}
                loop
                shouldFilter={!loading}
                // Search the folded value strings; cmdk does the fuzzy ranking.
                className="flex max-h-[min(70vh,34rem)] flex-col"
              >
                {/* Input row */}
                <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3.5">
                  <SearchGlyph aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-text-tertiary" />
                  <Command.Input
                    ref={inputRef}
                    value={query}
                    onValueChange={setQuery}
                    placeholder={placeholder}
                    aria-controls={listId}
                    className={cn(
                      'min-w-0 flex-1 bg-transparent font-fw-sans text-body text-text-primary',
                      'placeholder:text-text-tertiary outline-none focus:outline-none',
                    )}
                  />
                  <kbd
                    aria-hidden="true"
                    className="hidden shrink-0 select-none rounded-fw-sm border border-border-subtle bg-surface px-1.5 py-0.5 font-fw-mono text-eyebrow font-medium tracking-normal text-text-tertiary sm:inline-block"
                  >
                    ESC
                  </kbd>
                </div>

                {/* Results */}
                <Command.List
                  ref={listFadeRef}
                  style={listFadeStyle}
                  id={listId}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
                >
                  {loading ? (
                    <div className="space-y-2 p-1" aria-live="polite" aria-busy="true">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-fw-md px-3 py-2.5"
                        >
                          <Skeleton className="h-8 w-8 shrink-0 rounded-fw-sm" />
                          <span className="flex flex-1 flex-col gap-1.5">
                            <Skeleton className="h-3 w-1/3 rounded-full" />
                            <Skeleton className="h-2.5 w-1/2 rounded-full" />
                          </span>
                        </div>
                      ))}
                      <span className="sr-only">Loading results…</span>
                    </div>
                  ) : (
                    <>
                      <Command.Empty className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <SparkleGlyph aria-hidden="true" className="h-6 w-6 text-text-tertiary" />
                        <p className="font-fw-sans text-body-sm text-text-secondary">{emptyMessage}</p>
                      </Command.Empty>

                      {/* Recent — empty query, when present. */}
                      {showRecent ? (
                        <Command.Group
                          heading={
                            <span className="flex items-center gap-1.5">
                              <ClockGlyph aria-hidden="true" className="h-3.5 w-3.5" />
                              Recent
                            </span>
                          }
                          className="fw-cmd-group"
                        >
                          {recent!.map((item) => (
                            <CommandRow key={`recent-${item.id}`} item={item} onPick={handlePick} />
                          ))}
                        </Command.Group>
                      ) : null}

                      {/* Zero-state suggestions. */}
                      {showSuggestions ? (
                        <Command.Group
                          heading={
                            <span className="flex items-center gap-1.5">
                              <SparkleGlyph aria-hidden="true" className="h-3.5 w-3.5" />
                              Suggestions
                            </span>
                          }
                          className="fw-cmd-group"
                        >
                          {suggestions!.map((item) => (
                            <CommandRow key={`sugg-${item.id}`} item={item} onPick={handlePick} />
                          ))}
                        </Command.Group>
                      ) : null}

                      {/* Grouped results. */}
                      {groups.map((group, gi) => {
                        if (group.items.length === 0) return null;
                        return (
                          <Command.Group
                            key={group.heading ?? `group-${gi}`}
                            heading={group.heading}
                            className="fw-cmd-group"
                          >
                            {group.items.map((item) => (
                              <CommandRow key={item.id} item={item} onPick={handlePick} />
                            ))}
                          </Command.Group>
                        );
                      })}
                    </>
                  )}
                </Command.List>

                {/* Footer keyboard hints */}
                <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-fw-sans text-eyebrow font-normal tracking-normal text-text-tertiary">
                    <ArrowUpDownGlyph aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>Navigate</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-fw-sans text-eyebrow font-normal tracking-normal text-text-tertiary">
                    <ReturnGlyph aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>Select</span>
                  </div>
                </div>
              </Command>

              {/* Scoped cmdk group-heading styling (warm overline). Keyed off
                  our own `.fw-cmd-group` class so it can't leak app-wide. */}
              <style>{`
                .fw-cmd-group [cmdk-group-heading]{
                  padding:0.5rem 0.75rem 0.25rem;
                  font-family:var(--fw-font-sans);
                  font-size:11px;line-height:16px;font-weight:600;
                  letter-spacing:0.07em;text-transform:uppercase;
                  color:var(--fw-color-text-tertiary);
                }
                .fw-cmd-group:not(:first-child){margin-top:0.25rem;}
              `}</style>
            </GlassSurface>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
