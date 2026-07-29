// =============================================================================
// src/components/baseball/settings/SettingsChrome.tsx
//
// The ONE chrome vocabulary for every BaseballHelm settings surface.
//
// WHY THIS FILE EXISTS
// --------------------
// Settings had drifted into three visibly different design systems on adjacent
// routes: the Living Annual kit (SectionMasthead / PaperCard / HairlineRule —
// correct, and already what ProgramSettingsClient uses), the legacy
// `@/components/ui/card` `variant="glass"` surface with raw `warm-*` /
// `cream-*` / `primary-*` Tailwind, and one-off hand-rolled panels. A head
// coach configures the program in the first ten minutes of a demo, so Settings
// is the surface where "assembled from parts" is most visible and most costly.
//
// Rather than re-derive the same card on ten screens, the recipes live here
// once. `SettingsSection` is lifted VERBATIM from ProgramSettingsClient's
// private `SectionCard` (which was already correct) so the two can never drift
// again — ProgramSettingsClient now imports it instead of keeping its own copy.
//
// DESIGN NOTE — why Living Annual and not the raw Fairway barrel
// -------------------------------------------------------------
// "The Living Annual" is not a competing system: it is the baseball-native
// layer built ON the Fairway tokens (`PaperCard` = `rounded-card` +
// `--hairline` + `--paper`; type is `text-text-*` / `text-h*` / `font-annual`).
// It is what 206 baseball files already speak, versus 38 that reach into
// `@/components/fairway` directly. Importing raw `Surface`/`EmptyState` here
// would add a FOURTH card stock next to `PaperCard`, not remove one — so the
// unification target is the kit, and the kit's tokens are Fairway's.
//
// No hooks at this module's top level, so these recipes are safe to render
// from the server components under settings/ (roles, permissions) as well as
// from the 'use client' editors. `HairlineRule` / `Reveal` carry their own
// 'use client' boundary, and the coach dashboard `template.tsx` supplies the
// `LazyMotion` provider their `m.*` usage needs.
// =============================================================================

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/icons';
import {
  Eyebrow,
  HairlineRule,
  PaperCard,
  Reveal,
  SectionMasthead,
} from '@/components/baseball/living-annual';

/**
 * Every settings route wears the same dateline, so it is a constant rather
 * than a prop each caller re-types (and eventually re-types differently).
 */
export const SETTINGS_EYEBROW = 'THE PRESSBOX · SETTINGS';

const WIDTH_CLASS = {
  /** Single-column forms and reference lists — the default. */
  narrow: 'max-w-3xl',
  /** Multi-column card grids (the hub). */
  wide: 'max-w-5xl',
} as const;

export interface SettingsShellProps {
  /** Page title, rendered as the masthead H1. */
  title: string;
  /** One-line lede under the accent rule (team name, scope, count). */
  lede?: ReactNode;
  /** Right-aligned masthead actions (primary CTA). */
  actions?: ReactNode;
  /** Column measure. `narrow` (max-w-3xl) unless the body is a grid. */
  width?: keyof typeof WIDTH_CLASS;
  children: ReactNode;
}

/**
 * SettingsShell — the page frame every settings route composes.
 *
 * Fixes the measure, the padding rhythm, and the masthead in one place so the
 * hub and its ten leaves line up pixel-for-pixel on navigation instead of each
 * page picking its own container.
 */
export function SettingsShell({
  title,
  lede,
  actions,
  width = 'narrow',
  children,
}: SettingsShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full space-y-6 px-4 py-8 sm:px-6 lg:px-8',
        WIDTH_CLASS[width],
      )}
    >
      <SectionMasthead
        eyebrow={SETTINGS_EYEBROW}
        title={title}
        ink="team"
        actions={actions}
      >
        {lede ? (
          <p className="font-annual text-body-sm text-text-secondary">{lede}</p>
        ) : null}
      </SectionMasthead>

      <div className="space-y-6">{children}</div>
    </div>
  );
}

export interface SettingsSectionProps {
  /** Leading glyph, rendered in team ink inside a hairline badge. */
  icon?: ReactNode;
  /** Small-caps kicker above the section title. */
  eyebrow?: string;
  title: string;
  /**
   * Status stamp rendered INLINE beside the title, not in `actions` — a
   * "Sensitive" mark describes the panel and has to stay next to the words it
   * qualifies; pushed to the far right of a wide card it reads as an unrelated
   * control.
   */
  badge?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned section-level controls (add, filter, toggle). */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Optional stable anchor so the dedicated spec routes that fold into a
   * consolidated page (player-access, guardian-access, showcase-profile, ai,
   * notifications, data-retention) can deep-link via `#anchor`. Lives on the
   * OUTER wrapper — not `PaperCard`, which doesn't forward `id` — so the
   * browser's native fragment scroll still lands here; `scroll-mt-24` keeps
   * the section clear of the sticky masthead on jump.
   */
  anchorId?: string;
  /** Sibling index for the entrance cascade. */
  index?: number;
  className?: string;
  /** Body spacing. `none` lets a caller own its own rhythm (lists, tables). */
  bodySpacing?: 'default' | 'none';
}

/**
 * SettingsSection — THE settings panel.
 *
 * Reveal on MOUNT (the kit's <Reveal>, never `whileInView`): a settings form is
 * one tall document, and gating each card behind viewport-intersection left
 * every section below the fold stuck at opacity:0 until scrolled to — the
 * dashboard's inner-scroll shell breaks IntersectionObserver against the
 * document viewport (see Reveal.tsx). Stagger is capped at 3 steps (~180ms max)
 * so a ten-section form still settles briskly rather than crawling.
 */
export function SettingsSection({
  icon,
  eyebrow,
  title,
  badge,
  subtitle,
  actions,
  children,
  anchorId,
  index = 0,
  className,
  bodySpacing = 'default',
}: SettingsSectionProps) {
  return (
    <div id={anchorId} className={anchorId ? 'scroll-mt-24' : undefined}>
      <Reveal staggerIndex={Math.min(index, 3)}>
        <PaperCard className={cn('p-6', className)}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {icon ? (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/10 text-grade-plus">
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0">
                {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-annual text-h3 font-semibold text-text-primary">
                    {title}
                  </h2>
                  {badge}
                </div>
                {subtitle ? (
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
          <HairlineRule ink="team" className="my-4" />
          <div className={bodySpacing === 'default' ? 'space-y-3' : undefined}>
            {children}
          </div>
        </PaperCard>
      </Reveal>
    </div>
  );
}

export interface SettingsNoticeProps {
  /** Leading glyph (a lock for capability gates, nothing for plain context). */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * SettingsNotice — the quiet contextual row.
 *
 * Replaces the several hand-rolled `rounded-xl border border-warm-200
 * bg-warm-50` strips that carried read-only warnings and policy context. Ink
 * over a hairline on canvas, never a tinted warning box: the empty-state
 * doctrine reserves color for urgency, and "you can view but not edit" is
 * context, not an alarm.
 */
export function SettingsNotice({ icon, children, className }: SettingsNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 font-annual text-body-sm leading-relaxed text-text-secondary',
        className,
      )}
    >
      {icon ? (
        <span className="mt-0.5 shrink-0 text-text-tertiary">{icon}</span>
      ) : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export interface SettingsNavCardProps {
  href: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Sibling index for the entrance cascade. */
  index?: number;
}

/**
 * SettingsNavCard — a link tile on the settings hub.
 *
 * The whole tile is a single `<Link>`, so it must never gain an interactive
 * child: nesting a button or anchor inside is invalid HTML and a hydration
 * crash class (same rule as a BentoCell with `onOpen`). The chevron is
 * decorative markup, not a control.
 */
export function SettingsNavCard({
  href,
  label,
  description,
  icon,
  index = 0,
}: SettingsNavCardProps) {
  return (
    <Reveal staggerIndex={Math.min(index, 3)} className="h-full">
      <Link
        href={href}
        className="group block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--paper-canvas)]"
      >
        <PaperCard className="h-full p-5 transition-colors duration-200 group-hover:border-grade-plus/40">
          <div className="flex h-full items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/10 text-grade-plus">
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0">
                <h3 className="font-annual text-body font-semibold text-text-primary">
                  {label}
                </h3>
                {description ? (
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            <IconChevronRight
              size={18}
              className="mt-2 shrink-0 text-text-tertiary transition-colors duration-200 group-hover:text-grade-plus"
            />
          </div>
        </PaperCard>
      </Link>
    </Reveal>
  );
}

export interface SettingsFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/**
 * SettingsField — label + hint chrome around a form primitive.
 *
 * The control passed as `children` (Input / Select / Checkbox from
 * `@/components/ui/*`) is never touched here; only its label furniture is
 * normalised onto the ink tokens so every settings form reads the same.
 */
export function SettingsField({ label, hint, children }: SettingsFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-text-primary">{label}</span>
      {hint ? (
        <span className="mb-1.5 block text-xs text-text-tertiary">{hint}</span>
      ) : (
        <span className="mb-1.5 block" />
      )}
      {children}
    </label>
  );
}
