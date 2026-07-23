"use client";

/* ============================================================================
 * Fairway — ViewHeaderSegments
 * ----------------------------------------------------------------------------
 * The optional compact "quiet" tab / segmented row that can sit under a
 * ViewHeader (e.g. CoachHelm's Brief / Signals / Players / Effectiveness / Ask
 * sub-nav). Public props are UNCHANGED — this file used to hand-roll its own
 * Radix ToggleGroup + moving pill; it now DELEGATES all track/pill rendering
 * to `Segmented` (`@/components/fairway/controls/segmented`), the ONE shared
 * segmented-control primitive, so there is a single pill implementation
 * app-wide instead of two visually-drifting ones. ViewHeaderSegments' own job
 * shrinks to: (1) adapt its richer `segments` shape (icon + trailing
 * badge) onto Segmented's `options` shape, (2) own the controlled/
 * uncontrolled value bookkeeping Segmented itself doesn't provide, (3) map
 * `size: "default" | "compact"` onto Segmented's `"md" | "sm"`.
 *
 * Nothing in the tree imports this component yet (ADDITIVE), so this rewrite
 * carries no call-site risk. Every DOCUMENTED prop (segments/value/
 * defaultValue/onValueChange/size/aria-label/className) is preserved with
 * identical names and semantics. The old type signature also structurally
 * inherited arbitrary Radix `ToggleGroup.Root` DOM props (dir/loop/
 * orientation/...) via `Omit<ComponentPropsWithoutRef<...>>` — dropped here
 * on purpose: Segmented's own public API is intentionally closed (no
 * passthrough), so silently accepting-and-discarding those props would be a
 * worse trap for a future caller than not offering them at all.
 * ========================================================================== */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Segmented, type SegmentedOption } from "../controls/segmented";

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

export interface ViewHeaderSegmentsProps {
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
  className?: string;
}

/** `badge`'s pill styling — ported verbatim from the pre-delegation render,
 *  folded into Segmented's `label` ReactNode slot (Segmented's own public API
 *  has no badge concept — composing it into `label` keeps that API closed). */
function badgePill(badge: React.ReactNode, isActive: boolean): React.ReactNode {
  return (
    <span
      className={cn(
        "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 font-fw-mono text-[0.6875rem] leading-none tabular-nums",
        isActive ? "bg-accent-50 text-accent-700" : "bg-surface text-text-tertiary",
      )}
      style={{ fontFeatureSettings: "var(--fw-numeric-features)" }}
    >
      {badge}
    </span>
  );
}

export function ViewHeaderSegments({
  segments,
  value,
  defaultValue,
  onValueChange,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: ViewHeaderSegmentsProps) {
  // Track the active value internally so both controlled and uncontrolled
  // usage work without Segmented (fully controlled) needing to know the
  // difference — this component is the adapter, not Segmented.
  const [internalValue, setInternalValue] = React.useState<string | undefined>(
    value ?? defaultValue,
  );
  const activeValue = value ?? internalValue;

  const handleChange = React.useCallback(
    (next: string) => {
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange, value],
  );

  const options: SegmentedOption[] = React.useMemo(
    () =>
      segments.map((segment) => {
        const isActive = segment.value === activeValue;
        return {
          value: segment.value,
          icon: segment.icon,
          disabled: segment.disabled,
          label:
            segment.badge != null ? (
              <span className="inline-flex items-center">
                <span>{segment.label}</span>
                {badgePill(segment.badge, isActive)}
              </span>
            ) : (
              segment.label
            ),
        };
      }),
    [segments, activeValue],
  );

  return (
    <Segmented
      options={options}
      // Segmented requires a non-optional `value` (fully controlled, single-
      // select) — an empty string is Radix's own "nothing selected" sentinel
      // (the same value `onValueChange` emits when a toggle is turned off),
      // so it is a safe, type-stable stand-in for "no active value yet".
      value={activeValue ?? ""}
      onValueChange={handleChange}
      size={size === "compact" ? "sm" : "md"}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
