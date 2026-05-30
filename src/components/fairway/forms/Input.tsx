"use client";

/**
 * ============================================================================
 * Fairway · forms — Input & TextArea
 * ----------------------------------------------------------------------------
 * Warm matte text controls. `Input` renders Base UI's `<Input>` (which wires
 * itself to a surrounding `Field` for label + validity); `TextArea` renders a
 * native `<textarea>` through Base UI's `Field.Control` so it gets the same
 * association + validity data attributes.
 *
 * Optional leading/trailing adornments (icon, unit, action) sit inside the
 * control surface without breaking the focus ring. Validity re-tints in CSS
 * via [data-invalid] (no layout shift).
 *
 * DESIGN-SYSTEM.md §4.1 (Inset surface), §7.1 (interactive states), §7.4 (a11y).
 * ========================================================================== */

import * as React from "react";
import { Input as BaseInput } from "@base-ui-components/react/input";
import { Field } from "@base-ui-components/react/field";
import { cn } from "@/lib/utils";
import { fieldControlBase, sizeClasses, type FieldSize } from "./styles";

/* ------------------------------------------------------------------ Input */

export interface InputProps
  extends Omit<React.ComponentProps<typeof BaseInput>, "size"> {
  size?: FieldSize;
  /** Content rendered before the text (icon, currency symbol). Non-interactive by default. */
  leading?: React.ReactNode;
  /** Content rendered after the text (unit, clear button, status). */
  trailing?: React.ReactNode;
}

/**
 * Input — the default single-line text control.
 * When `leading`/`trailing` are present it wraps the control in a surface so
 * the adornments sit inside the well; otherwise the control IS the surface.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { size = "md", leading, trailing, className, ...props },
    ref,
  ) {
    if (!leading && !trailing) {
      return (
        <BaseInput
          ref={ref}
          data-slot="input"
          className={cn(fieldControlBase, sizeClasses[size], className)}
          {...props}
        />
      );
    }

    // Adorned variant: the wrapper owns the surface + focus-within ring; the
    // inner control is transparent so the warm well shows through.
    return (
      <div
        data-slot="input-wrapper"
        className={cn(
          "flex w-full items-center gap-2 rounded-fw-sm",
          "bg-surface-sunken border border-border-subtle",
          "transition-[border-color,box-shadow] duration-[var(--fw-dur-fast)] ease-[var(--fw-ease-soft)]",
          "hover:border-border-strong",
          "focus-within:border-border-focus focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-1 focus-within:ring-offset-canvas",
          "has-[[data-invalid]]:border-fw-danger/60 has-[[data-invalid]]:focus-within:ring-fw-danger/40",
          "has-[:disabled]:opacity-50 has-[:disabled]:hover:border-border-subtle",
          sizeClasses[size],
          "py-0",
          className,
        )}
      >
        {leading ? (
          <span
            aria-hidden
            className="flex shrink-0 items-center text-text-tertiary [&_svg]:h-4 [&_svg]:w-4"
          >
            {leading}
          </span>
        ) : null}
        <BaseInput
          ref={ref}
          data-slot="input"
          className={cn(
            "min-w-0 flex-1 bg-transparent font-fw-sans text-text-primary outline-none",
            "placeholder:text-text-tertiary",
            // match the wrapper's vertical rhythm
            size === "sm" ? "py-1.5 text-body-sm" : size === "lg" ? "py-2.5 text-body-lg" : "py-2 text-body",
          )}
          {...props}
        />
        {trailing ? (
          <span className="flex shrink-0 items-center text-text-tertiary [&_svg]:h-4 [&_svg]:w-4">
            {trailing}
          </span>
        ) : null}
      </div>
    );
  },
);

/* --------------------------------------------------------------- TextArea */

export interface TextAreaProps
  extends Omit<React.ComponentProps<"textarea">, "size"> {
  size?: FieldSize;
  /** Min rows (default 3). */
  rows?: number;
}

/**
 * TextArea — multi-line text. Rendered through `Field.Control` (swapping its
 * default `<input>` for a `<textarea>` via `render`) so it inherits label
 * association + validity from FormField. `field-sizing: content` lets it grow
 * with content where supported without a manual resize handler.
 */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ size = "md", rows = 3, className, ...props }, ref) {
    return (
      <Field.Control
        data-slot="textarea"
        // This IS the Fairway textarea primitive (the design-system replacement
        // for the legacy @/components/ui Textarea); it must own a raw <textarea>
        // to swap into Base UI's Field.Control. Importing the legacy one would
        // defeat the redesign and create a circular dependency on the old system.
        /* eslint-disable-next-line helm/no-raw-input */
        render={<textarea ref={ref} rows={rows} />}
        className={cn(
          fieldControlBase,
          sizeClasses[size],
          "min-h-[5rem] resize-y leading-relaxed [field-sizing:content]",
          className,
        )}
        {...(props as Omit<
          React.ComponentProps<typeof Field.Control>,
          "render" | "className"
        >)}
      />
    );
  },
);
