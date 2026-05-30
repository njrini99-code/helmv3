"use client";

/**
 * ============================================================================
 * Fairway · forms — FormField
 * ----------------------------------------------------------------------------
 * The unified field wrapper: a VISIBLE label (always — never placeholder-only),
 * optional help text, and an inline message row that surfaces error / success /
 * validating (async) states WITHOUT shifting layout. Built on Base UI's
 * `Field` primitive so label↔control association, `aria-describedby`, validity
 * wiring, and async `validate` come for free.
 *
 * Compose any Fairway control inside it via the `control` render-prop (it
 * receives the Base UI props that auto-associate the label + messages), or drop
 * a Base UI control as a child directly. Validity is driven by Base UI's Field
 * data attributes so the control re-tints in pure CSS (no reflow).
 *
 * DESIGN-SYSTEM.md: §6 FormField (inline error below field), §7.5 (no CLS —
 * reserved message row), §7.4 (visible label, aria wiring, WCAG contrast).
 * ========================================================================== */

import * as React from "react";
import { Field } from "@base-ui-components/react/field";
import { cn } from "@/lib/utils";
import {
  labelClasses,
  requiredMarkClasses,
  optionalTagClasses,
  helpClasses,
  errorClasses,
  successClasses,
  validatingClasses,
  messageRowClasses,
} from "./styles";

export interface FormFieldProps
  extends Omit<React.ComponentProps<typeof Field.Root>, "children" | "render"> {
  /** Visible label. Required by the design system — there is no label-less field. */
  label: React.ReactNode;
  /** Inline help / description shown below the control (when no error is visible). */
  help?: React.ReactNode;
  /**
   * A controlled error message. When provided (non-empty), the field renders as
   * invalid and shows this message. Use this for server-side / external errors;
   * for built-in validation pass `validate` (Base UI) instead and omit this.
   */
  error?: React.ReactNode;
  /**
   * A controlled success confirmation (e.g. "Username available"). Shown only
   * when there is no error and the field is not validating.
   */
  success?: React.ReactNode;
  /** Whether an async validation is currently in flight (shows a calm spinner). */
  validating?: boolean;
  /** Message shown while `validating` (defaults to "Checking…"). */
  validatingMessage?: React.ReactNode;
  /** Marks the field as required (renders a green required marker after the label). */
  required?: boolean;
  /**
   * Shows a recessive "Optional" tag next to the label. Ignored when `required`.
   */
  showOptional?: boolean;
  /**
   * The control. Either a render-prop receiving `{ id }`-less Base UI wiring
   * (preferred — keeps association automatic) or a plain node. Most Fairway
   * controls below accept being placed here directly.
   */
  children: React.ReactNode;
  /** Extra classes for the field root wrapper. */
  className?: string;
  /** Extra classes for the label element. */
  labelClassName?: string;
}

/**
 * FormField — label + control + reserved inline-message row.
 *
 * The message row reserves vertical space so toggling help → error → success →
 * validating never causes a layout shift. Priority: error > validating >
 * success > help.
 */
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  function FormField(
    {
      label,
      help,
      error,
      success,
      validating = false,
      validatingMessage = "Checking…",
      required,
      showOptional,
      children,
      className,
      labelClassName,
      invalid,
      ...fieldRootProps
    },
    ref,
  ) {
    const hasError = Boolean(error);
    // If a controlled `error` string is set, force the Field invalid so the
    // control tints via [data-invalid]. Otherwise defer to Base UI validity.
    const computedInvalid = hasError ? true : invalid;

    const showSuccess = !hasError && !validating && Boolean(success);
    const showValidating = !hasError && validating;
    const showHelp = !hasError && !showValidating && !showSuccess && Boolean(help);

    return (
      <Field.Root
        ref={ref}
        data-slot="form-field"
        invalid={computedInvalid}
        className={cn("flex flex-col", className)}
        {...fieldRootProps}
      >
        <Field.Label
          data-slot="form-field-label"
          className={cn(labelClasses, "mb-1.5", labelClassName)}
        >
          <span>{label}</span>
          {required ? (
            <span aria-hidden className={requiredMarkClasses}>
              *
            </span>
          ) : showOptional ? (
            <span className={optionalTagClasses}>Optional</span>
          ) : null}
        </Field.Label>

        {children}

        {/* Reserved message row — fixed min-height prevents layout shift.
            Priority: controlled error > validating > success > help.
            When NO controlled error is supplied, Base UI's own <Field.Error>
            owns visibility (built-in / async `validate` messages). */}
        <div className={messageRowClasses}>
          {hasError ? (
            <p
              data-slot="form-field-error"
              role="alert"
              className={errorClasses}
            >
              <ErrorGlyph />
              <span>{error}</span>
            </p>
          ) : showValidating ? (
            <p
              data-slot="form-field-validating"
              role="status"
              aria-live="polite"
              className={validatingClasses}
            >
              <Spinner />
              <span>{validatingMessage}</span>
            </p>
          ) : showSuccess ? (
            <p
              data-slot="form-field-success"
              aria-live="polite"
              className={successClasses}
            >
              <CheckGlyph />
              <span>{success}</span>
            </p>
          ) : (
            <>
              {/* Base UI renders this only while the field is invalid; it
                  injects the validity message as children, which we wrap with
                  the leading error glyph via `render`. */}
              <Field.Error
                data-slot="form-field-error"
                className={errorClasses}
                render={(props) => (
                  <p {...props}>
                    <ErrorGlyph />
                    <span>{props.children}</span>
                  </p>
                )}
              />
              {showHelp ? (
                <Field.Description
                  data-slot="form-field-help"
                  className={helpClasses}
                >
                  {help}
                </Field.Description>
              ) : null}
            </>
          )}
        </div>
      </Field.Root>
    );
  },
);

/* ---- Tiny inline glyphs (no icon dep; stroke = currentColor) ---- */

function ErrorGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="mt-px h-3.5 w-3.5 shrink-0"
      fill="none"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5v3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11" r="0.85" fill="currentColor" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="mt-px h-3.5 w-3.5 shrink-0"
      fill="none"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m5.4 8.2 1.9 1.9 3.4-3.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin-slow"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.6"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
