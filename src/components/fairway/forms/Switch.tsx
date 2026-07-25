"use client";

/**
 * ============================================================================
 * Fairway · forms — Switch
 * ----------------------------------------------------------------------------
 * Soft tactile toggle built on Base UI `Switch`. Off = warm sunken track;
 * on = helm-green track. The thumb glides with the gentle spring easing (a
 * small-distance transform — honors reduced motion via motion-safe). >=24px
 * target; full hover/focus-visible/active states. Optional label + description.
 *
 * DESIGN-SYSTEM.md §1 (green = on/meaning), §7.1 (spring on toggle, small
 * overshoot only), §7.4 (visible focus, 24px target).
 * ========================================================================== */

import * as React from "react";
import { Switch as BaseSwitch } from "@base-ui-components/react/switch";
import { cn } from "@/lib/utils";
import { fwHaptic } from "@/lib/fairway/haptics";

export interface SwitchProps
  extends Omit<React.ComponentProps<typeof BaseSwitch.Root>, "render"> {
  /** Visible label beside the switch. */
  label?: React.ReactNode;
  /** Secondary description under the label. */
  description?: React.ReactNode;
  /** Outer wrapper classes. */
  className?: string;
  /** Track classes. */
  trackClassName?: string;
  /** Place the label before the switch (default after). */
  labelPosition?: "start" | "end";
}

const trackBase = cn(
  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5",
  "bg-surface-sunken border border-border-strong",
  // 44px tap target (Layer 3 / iOS): the visible track stays 24px tall, but a
  // transparent overlay extends the hit area to 44px×44px without affecting
  // layout. -inset-y-[0.625rem] adds 10px above+below (24+20=44); the width pad
  // keeps the slim track comfortably tappable on the tight notifications matrix.
  "before:absolute before:-inset-y-[0.625rem] before:inset-x-0 before:content-['']",
  "transition-[background-color,border-color] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
  // accent-700, not accent-500. The ON track is a UI COMPONENT, so WCAG 1.4.11
  // wants 3:1 against what surrounds it — accent-500 measures 2.92:1 on the
  // card and 2.67:1 on canvas, so "on" read as a washed-out mint rather than a
  // decisive state. accent-700 is 5.70:1, and matches what H10 already did to
  // the primary Button (2026-07-25).
  "data-[checked]:border-accent-700 data-[checked]:bg-accent-700",
  "outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

const thumbBase = cn(
  "block h-[1.125rem] w-[1.125rem] rounded-full bg-surface shadow-soft",
  "transition-transform [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-spring)]",
  "motion-reduce:transition-none",
  "translate-x-0 data-[checked]:translate-x-5",
  // on a green track the thumb reads as cream
  "data-[checked]:bg-text-on-accent",
);

/**
 * Switch — optionally labelled toggle.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    {
      label,
      description,
      className,
      trackClassName,
      labelPosition = "end",
      id,
      onCheckedChange,
      ...props
    },
    ref,
  ) {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;

    // Selection tick on toggle (fire-and-forget, no-op on web).
    const handleCheckedChange: NonNullable<SwitchProps["onCheckedChange"]> = (
      ...args
    ) => {
      fwHaptic("selection");
      onCheckedChange?.(...args);
    };

    const control = (
      <BaseSwitch.Root
        ref={ref}
        id={fieldId}
        data-slot="switch"
        className={cn(trackBase, trackClassName)}
        onCheckedChange={handleCheckedChange}
        {...props}
      >
        <BaseSwitch.Thumb data-slot="switch-thumb" className={thumbBase} />
      </BaseSwitch.Root>
    );

    if (!label && !description) return control;

    const labelBlock = (
      <span className="flex flex-col gap-0.5">
        {label ? (
          <span className="font-fw-sans text-body-sm font-medium text-text-primary select-none">
            {label}
          </span>
        ) : null}
        {description ? (
          <span className="font-fw-sans text-caption text-text-secondary select-none">
            {description}
          </span>
        ) : null}
      </span>
    );

    return (
      <label
        htmlFor={fieldId}
        data-slot="switch-label"
        className={cn(
          "flex cursor-pointer items-center gap-3 py-1",
          labelPosition === "start" && "justify-between",
          "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
          className,
        )}
      >
        {labelPosition === "start" ? (
          <>
            {labelBlock}
            {control}
          </>
        ) : (
          <>
            {control}
            {labelBlock}
          </>
        )}
      </label>
    );
  },
);
