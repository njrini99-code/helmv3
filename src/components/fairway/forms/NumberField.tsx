"use client";

/**
 * ============================================================================
 * Fairway · forms — NumberField
 * ----------------------------------------------------------------------------
 * Numeric input with increment / decrement steppers and pointer scrubbing,
 * built on Base UI `NumberField`. The value reads in Fragment Mono tabular
 * (`font-fw-mono`) so digits align and never jitter — the design system's rule
 * for numerics. Steppers are >=24px square hit targets with full interactive
 * states. Wires into FormField via the surrounding `Field`.
 *
 * DESIGN-SYSTEM.md §3 (mono tabular numerics), §6 (NumberField for scores),
 * §7.1 (hover/focus/active), §7.4 (24px targets).
 * ========================================================================== */

import * as React from "react";
import { NumberField as BaseNumberField } from "@base-ui-components/react/number-field";
import { cn } from "@/lib/utils";
import { sizeClasses, type FieldSize } from "./styles";

export interface NumberFieldProps
  extends Omit<React.ComponentProps<typeof BaseNumberField.Root>, "render"> {
  size?: FieldSize;
  /** Hide the +/- steppers (keyboard + scrub still work). */
  hideSteppers?: boolean;
  /** Optional unit suffix shown after the value (e.g. "yds", "%"). */
  unit?: React.ReactNode;
  /** Wrapper classes. */
  className?: string;
}

const stepperClasses = cn(
  "flex h-full w-9 shrink-0 select-none items-center justify-center",
  "text-text-secondary",
  "transition-colors [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
  "hover:bg-accent-50 hover:text-accent-700",
  "active:translate-y-[0.5px]",
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/70",
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary",
);

/**
 * NumberField — tabular numeric input with steppers + scrub.
 */
export const NumberField = React.forwardRef<HTMLDivElement, NumberFieldProps>(
  function NumberField(
    { size = "md", hideSteppers = false, unit, className, ...rootProps },
    ref,
  ) {
    return (
      <BaseNumberField.Root ref={ref} data-slot="number-field" {...rootProps}>
        <BaseNumberField.Group
          className={cn(
            "flex w-full items-stretch overflow-hidden rounded-fw-sm",
            "bg-surface-sunken border border-border-subtle",
            "transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
            "hover:border-border-strong",
            "focus-within:border-border-focus focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-1 focus-within:ring-offset-canvas",
            "has-[[data-invalid]]:border-fw-danger/60",
            "has-[:disabled]:opacity-50",
            className,
          )}
        >
          {!hideSteppers ? (
            <BaseNumberField.Decrement
              aria-label="Decrease"
              className={cn(stepperClasses, "border-r border-border-subtle")}
            >
              <MinusGlyph />
            </BaseNumberField.Decrement>
          ) : null}

          <BaseNumberField.ScrubArea className="flex flex-1 items-center">
            <BaseNumberField.Input
              data-slot="number-field-input"
              className={cn(
                "w-full bg-transparent text-center font-fw-mono tabular-nums text-text-primary",
                "outline-none placeholder:text-text-tertiary",
                // size-aware padding (Group already sets the height floor)
                sizeClasses[size],
                "border-0",
              )}
            />
            {unit ? (
              <span className="pr-3 font-fw-mono text-body-sm text-text-tertiary">
                {unit}
              </span>
            ) : null}
          </BaseNumberField.ScrubArea>

          {!hideSteppers ? (
            <BaseNumberField.Increment
              aria-label="Increase"
              className={cn(stepperClasses, "border-l border-border-subtle")}
            >
              <PlusGlyph />
            </BaseNumberField.Increment>
          ) : null}
        </BaseNumberField.Group>
      </BaseNumberField.Root>
    );
  },
);

/* ---- glyphs ---- */

function PlusGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path
        d="M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
