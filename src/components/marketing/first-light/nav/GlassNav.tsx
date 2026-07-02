'use client';

/**
 * GlassNav — the M1 hero's floating G1 glass pill.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M1 ("G1 glass nav floating"), built
 * under the ⚠ SAGE & CREAM AMENDMENT (Nick, 2026-07-02) + the
 * `landing-hero+nav` lane brief. One detached, centered `.fl-glass-1` pill:
 * wordmark, "Log in" (opens a sport-chooser popover → `/golf/login` /
 * `/baseball/login`), "See it in action" (→ `#cta`, the M8 anchor the
 * `landing-portals+cta` lane owns the real handler for — see CONTRACTS.md
 * "CTA architecture").
 *
 * Ink note: `.fl-glass-1`'s own tint (`rgba(var(--fl-cream-rgb), 0.55)`) is
 * a bright, cream-leaning glass by design — it reads light regardless of
 * what's behind it (photo highlight or the darker vignette further down
 * the hero). Cream-on-cream text there would be close to illegible, so
 * every label on `.fl-glass-1`/`.fl-glass-2` surfaces in this file uses
 * sage-ink, not cream — the inverse of the solid sage-deep CTA pill, which
 * keeps cream text (dark chrome → light ink; light glass → dark ink).
 *
 * Desktop: the popover is a small dropdown anchored under the "Log in"
 * trigger. Mobile (< `sm`): it becomes a small bottom sheet with a scrim,
 * per the lane brief ("popover becomes a small bottom sheet").
 *
 * Brand lockup (Amendment 3 §A.3): `HelmMark` (18–20px, sage-ink) +
 * "Helm Sports Labs" — no more type-only wordmark. The mark sits in its own
 * `group`-hovered span so the wordmark link's hover/focus state turns it a
 * few degrees on the house spring easing (§B.8's `cubic-bezier(0.34,1.56,
 * 0.64,1)`) — a ship's wheel turning a notch. Transform-only; dead under
 * `prefers-reduced-motion` via `motion-reduce:` (pure CSS, no JS state
 * needed for a hover-only effect). The underline wipe (`fl-link-underline`)
 * moves to just the text span so it doesn't run under the icon.
 *
 * UI chrome uses `font-annual` (Space Grotesk) — Fraunces is reserved for
 * display/serif moments (see `../fonts.ts`).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HelmMark, SportGlyph } from '../brand';

export interface GlassNavProps {
  className?: string;
}

/** House cinematic-settle curve — see CONTRACTS.md "Motion discipline". */
const EASE_GLIDE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const SPORT_LINKS = [
  { label: 'GolfHelm', sport: 'golf', tagline: 'Coastal season, dialed in.', href: '/golf/login' },
  { label: 'BaseballHelm', sport: 'baseball', tagline: 'Yard at dusk, ready to go.', href: '/baseball/login' },
] as const;

export function GlassNav({ className }: GlassNavProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click/tap and on Escape (returning focus to the
  // trigger) — the popover isn't a true modal on desktop, so we only need
  // dismiss-on-outside-interaction + keyboard escape, not a focus trap.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative z-30 mx-auto w-fit max-w-[calc(100vw-2rem)]', className)}>
      <nav
        aria-label="Primary"
        style={{
          boxShadow:
            'var(--fl-specular), inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35), 0 0 0 1px rgba(var(--fl-sage-ink-rgb), 0.06)',
        }}
        className="fl-glass-1 flex items-center gap-0.5 rounded-full py-1.5 pl-4 pr-1.5 sm:gap-1 sm:pl-5 sm:pr-2"
      >
        <span className="relative z-10 flex items-center gap-0.5 sm:gap-1">
          <Link href="/" className="group flex items-center gap-2.5 pr-2 sm:pr-3">
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center justify-center text-[var(--fl-sage-ink)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-[15deg] group-focus-visible:rotate-[15deg] motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-focus-visible:rotate-0"
            >
              <HelmMark size={18} className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </span>
            <span className="fl-link-underline font-annual text-body-sm font-semibold tracking-tight text-[var(--fl-sage-ink)] sm:text-sm">
              Helm
              <span className="hidden sm:inline"> Sports Labs</span>
            </span>
          </Link>

          <span className="h-4 w-px bg-[rgba(var(--fl-brass-rgb),0.4)]" aria-hidden="true" />

          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            haptic="none"
            aria-haspopup="true"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            rightIcon={
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
                aria-hidden="true"
              />
            }
            className="fl-link-underline min-h-0 h-auto rounded-full px-3 py-2 font-annual text-body-sm font-medium text-[rgba(var(--fl-sage-ink-rgb),0.8)] hover:bg-[rgba(var(--fl-sage-ink-rgb),0.1)] hover:text-[var(--fl-sage-ink)] sm:px-4 sm:text-sm"
          >
            Log in
          </Button>

          <Link
            href="#cta"
            className="font-annual rounded-full bg-[var(--fl-sage-deep)] px-3.5 py-2 text-body-sm font-semibold text-[var(--fl-cream-high)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--fl-sage-ink)] active:translate-y-0 active:scale-[0.98] sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">See it</span>
            <span className="hidden sm:inline">See it in action</span>
          </Link>
        </span>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile scrim — bottom-sheet mode only; desktop dismisses via
                the outside-pointerdown listener above instead. */}
            <m.div
              key="glassnav-scrim"
              aria-hidden="true"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              className="fixed inset-0 z-40 bg-[rgba(var(--fl-sage-ink-rgb),0.4)] sm:hidden"
            />
            <m.div
              key="glassnav-panel"
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: reduced ? 0 : 0.32, ease: EASE_GLIDE }}
              style={{ backgroundColor: 'rgba(var(--fl-cream-rgb), 0.92)' }}
              className={cn(
                'fl-glass-2 fixed inset-x-4 bottom-4 z-50 rounded-3xl p-2',
                'sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[calc(100%+0.75rem)] sm:w-64 sm:-translate-x-1/2 sm:rounded-2xl',
              )}
            >
              <nav aria-label="Choose your sport" className="relative z-10 flex flex-col gap-1 p-1">
                <p className="font-annual px-3 pb-1 pt-2 text-eyebrow uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.55)]">
                  Choose your sport
                </p>
                {SPORT_LINKS.map((sport) => (
                  <Link
                    key={sport.href}
                    href={sport.href}
                    onClick={() => setOpen(false)}
                    className="group flex flex-col rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-[rgba(var(--fl-sage-ink-rgb),0.08)]"
                  >
                    <span className="flex items-center gap-2">
                      <SportGlyph sport={sport.sport} size={16} className="shrink-0 text-[var(--fl-sage-deep)]" />
                      <span className="fl-link-underline font-annual text-sm font-semibold text-[var(--fl-sage-ink)]">{sport.label}</span>
                    </span>
                    <span className="pl-6 text-xs text-[rgba(var(--fl-sage-ink-rgb),0.6)]">{sport.tagline}</span>
                  </Link>
                ))}
              </nav>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
