"use client";

/* ============================================================================
 * Fairway — ViewHeader
 * ----------------------------------------------------------------------------
 * The per-page header primitive (DESIGN-SYSTEM §6). Replaces the triple-title
 * chrome the audit flagged by unifying `LargeTitleHeader` + `PageHeader` into a
 * single, restrained masthead:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  OVERLINE / KICKER (overline, accent-tinted, optional)        │
 *   │  Title                              [secondary] [primary CTA] │   ← Fraunces h1
 *   │  context / metadata line (optional)                           │
 *   │  ───────────────────────────────────────────────────────────  │
 *   │  [ quiet segmented tab row ]                          (optional)│
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Anatomy (slots, all optional except `title`):
 *   - `eyebrow`     — overline / kicker above the title (uppercase, tracked)
 *   - `title`       — the one Fraunces (`font-fw-display`) h1, with air
 *   - `description` — context / metadata line under the title
 *   - `meta`        — inline metadata chips beside/under the title (e.g. counts)
 *   - `primaryAction`   — the single pill CTA (right-aligned, top)
 *   - `secondaryActions`— quieter actions clustered left of the primary
 *   - `segments` + segment props — the optional compact quiet tab row
 *
 * Sizes: `default` (display-ish h1 with generous air) and `compact` (denser,
 * for nested/sub-views). An optional `plinth` renders the header on a warm
 * `surface-tint` band (DESIGN-SYSTEM §4.1 "warm plinth", ONE per large-title
 * page) — matte, never glass.
 *
 * Motion: a slow cinematic reveal (opacity + small upward drift) via
 * framer-motion, honoring `prefers-reduced-motion` (§7). Title/eyebrow/meta
 * stagger in. No layout shift.
 *
 * Styled to render correctly inside a `.fairway-ds` scope on a `bg-canvas`
 * page; uses ONLY Fairway token utilities + the §3 type scale. ADDITIVE.
 * ========================================================================== */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";
import { useScrollFade } from "@/lib/fairway/use-scroll-fade";

import {
  ViewHeaderSegments,
  type ViewHeaderSegment,
  type ViewHeaderSegmentsProps,
} from "./view-header-segments";

export type ViewHeaderSize = "default" | "compact";

export interface ViewHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Optional eyebrow / kicker overline above the title. */
  eyebrow?: React.ReactNode;
  /** The page title (Fraunces h1). Required. */
  title: React.ReactNode;
  /** Optional context / metadata line under the title. */
  description?: React.ReactNode;
  /**
   * Optional inline metadata cluster (e.g. status chip, "Updated 2m ago",
   * record counts). Rendered as a quiet row beneath the description.
   */
  meta?: React.ReactNode;
  /**
   * The single primary call-to-action (a pill CTA). Pass your own Button —
   * with `asPrimaryActionChild` the slot merges onto your element instead of
   * wrapping it, so the consumer keeps full control of the button.
   */
  primaryAction?: React.ReactNode;
  /**
   * Merge the primary action slot onto the passed element (Radix `Slot`
   * pattern) rather than rendering a wrapping element. Use when you pass a
   * single element you fully own.
   */
  asPrimaryActionChild?: boolean;
  /** Quieter secondary actions, clustered left of the primary action. */
  secondaryActions?: React.ReactNode;
  /** Optional render-as for the title element (defaults to `h1`). */
  titleAs?: "h1" | "h2";

  // ── Optional quiet segmented / tab row ───────────────────────────────────
  /** Segments for the compact quiet tab row. When present the row renders. */
  segments?: ViewHeaderSegment[];
  /** Controlled active segment value. */
  segmentValue?: string;
  /** Uncontrolled initial segment value. */
  segmentDefaultValue?: string;
  /** Fires with the next active segment value. */
  onSegmentChange?: (value: string) => void;
  /** Accessible label for the segment group (when no visible heading). */
  segmentsAriaLabel?: string;
  /** Forward extra props to the underlying segments control. */
  segmentsProps?: Partial<
    Omit<
      ViewHeaderSegmentsProps,
      | "segments"
      | "value"
      | "defaultValue"
      | "onValueChange"
      | "size"
      | "aria-label"
    >
  >;

  // ── Layout / variant ──────────────────────────────────────────────────────
  /** Visual density. */
  size?: ViewHeaderSize;
  /**
   * Render on a warm `surface-tint` plinth band (ONE per large-title page).
   * Matte — never glass.
   */
  plinth?: boolean;
  /**
   * Add a hairline divider under the masthead, above the segment row. Defaults
   * to `true` only when segments are present (to separate title from tabs).
   */
  divider?: boolean;
  /** Disable the entrance animation entirely (e.g. for instant SSR mounts). */
  disableAnimation?: boolean;
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    // --dur-base (0.28s) with --ease-soft; slow + settled, never snappy (§7.1)
    transition: { duration: 0.28, ease: [0.22, 0.61, 0.36, 1] },
  },
};

export const ViewHeader = React.forwardRef<HTMLElement, ViewHeaderProps>(
  function ViewHeader(
    {
      eyebrow,
      title,
      description,
      meta,
      primaryAction,
      asPrimaryActionChild = false,
      secondaryActions,
      titleAs = "h1",
      segments,
      segmentValue,
      segmentDefaultValue,
      onSegmentChange,
      segmentsAriaLabel,
      segmentsProps,
      size = "default",
      plinth = false,
      divider,
      disableAnimation = false,
      className,
      ...rest
    },
    ref,
  ) {
    const reduceMotion = useReducedMotion();
    const animate = !disableAnimation && !reduceMotion;
    const compact = size === "compact";
    const hasSegments = Array.isArray(segments) && segments.length > 0;
    const showDivider = divider ?? hasSegments;
    // Premium scroll-edge fade for the (horizontally scrollable) segment row —
    // a long segment/tab set bleeds off-edge instead of hard-cutting on mobile.
    const { ref: segmentsFadeRef, fadeStyle: segmentsFadeStyle } = useScrollFade<HTMLDivElement>("x");

    const TitleTag = titleAs;
    const PrimarySlot = asPrimaryActionChild ? Slot : "div";

    const motionItem = (key: string, children: React.ReactNode, cls?: string) =>
      animate ? (
        <motion.div key={key} variants={itemVariants} className={cls}>
          {children}
        </motion.div>
      ) : (
        <div key={key} className={cls}>
          {children}
        </div>
      );

    const rootClassName = cn(
      "flex w-full flex-col",
      compact ? "gap-3" : "gap-4",
      plinth &&
        cn("rounded-fw-lg bg-surface-tint", compact ? "px-6 py-5" : "px-8 py-7"),
      className,
    );

    const content = (
      <>
        {/* ── Masthead: eyebrow + title + actions + description + meta ─────── */}
        {/* data-fw-title-anchor: the condense observer's anchor (see
            FairwayContentAnchor in app-shell/LargeTitleContext.tsx) — marks
            the masthead block, never the full header (which can carry tabs/
            toolbars below and would defer condensing). */}
        <div
          data-fw-title-anchor
          className={cn(
            "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
            compact ? "gap-3" : "gap-5",
          )}
        >
          {/* Title column */}
          <div className={cn("flex min-w-0 flex-col", compact ? "gap-1" : "gap-1.5")}>
            {eyebrow != null
              ? motionItem(
                  "eyebrow",
                  <p
                    data-slot="view-header-eyebrow"
                    className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700"
                  >
                    {eyebrow}
                  </p>,
                )
              : null}

            {motionItem(
              "title",
              <TitleTag
                data-slot="view-header-title"
                className={cn(
                  "min-w-0 font-fw-display text-text-primary",
                  // h1 = 32/38 with light negative tracking; compact steps to h2 scale
                  compact
                    ? "text-h2 font-medium tracking-[-0.005em]"
                    : "text-h1 font-medium tracking-[-0.008em]",
                  // balance long titles across the available width
                  "[text-wrap:balance]",
                )}
              >
                {title}
              </TitleTag>,
            )}

            {description != null
              ? motionItem(
                  "description",
                  <p
                    data-slot="view-header-description"
                    className={cn(
                      "max-w-[68ch] font-fw-sans text-text-secondary",
                      // One line on a phone. These descriptions are orientation
                      // copy a returning user has read many times, and at
                      // body-lg over two lines they were part of the ~610px of
                      // chrome standing between the top of Team Hub and its
                      // first actual task (audit P-22). Full text from `sm` up,
                      // and `line-clamp` keeps it selectable + readable by AT
                      // either way — nothing is removed, only visually capped.
                      "line-clamp-1 sm:line-clamp-none",
                      compact ? "text-body-sm" : "text-body-sm sm:text-body-lg",
                    )}
                  >
                    {description}
                  </p>,
                )
              : null}

            {meta != null
              ? motionItem(
                  "meta",
                  <div
                    data-slot="view-header-meta"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-fw-sans text-caption text-text-tertiary"
                  >
                    {meta}
                  </div>,
                )
              : null}
          </div>

          {/* Action cluster */}
          {secondaryActions != null || primaryAction != null
            ? motionItem(
                "actions",
                // Below `sm` the primary CTA comes FIRST. The row wraps on a
                // phone, and with the secondaries ahead of it in DOM order the
                // primary ("Add Player") wrapped onto a second line UNDER two
                // quieter actions — the page's main call to action ranked last
                // (audit L4). `order-*` flips the paint order at the narrow
                // breakpoint only; the DOM order is unchanged, so tab order
                // still runs secondaries -> primary as before.
                <div
                  data-slot="view-header-actions"
                  className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
                >
                  {secondaryActions != null ? (
                    <div
                      data-slot="view-header-secondary-actions"
                      className="order-2 flex items-center gap-2 sm:order-none"
                    >
                      {secondaryActions}
                    </div>
                  ) : null}
                  {primaryAction != null ? (
                    <PrimarySlot
                      data-slot="view-header-primary-action"
                      className="order-1 sm:order-none"
                    >
                      {primaryAction}
                    </PrimarySlot>
                  ) : null}
                </div>,
                "sm:ml-auto",
              )
            : null}
        </div>

        {/* ── Optional hairline divider ────────────────────────────────────── */}
        {showDivider ? (
          <div
            data-slot="view-header-divider"
            aria-hidden="true"
            className="h-px w-full bg-border-subtle"
          />
        ) : null}

        {/* ── Optional quiet segmented / tab row ───────────────────────────── */}
        {hasSegments
          ? motionItem(
              "segments",
              <div
                data-slot="view-header-segments"
                ref={segmentsFadeRef}
                style={segmentsFadeStyle}
                className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <ViewHeaderSegments
                  segments={segments}
                  value={segmentValue}
                  defaultValue={segmentDefaultValue}
                  onValueChange={onSegmentChange}
                  size={size}
                  aria-label={segmentsAriaLabel}
                  {...segmentsProps}
                />
              </div>,
            )
          : null}
      </>
    );

    // Render an animated `motion.header` only when animating; otherwise a plain
    // `header`. Splitting the two roots keeps consumer-facing props typed as
    // `React.HTMLAttributes<HTMLElement>` (clean ergonomics) without colliding
    // with framer-motion's incompatible drag/animation handler signatures.
    if (animate) {
      return (
        <motion.header
          ref={ref}
          data-slot="view-header"
          data-size={size}
          className={rootClassName}
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          {...(rest as React.ComponentPropsWithoutRef<typeof motion.header>)}
        >
          {content}
        </motion.header>
      );
    }

    return (
      <header
        ref={ref}
        data-slot="view-header"
        data-size={size}
        className={rootClassName}
        {...rest}
      >
        {content}
      </header>
    );
  },
);
