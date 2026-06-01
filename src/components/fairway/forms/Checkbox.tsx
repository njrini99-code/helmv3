"use client";

/**
 * ============================================================================
 * Fairway · forms — Checkbox & CheckboxGroup
 * ----------------------------------------------------------------------------
 * Warm matte checkbox built on Base UI `Checkbox`. Checked = helm-green fill
 * with a cream check; indeterminate = green dash. The box is a >=24px target
 * (control is 18px but the label row extends the hit area). Optional label +
 * description compose into a tidy row. `CheckboxGroup` coordinates a set.
 *
 * DESIGN-SYSTEM.md §1 (green = action/meaning), §7.1 (states), §7.4 (targets,
 * color never the only channel — the check/dash glyph carries state too).
 * ========================================================================== */

import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { CheckboxGroup as BaseCheckboxGroup } from "@base-ui-components/react/checkbox-group";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.ComponentProps<typeof BaseCheckbox.Root>, "render"> {
  /** Visible label rendered beside the box. */
  label?: React.ReactNode;
  /** Secondary description under the label. */
  description?: React.ReactNode;
  /** Classes for the outer label wrapper. */
  className?: string;
  /** Classes for the box itself. */
  boxClassName?: string;
}

const boxBase = cn(
  "flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[0.375rem]",
  "border border-border-strong bg-surface text-text-on-accent",
  "transition-[background-color,border-color,box-shadow] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
  // checked / indeterminate → green fill
  "data-[checked]:border-accent-500 data-[checked]:bg-accent-500",
  "data-[indeterminate]:border-accent-500 data-[indeterminate]:bg-accent-500",
  // focus ring survives black + cream
  "outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

/**
 * Checkbox — optionally labelled. With no `label`, renders just the box.
 */
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox(
    { label, description, className, boxClassName, id, ...props },
    ref,
  ) {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;

    const box = (
      <BaseCheckbox.Root
        ref={ref}
        id={fieldId}
        data-slot="checkbox"
        className={cn(boxBase, boxClassName)}
        {...props}
      >
        <BaseCheckbox.Indicator
          className="flex items-center justify-center"
          render={(indicatorProps, state) => (
            <span {...indicatorProps}>
              {state.indeterminate ? <DashGlyph /> : <CheckGlyph />}
            </span>
          )}
        />
      </BaseCheckbox.Root>
    );

    if (!label && !description) return box;

    return (
      <label
        htmlFor={fieldId}
        data-slot="checkbox-label"
        className={cn(
          "flex cursor-pointer items-start gap-2.5 py-1 group",
          "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
          className,
        )}
      >
        <span className="mt-px">{box}</span>
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
      </label>
    );
  },
);

/**
 * CheckboxGroup — coordinates a set of checkboxes (shared name + value array).
 */
export const CheckboxGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof BaseCheckboxGroup>
>(function CheckboxGroup({ className, ...props }, ref) {
  return (
    <BaseCheckboxGroup
      ref={ref}
      data-slot="checkbox-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
});

/* ---- glyphs ---- */

function CheckGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none">
      <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
