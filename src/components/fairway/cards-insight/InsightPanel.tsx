'use client';

/**
 * ============================================================================
 * Fairway · InsightPanel (primitive group "cards-insight")
 * ----------------------------------------------------------------------------
 * The EXPANDED / DOCKED read of ONE signal — the sibling of `InsightCard`.
 *
 * Where `InsightCard` is the *scanned* read in a feed (priority tint bar, lead
 * icon, narrative, evidence Inset, action row), `InsightPanel` is the *read*:
 * the same signal, opened in place to its full detail. It is the expand-in-place
 * that kills the player "View N more" dead-end — a player taps a card and the
 * SAME signal blooms open, never navigating away into a fabricated detail page.
 *
 * THE CONTRACT (blueprint primitivesToBuild → InsightPanel):
 *   "MUST look identical scanned vs read." So InsightPanel imports the SAME
 *   `PRIORITY` tone map + `InsightPriority` vocabulary that InsightCard exports
 *   — one source of truth for the tint bar, lead-icon tone, default icon, and
 *   the accessible priority word. It composes the SAME evidence `Inset` token
 *   (`bg-surface-sunken`) and the SAME action vocabulary
 *   (Acknowledge / Dismiss / → Focus Area / Ask). It does NOT fork any of it.
 *
 * RENDER MODES (the blueprint's "Sheet (narrow) or docked column (wide)"):
 *   • mode="docked" — a matte `Surface` column that lives in the layout (wide
 *     viewports / two-pane reads). Optional `onClose` renders a quiet dismiss.
 *   • mode="sheet"  — the SAME body inside a `Sheet` (vaul) that slides in from
 *     the right (a focused secondary read on narrow viewports). Controlled via
 *     `open` / `onOpenChange`.
 *   • mode="auto" (default) — picks sheet under the `md` breakpoint, docked at
 *     or above it, via a reduced-motion-safe media-query hook. SSR-safe.
 *
 * HONESTY (§0 #8): when a signal is starved (`empty`), the body renders
 * `InsufficientData`, never an authoritative-looking hollow shell.
 *
 * Self-contained: imports only the shared `cn()`, this folder's `InsightCard`
 * vocabulary, the surfaces/overlays/controls/feedback primitives, and the
 * locked `--fw-*` tokens. ADDITIVE — imported by nothing in the live app.
 * ============================================================================
 */

import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X, Target, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface, Inset } from '../surfaces/surface';
import { Sheet } from '../overlays/Sheet';
import { Button, IconButton } from '../controls/button';
import { InsufficientData } from '../feedback/InsufficientData';
// SHARED vocabulary — the single source of truth for priority tone, imported
// (never re-declared) so a signal looks identical scanned (card) vs read (panel).
// ICON_TONE/InsightIconTone is the bug #915 direction-by-sign override (see
// InsightCard's docstring) — shared here for the same "must look identical
// scanned vs read" reason.
import { PRIORITY, ICON_TONE, type InsightPriority, type InsightIconTone } from './InsightCard';

export type InsightPanelMode = 'auto' | 'sheet' | 'docked';

/**
 * A single declarative action in the panel's action row. Mirrors the
 * Acknowledge / Dismiss / → Focus Area / Ask vocabulary the InsightCard action
 * row carries, but typed so surfaces wire their server actions consistently.
 */
export interface InsightPanelAction {
  /** Stable key for the action (e.g. "acknowledge"). */
  key: string;
  /** Visible label. */
  label: ReactNode;
  /** Click handler (may be async — the panel does not await it). */
  onClick?: () => void;
  /** Optional leading icon override; sensible defaults exist for the four canon keys. */
  icon?: ReactNode;
  /** Button weight. Defaults map per canonical key (Focus Area → primary, etc.). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** In-flight: shows the inline spinner, keeps the label. */
  busy?: boolean;
  /** Disabled (e.g. already acknowledged, or a reserved/gated capability). */
  disabled?: boolean;
}

export interface InsightPanelProps {
  /* -- identity / vocabulary (shared with InsightCard) -- */
  /** Drives the tint bar + lead-icon tone — the SAME map as InsightCard. */
  priority?: InsightPriority;
  /** Small uppercase eyebrow above the title (e.g. "Putting · Signal"). */
  overline?: ReactNode;
  /** Signal title. Fraunces display — the read weight of the card title. */
  title: ReactNode;
  /** The full signal narrative / body copy. */
  children?: ReactNode;
  /** Lead icon override. Defaults to the priority-appropriate icon (shared). */
  icon?: ReactNode;
  /**
   * Override the icon glyph + color by DIRECTION rather than `priority`'s
   * severity tier — the SAME bug #915 override InsightCard exposes, kept in
   * sync so a pattern's icon reads identically scanned vs read. Ignored when
   * `icon` is also passed.
   */
  iconTone?: InsightIconTone;
  /** Hide the lead icon entirely. */
  hideIcon?: boolean;
  /** Right-aligned meta in the header (timestamp, source chip, confidence). */
  meta?: ReactNode;

  /* -- evidence (the §6 evidence Inset, shared token) -- */
  /** Supporting detail / evidence rendered in the same tinted Inset as the card. */
  evidence?: ReactNode;
  /** Optional label above the evidence block (e.g. "Why this surfaced"). */
  evidenceLabel?: ReactNode;
  /** Extra read-only detail blocks below the evidence (charts, tables, lists). */
  detail?: ReactNode;

  /* -- actions (Acknowledge / Dismiss / → Focus Area / Ask) -- */
  /**
   * Structured action row. Canonical keys ("acknowledge" | "dismiss" |
   * "focus-area" | "ask") get default icon + variant, so surfaces stay
   * consistent without re-specifying the vocabulary.
   */
  actions?: InsightPanelAction[];
  /** Freeform action node — escape hatch when the structured list is too rigid. */
  actionsSlot?: ReactNode;

  /* -- honesty contract -- */
  /** Starved signal → renders `InsufficientData` instead of a hollow shell. */
  empty?: boolean;
  /** Empty-state copy (passed through to InsufficientData). */
  emptyTitle?: ReactNode;
  emptyMessage?: ReactNode;

  /* -- mode / framing -- */
  /** sheet (narrow) | docked (wide) | auto (default, breakpoint-driven). */
  mode?: InsightPanelMode;
  /** Sheet: controlled open. Ignored in docked mode. */
  open?: boolean;
  /** Sheet: open-change handler. Also called with `false` by the docked close. */
  onOpenChange?: (open: boolean) => void;
  /** Docked: render a quiet close affordance (top-right) when provided. */
  onClose?: () => void;
  /** Docked resting elevation. Default `border` (matte card; border OR shadow). */
  elevation?: 'border' | 'shadow';

  className?: string;
}

/* -- canonical action defaults (the shared Acknowledge/Dismiss/→FA/Ask set) -- */

const ACTION_ICON: Record<string, ReactNode> = {
  acknowledge: <Check aria-hidden className="h-4 w-4" strokeWidth={2.25} />,
  dismiss: <X aria-hidden className="h-4 w-4" strokeWidth={2.25} />,
  'focus-area': <Target aria-hidden className="h-4 w-4" strokeWidth={2} />,
  ask: <MessageCircleQuestion aria-hidden className="h-4 w-4" strokeWidth={2} />,
};

const ACTION_VARIANT: Record<string, NonNullable<InsightPanelAction['variant']>> = {
  acknowledge: 'secondary',
  dismiss: 'ghost',
  'focus-area': 'primary',
  ask: 'secondary',
};

/* -- SSR-safe "is this a wide viewport" hook (auto mode picker) -- */

/** Matches the Tailwind `md` (768px) breakpoint; false on the server. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

/* -- the shared inner body (identical in sheet + docked) -------------------- */

interface PanelBodyProps
  extends Pick<
    InsightPanelProps,
    | 'priority'
    | 'overline'
    | 'title'
    | 'children'
    | 'icon'
    | 'iconTone'
    | 'hideIcon'
    | 'meta'
    | 'evidence'
    | 'evidenceLabel'
    | 'detail'
    | 'actions'
    | 'actionsSlot'
    | 'empty'
    | 'emptyTitle'
    | 'emptyMessage'
  > {
  /** Hide the title block — the Sheet renders its own styled title in the header. */
  headerless?: boolean;
  titleId: string;
}

function PanelBody({
  priority = 'medium',
  overline,
  title,
  children,
  icon,
  iconTone,
  hideIcon = false,
  meta,
  evidence,
  evidenceLabel,
  detail,
  actions,
  actionsSlot,
  empty = false,
  emptyTitle,
  emptyMessage,
  headerless = false,
  titleId,
}: PanelBodyProps) {
  const tone = PRIORITY[priority];
  // Bug #915: the SAME direction-by-sign override InsightCard exposes — see
  // its docstring. `priority` still drives the tint bar below.
  const toneOverride = iconTone ? ICON_TONE[iconTone] : null;
  const iconWrapClass = toneOverride?.iconWrap ?? tone.iconWrap;
  const LeadIcon = toneOverride?.icon ?? tone.icon;
  const leadIcon =
    icon ?? (hideIcon ? null : <LeadIcon aria-hidden className="h-full w-full" strokeWidth={2} />);

  const hasActions =
    actionsSlot != null || (Array.isArray(actions) && actions.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* header: lead icon + overline/title (left) · meta (right). The card
          uses the EXACT same tint bar + lead-icon wrap tokens — read weight is
          a larger Fraunces title, nothing forked. */}
      {!headerless ? (
        <div className="flex items-start gap-4">
          {leadIcon ? (
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-md p-2.5',
                iconWrapClass,
              )}
            >
              {leadIcon}
            </span>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {overline ? (
              <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                {overline}
              </span>
            ) : null}
            <h2
              id={titleId}
              className="min-w-0 font-fw-display text-h2 font-medium tracking-[-0.005em] text-text-primary"
            >
              {title}
            </h2>
          </div>

          {meta ? (
            <span className="shrink-0 pt-0.5 font-fw-sans text-caption text-text-tertiary">
              {meta}
            </span>
          ) : null}
        </div>
      ) : meta ? (
        // headerless (Sheet) still surfaces the meta line under the sheet title
        <div className="flex items-center justify-end">
          <span className="font-fw-sans text-caption text-text-tertiary">{meta}</span>
        </div>
      ) : null}

      {/* body: honest emptiness OR the full narrative */}
      {empty ? (
        <InsufficientData
          title={emptyTitle ?? undefined}
          description={emptyMessage ?? undefined}
        />
      ) : (
        <>
          {children ? (
            <div className="font-fw-sans text-body-lg leading-relaxed text-text-secondary">
              {children}
            </div>
          ) : null}

          {/* evidence — the SAME tinted Inset / token as InsightCard's evidence */}
          {evidence ? (
            <div className="flex flex-col gap-2">
              {evidenceLabel ? (
                <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                  {evidenceLabel}
                </span>
              ) : null}
              <Inset padding="md" className="font-fw-sans text-body-sm leading-relaxed">
                {evidence}
              </Inset>
            </div>
          ) : null}

          {/* extra read-only detail (charts, dimension tables, lists) */}
          {detail ? <div className="flex flex-col gap-4">{detail}</div> : null}
        </>
      )}

      {/* action row — Acknowledge / Dismiss / → Focus Area / Ask. Shared
          vocabulary; canonical keys get default icon + weight. */}
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {actionsSlot}
          {actions?.map((a) => (
            <Button
              key={a.key}
              size="sm"
              variant={a.variant ?? ACTION_VARIANT[a.key] ?? 'secondary'}
              busy={a.busy}
              disabled={a.disabled}
              onClick={a.onClick}
              leftIcon={a.icon ?? ACTION_ICON[a.key]}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -- the component --------------------------------------------------------- */

export const InsightPanel = forwardRef<HTMLDivElement, InsightPanelProps>(
  function InsightPanel(
    {
      priority = 'medium',
      overline,
      title,
      children,
      icon,
      iconTone,
      hideIcon,
      meta,
      evidence,
      evidenceLabel,
      detail,
      actions,
      actionsSlot,
      empty,
      emptyTitle,
      emptyMessage,
      mode = 'auto',
      open,
      onOpenChange,
      onClose,
      elevation = 'border',
      className,
    },
    ref,
  ) {
    const prefersReduced = useReducedMotion();
    const isWide = useIsWide();
    const titleId = useId();
    const tone = PRIORITY[priority];

    // auto → docked on wide, sheet on narrow. Explicit modes win.
    const resolvedMode: 'sheet' | 'docked' =
      mode === 'auto' ? (isWide ? 'docked' : 'sheet') : mode;

    const sharedBody = (
      <PanelBody
        priority={priority}
        overline={overline}
        title={title}
        icon={icon}
        iconTone={iconTone}
        hideIcon={hideIcon}
        meta={meta}
        evidence={evidence}
        evidenceLabel={evidenceLabel}
        detail={detail}
        actions={actions}
        actionsSlot={actionsSlot}
        empty={empty}
        emptyTitle={emptyTitle}
        emptyMessage={emptyMessage}
        titleId={titleId}
      >
        {children}
      </PanelBody>
    );

    /* ── SHEET (narrow) — the SAME signal sliding in from the edge ───────── */
    if (resolvedMode === 'sheet') {
      // The Sheet owns the styled title + its own a11y wiring; render the body
      // headerless so the title isn't duplicated, but keep the priority tint as
      // a leading rail so the signal still reads identical to the card.
      return (
        <Sheet
          open={open}
          onOpenChange={onOpenChange}
          // resolvedMode === 'sheet' only happens when !isWide UNDER mode="auto"
          // (narrow / phone-class viewport) — doctrine rule 4 requires a bottom
          // sheet here, never the desktop-only docked side="right" panel (which
          // was rendering centered/clipped on phone, same defect class as
          // FairwayNewMessageSheet). BUT both real callers (FairwayCoachHelm
          // Signals, FairwayPlayerCoachHelm) pass the explicit mode="sheet" —
          // not "auto" — so this branch also renders on WIDE desktop viewports,
          // where the comment's premise doesn't hold.
          //
          // Bug #949 #5: on those wide viewports the sheet's own `side="bottom"`
          // class (`inset-x-0 bottom-0` — full-width by design, the same as
          // every OTHER `side="bottom"` Sheet in this codebase) collided with
          // the `w-[min(32rem,…)]` override below: left, right, AND width all
          // pinned at once is CSS's classic over-constrained absolute-position
          // case, which resolves by discarding `left` (LTR) and flush-fitting
          // the box to `right:0` at that width — a narrow ~32rem panel
          // corner-docked instead of the roomy bottom sheet every sibling Sheet
          // renders, its evidence/actions squeezed into a sliver next to a wall
          // of empty canvas. Dropping the width override (this was the ONLY
          // `side="bottom"` Sheet in the app that set one) restores the normal,
          // un-conflicting full-width bottom sheet.
          side="bottom"
          title={typeof title === 'string' ? title : 'Signal'}
          description={
            typeof overline === 'string' ? overline : undefined
          }
          className={className}
        >
          <Sheet.Body>
            {/* priority rail — the same tint vocabulary as the card's tint bar */}
            <div className="relative pl-4">
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-0 h-full w-1 rounded-full',
                  tone.bar,
                )}
              />
              <PanelBody
                priority={priority}
                overline={overline}
                title={title}
                icon={icon}
                iconTone={iconTone}
                hideIcon={hideIcon}
                meta={meta}
                evidence={evidence}
                evidenceLabel={evidenceLabel}
                detail={detail}
                actions={actions}
                actionsSlot={actionsSlot}
                empty={empty}
                emptyTitle={emptyTitle}
                emptyMessage={emptyMessage}
                titleId={titleId}
                headerless
              >
                {children}
              </PanelBody>
            </div>
          </Sheet.Body>
        </Sheet>
      );
    }

    /* ── DOCKED (wide) — a matte column that stays in the layout ─────────── */
    const reveal = prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.42,
            ease: [0.16, 1, 0.3, 1] as const,
          },
        };

    return (
      <motion.div
        ref={ref}
        aria-labelledby={titleId}
        role="region"
        {...reveal}
        className={cn('relative', className)}
      >
        <Surface
          elevation={elevation}
          padding="lg"
          className="relative overflow-hidden"
        >
          {/* left priority tint bar — IDENTICAL token to InsightCard's bar */}
          <span
            aria-hidden
            className={cn('absolute left-0 top-0 h-full w-1', tone.bar)}
          />

          {/* docked close affordance (optional) */}
          {onClose ? (
            <div className="absolute right-4 top-4">
              <IconButton
                aria-label="Close"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onClose();
                  onOpenChange?.(false);
                }}
              >
                <X aria-hidden strokeWidth={2} />
              </IconButton>
            </div>
          ) : null}

          <div className={cn('pl-2', onClose && 'pr-10')}>{sharedBody}</div>
        </Surface>
      </motion.div>
    );
  },
);
