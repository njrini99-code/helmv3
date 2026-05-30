"use client";

/**
 * ============================================================================
 * Fairway · forms — RadioGroup & Radio
 * ----------------------------------------------------------------------------
 * Single-choice group built on Base UI `RadioGroup` + `Radio`. Selected = green
 * ring with a green dot; the dot is a separate visual channel so state never
 * relies on color alone. Each option is a labelled row with a >=24px target and
 * full hover/focus-visible/active states. Wires into FormField via `Field`.
 *
 * Two ways to use it:
 *   1. Data-driven:  <RadioGroup options={[{label,value,description}]} />
 *   2. Composed:     <RadioGroup> <Radio value="a" label="A" /> … </RadioGroup>
 *
 * DESIGN-SYSTEM.md §1 (green = selection), §7.1 (states), §7.4 (a11y, targets).
 * ========================================================================== */

import * as React from "react";
import { RadioGroup as BaseRadioGroup } from "@base-ui-components/react/radio-group";
import { Radio as BaseRadio } from "@base-ui-components/react/radio";
import { cn } from "@/lib/utils";

export interface RadioOption {
  label: React.ReactNode;
  value: string;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps
  extends Omit<React.ComponentProps<typeof BaseRadioGroup>, "render"> {
  /** Convenience: render a list of radios without composing subcomponents. */
  options?: RadioOption[];
  /** Layout direction of the options. */
  orientation?: "vertical" | "horizontal";
  /** Wrapper classes. */
  className?: string;
}

/**
 * RadioGroup — data-driven or composed single-choice group.
 */
export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  function RadioGroup(
    { options, orientation = "vertical", className, children, ...props },
    ref,
  ) {
    return (
      <BaseRadioGroup
        ref={ref}
        data-slot="radio-group"
        className={cn(
          "flex gap-1",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap gap-x-5",
          className,
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <Radio
                key={opt.value}
                value={opt.value}
                label={opt.label}
                description={opt.description}
                disabled={opt.disabled}
              />
            ))
          : children}
      </BaseRadioGroup>
    );
  },
);

export interface RadioProps
  extends Omit<React.ComponentProps<typeof BaseRadio.Root>, "render"> {
  /** Visible label beside the dot. */
  label?: React.ReactNode;
  /** Secondary description under the label. */
  description?: React.ReactNode;
  /** Outer label wrapper classes. */
  className?: string;
  /** Dot/ring classes. */
  dotClassName?: string;
}

const radioBase = cn(
  "flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full",
  "border border-border-strong bg-surface",
  "transition-[border-color,box-shadow] duration-[var(--fw-dur-fast)] ease-[var(--fw-ease-soft)]",
  "data-[checked]:border-accent-500",
  "outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

/**
 * Radio — a single option. Use inside a RadioGroup.
 */
export const Radio = React.forwardRef<HTMLButtonElement, RadioProps>(
  function Radio(
    { label, description, className, dotClassName, id, ...props },
    ref,
  ) {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;

    const control = (
      <BaseRadio.Root
        ref={ref}
        id={fieldId}
        data-slot="radio"
        className={cn(radioBase, dotClassName)}
        {...props}
      >
        <BaseRadio.Indicator className="flex">
          <span className="h-2 w-2 rounded-full bg-accent-500 motion-safe:animate-scale-in" />
        </BaseRadio.Indicator>
      </BaseRadio.Root>
    );

    if (!label && !description) return control;

    return (
      <label
        htmlFor={fieldId}
        data-slot="radio-label"
        className={cn(
          "flex cursor-pointer items-start gap-2.5 py-1 group",
          "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
          className,
        )}
      >
        <span className="mt-px">{control}</span>
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
