"use client";

/**
 * ============================================================================
 * Fairway · forms — Form
 * ----------------------------------------------------------------------------
 * Thin re-export of Base UI `Form` with a warm default layout. Coordinates
 * field-level validation + server-error injection (`errors` prop maps field
 * name -> message, surfaced by each FormField's <Field.Error>). Use it as the
 * outer <form> so server-action errors land inline on the right field without
 * any extra wiring.
 *
 * DESIGN-SYSTEM.md §6 (one validation contract), Appendix A (roomy rhythm).
 * ========================================================================== */

import * as React from "react";
import { Form as BaseForm } from "@base-ui-components/react/form";
import { cn } from "@/lib/utils";

export interface FormProps extends React.ComponentProps<typeof BaseForm> {
  /** Vertical rhythm between top-level sections/fields. */
  spacing?: "cozy" | "roomy";
}

/**
 * Form — the outer <form> that distributes validation + server errors.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  function Form({ spacing = "roomy", className, ...props }, ref) {
    return (
      <BaseForm
        ref={ref}
        data-slot="form"
        className={cn(
          "flex flex-col",
          spacing === "roomy" ? "gap-8" : "gap-5",
          className,
        )}
        {...props}
      />
    );
  },
);
