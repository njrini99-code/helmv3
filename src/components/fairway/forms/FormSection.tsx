"use client";

/**
 * ============================================================================
 * Fairway · forms — FormSection
 * ----------------------------------------------------------------------------
 * Groups related fields under one editorial heading + description, built on
 * Base UI `Fieldset` (renders a real <fieldset>/<legend> for a11y grouping).
 * The title is the Fraunces `h2` voice (the seasoning), the description is warm
 * secondary body. Fields stack with generous spacing — grouped by AIR, not by
 * divider lines (DESIGN-SYSTEM.md §4.2 / Appendix A "light & airy").
 *
 * Use plain `gap` between FormSections for the roomy section rhythm.
 * ========================================================================== */

import * as React from "react";
import { Fieldset } from "@base-ui-components/react/fieldset";
import { cn } from "@/lib/utils";

export interface FormSectionProps
  extends Omit<React.ComponentProps<typeof Fieldset.Root>, "title"> {
  /** Section heading (Fraunces h2 — the editorial group title). */
  title?: React.ReactNode;
  /** One-line description under the title. */
  description?: React.ReactNode;
  /** Right-aligned action cluster beside the title (e.g. "Add row"). */
  action?: React.ReactNode;
  /** Field spacing — `cozy` (default) or `roomy` for hero forms. */
  spacing?: "cozy" | "roomy";
  /** Wrapper classes. */
  className?: string;
  /** Fields. */
  children: React.ReactNode;
}

/**
 * FormSection — a labelled group of fields.
 */
export const FormSection = React.forwardRef<HTMLFieldSetElement, FormSectionProps>(
  function FormSection(
    { title, description, action, spacing = "cozy", className, children, ...props },
    ref,
  ) {
    const hasHeader = Boolean(title || description || action);
    return (
      <Fieldset.Root
        ref={ref}
        data-slot="form-section"
        className={cn("min-w-0 border-0 p-0 m-0", className)}
        {...props}
      >
        {hasHeader ? (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              {title ? (
                <Fieldset.Legend
                  data-slot="form-section-title"
                  className="font-fw-display text-h2 text-text-primary"
                >
                  {title}
                </Fieldset.Legend>
              ) : null}
              {description ? (
                <p className="font-fw-sans text-body text-text-secondary">
                  {description}
                </p>
              ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}

        <div
          data-slot="form-section-fields"
          className={cn(
            "flex flex-col",
            spacing === "roomy" ? "gap-6" : "gap-4",
          )}
        >
          {children}
        </div>
      </Fieldset.Root>
    );
  },
);
