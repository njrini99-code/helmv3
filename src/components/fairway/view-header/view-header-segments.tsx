"use client";

/* ============================================================================
 * Fairway — ViewHeaderSegments
 * ----------------------------------------------------------------------------
 * The optional compact "quiet" tab / segmented row that can sit under a
 * ViewHeader (e.g. CoachHelm's Brief / Signals / Players / Effectiveness / Ask
 * sub-nav). It is a single-select control built on Radix ToggleGroup so it gets
 * roving-tabindex keyboard nav, ARIA, and disabled handling for free.
 *
 * Visual register (DESIGN-SYSTEM §4 / §7): matte by default — the track is a
 * warm `surface-sunken` well with NO border; the *active* segment is the one
 * element that lifts onto an opaque `bg-surface` pill with a whisper of
 * `shadow-soft` (border OR shadow, never both). Inactive segments are quiet
 * `text-text-secondary` and warm to `text-text-primary` on hover. A slow
 * framer-motion `layoutId` pill glides between segments (the moving-pill idiom
 * §4.3), honoring `prefers-reduced-motion`.
 *
 * Styled to render correctly inside a `.fairway-ds` scope on a `bg-canvas`
 * page; uses ONLY Fairway token utilities. ADDITIVE — imported by nothing
 * existing.
 * ========================================================================== */

import * as React from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/** One segment in the quiet tab row. */
export interface ViewHeaderSegment {
  /** Stable value emitted via `onValueChange` when selected. */
  value: string;
  /** Visible label (kept short — General Sans `label` voice). */
  label: React.ReactNode;
  /** Optional leading icon (e.g. lucide). Sized to the text. */
  icon?: React.ReactNode;
  /** Optional trailing count / badge (e.g. unread signals). */
  badge?: React.ReactNode;
  /** Disable this segment (still keyboard-reachable, not selectable). */
  disabled?: boolean;
}

export interface ViewHeaderSegmentsProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof ToggleGroup.Root>,
    "type" | "value" | "defaultValue" | "onValueChange" | "children"
  > {
  /** The segments to render. */
  segments: ViewHeaderSegment[];
  /** Controlled selected value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Fires with the next value (single-select; never emits empty). */
  onValueChange?: (value: string) => void;
  /** Visual density — inherited from the parent ViewHeader by default. */
  size?: "default" | "compact";
  /** Accessible label for the group when there is no visible heading. */
  "aria-label"?: string;
}

/**
 * The shared `layoutId` for the gliding active pill. Module-scoped + suffixed
 * with a React id per instance so multiple segment rows on one page never share
 * a pill animation.
 */
function usePillLayoutId(): string {
  const reactId = React.useId();
  return `fw-vh-seg-pill-${reactId}`;
}

export const ViewHeaderSegments = React.forwardRef<
  React.ElementRef<typeof ToggleGroup.Root>,
  ViewHeaderSegmentsProps
>(function ViewHeaderSegments(
  {
    segments,
    value,
    defaultValue,
    onValueChange,
    size = "default",
    className,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const pillLayoutId = usePillLayoutId();

  // Track the active value internally so the moving pill renders correctly in
  // both controlled and uncontrolled usage, without owning selection state.
  const [internalValue, setInternalValue] = React.useState<string | undefined>(
    value ?? defaultValue,
  );
  const activeValue = value ?? internalValue;

  const handleChange = React.useCallback(
    (next: string) => {
      // Radix emits "" when the active item is toggled off; we are single-select
      // so we ignore the empty case and keep the current selection.
      if (!next) return;
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange, value],
  );

  const compact = size === "compact";

  return (
    <ToggleGroup.Root
      ref={ref}
      type="single"
      value={activeValue}
      defaultValue={value === undefined ? defaultValue : undefined}
      onValueChange={handleChange}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-fw-md bg-surface-sunken",
        compact ? "p-0.5" : "p-1",
        className,
      )}
      {...rest}
    >
      {segments.map((segment) => {
        const isActive = segment.value === activeValue;
        return (
          <ToggleGroup.Item
            key={segment.value}
            value={segment.value}
            disabled={segment.disabled}
            className={cn(
              "group relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-fw-sm font-fw-sans font-medium",
              "outline-none transition-colors duration-[var(--fw-dur-fast)] ease-[var(--fw-ease-soft)]",
              // Hit target: keep >=24px tall even in compact (a11y §7.4)
              compact ? "h-7 px-2.5 text-caption" : "h-9 px-3.5 text-label",
              // Quiet by default; warm up on hover
              "text-text-secondary hover:text-text-primary",
              // Active = primary text sitting on the lifted pill
              "data-[state=on]:text-text-primary",
              // Focus ring (survives cream); offset clears the pill
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
              // Disabled
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {/* The gliding active pill (matte opaque surface + soft shadow). */}
            {isActive ? (
              <motion.span
                layoutId={reduceMotion ? undefined : pillLayoutId}
                aria-hidden="true"
                className="absolute inset-0 -z-[1] rounded-fw-sm bg-surface shadow-soft"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        type: "spring",
                        stiffness: 320,
                        damping: 32,
                        mass: 0.8,
                      }
                }
              />
            ) : null}
            {segment.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 [&_svg]:h-4 [&_svg]:w-4",
                  compact && "[&_svg]:h-3.5 [&_svg]:w-3.5",
                )}
              >
                {segment.icon}
              </span>
            ) : null}
            <span className="relative">{segment.label}</span>
            {segment.badge != null ? (
              <span
                className={cn(
                  "relative ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 font-fw-mono text-[0.6875rem] leading-none tabular-nums",
                  isActive
                    ? "bg-accent-50 text-accent-700"
                    : "bg-surface text-text-tertiary group-hover:text-text-secondary",
                )}
                style={{ fontFeatureSettings: "var(--fw-numeric-features)" }}
              >
                {segment.badge}
              </span>
            ) : null}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
});
