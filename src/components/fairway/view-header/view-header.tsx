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
 * Motion: a slow cinematic reveal (opacity + small upward drift) via a pure
 * CSS entrance animation (`.animate-fade-in-up`, no framer-motion, no client
 * JS dependency — see "Motion is pure CSS" below), honoring
 * `prefers-reduced-motion` (§7). Title/eyebrow/meta stagger in via a small
 * per-item `animation-delay`. No layout shift.
 *
 * Styled to render correctly inside a `.fairway-ds` scope on a `bg-canvas`
 * page; uses ONLY Fairway token utilities + the §3 type scale. ADDITIVE.
 *
 * ── Motion is pure CSS, not framer-motion (#P-ask-nav invisible-header fix) ──
 * Previously the reveal was a framer-motion `motion.header`/`motion.div` tree:
 * `initial="hidden"` computes its inline `opacity:0; transform:translateY(8px)`
 * on the SERVER (that's what framer's SSR-safe initial-style calculation is
 * for), so the SSR'd HTML already had every eyebrow/title/description/meta
 * node sitting at `opacity: 0` before a single byte of client JS ran. The
 * hidden→visible transition only ever fires from framer-motion's own
 * client-side mount effect — if that effect never runs for ANY reason
 * (client JS erroring elsewhere in the page's component tree, a hydration
 * mismatch upstream causing React to abandon the subtree, a stalled/slow
 * bundle), there is no fallback: the header sits frozen at `opacity: 0`
 * forever, which is exactly the "eyebrow/H1/subhead present in the DOM but
 * invisible" failure reported on `/golf/dashboard/documents`,
 * `/golf/dashboard/announcements`, and `/golf/dashboard/whats-new` (all
 * reproduced identically on production, i.e. real client JS, not a test
 * artifact). Two isolated reproductions of the framer-motion path itself —
 * a plain client render AND a faithful two-bundle SSR→hydrate simulation
 * (separate module instances, exactly like Next.js's separate server/client
 * webpack builds) — both completed the hidden→visible transition correctly,
 * so the variant/stagger wiring was not itself broken; the risk is
 * architectural: ANY JS-driven inline-style reveal has no guaranteed
 * terminal state if the JS never runs, on ANY page, for ANY reason. This
 * codebase already hit and fixed the identical symptom class in
 * `AnimatedPage`/`AnimatedItem` (`src/components/golf/layout/AnimatedPage.tsx`,
 * audit W1 "shot-blank") by moving the reveal to a pure-CSS `@keyframes`
 * animation with `animation-fill-mode: forwards` — it starts painting on the
 * very first frame with zero JS dependency, so there is nothing left to get
 * stuck on. ViewHeader now reuses that SAME proven, already-shipped utility
 * (`.animate-fade-in-up`, globals.css) instead of framer-motion, with a
 * per-item `animation-delay` standing in for the old `staggerChildren`. This
 * also removes the file's only `useReducedMotion()` call (a raw framer-motion
 * hook returns `null` pre-hydration, which the design-system rule bans in
 * favor of `useReducedMotionGuard()`) — reduced-motion is now handled purely
 * by CSS (`motion-reduce:animate-none` + globals.css's
 * `@media (prefers-reduced-motion: reduce)` block collapsing the animation to
 * 1ms), so it is correct even before hydration and needs no JS gating at all.
 * ========================================================================== */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

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

// Stand-in for framer-motion's old `staggerChildren`/`delayChildren`: a
// per-item `animation-delay`, computed as items are encountered during
// render (same effective order framer-motion's tree-order stagger used —
// eyebrow, title, description, meta, actions, segments — skipping whichever
// are absent for this render). 20ms head start + 60ms per item matches the
// previous `delayChildren: 0.02` / `staggerChildren: 0.06`.
const STAGGER_DELAY_START_MS = 20;
const STAGGER_STEP_MS = 60;

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
    const compact = size === "compact";
    const hasSegments = Array.isArray(segments) && segments.length > 0;
    const showDivider = divider ?? hasSegments;
    // Premium scroll-edge fade for the (horizontally scrollable) segment row —
    // a long segment/tab set bleeds off-edge instead of hard-cutting on mobile.
    const { ref: segmentsFadeRef, fadeStyle: segmentsFadeStyle } = useScrollFade<HTMLDivElement>("x");

    const TitleTag = titleAs;
    const PrimarySlot = asPrimaryActionChild ? Slot : "div";

    // Monotonic per-render counter driving the stagger delay below. Reset on
    // every render (plain closure var, not state) — deterministic and cheap,
    // exactly mirroring framer-motion's old tree-order stagger index.
    let staggerIndex = 0;

    const motionItem = (key: string, children: React.ReactNode, cls?: string) => {
      if (disableAnimation) {
        return (
          <div key={key} className={cls}>
            {children}
          </div>
        );
      }
      const delayMs = STAGGER_DELAY_START_MS + staggerIndex * STAGGER_STEP_MS;
      staggerIndex += 1;
      return (
        <div
          key={key}
          className={cn("animate-fade-in-up motion-reduce:animate-none", cls)}
          // `.animate-fade-in-up` (globals.css) ships with `fill-mode: forwards`
          // only — during a delay period THAT alone would leave the item at its
          // normal (visible) style until the delay elapses, then snap to the
          // "from" keyframe (opacity:0) right as the animation starts, i.e. a
          // flash-then-hide-then-reveal glitch. `both` (inline, overriding just
          // this one longhand) applies the "from" keyframe for the delay too,
          // so staggered items start hidden immediately, exactly like the old
          // framer-motion stagger did.
          style={{ animationDelay: `${delayMs}ms`, animationFillMode: "both" }}
        >
          {children}
        </div>
      );
    };

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
        <div
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

    // Always a plain `<header>` — the entrance reveal is pure CSS on the
    // children (see `motionItem` above), so there is no longer a second,
    // framer-motion-backed root to conditionally render.
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
