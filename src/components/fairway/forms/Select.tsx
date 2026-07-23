"use client";

/**
 * ============================================================================
 * Fairway · forms — Select
 * ----------------------------------------------------------------------------
 * Warm matte single/multi select built on Base UI `Select` (listbox + full
 * ARIA + keyboard + typeahead for free). Two ways to use it:
 *
 *   1. Data-driven (simplest):  <Select options={[{label,value}]} … />
 *   2. Composed (groups, custom items):  <Select> <Select.Group> … </Select>
 *
 * The trigger is the matte sunken control surface; the popup is the Elevated
 * overlay (materialize motion, honors reduced motion). Selected items show a
 * check; highlighted items get the accent-50 wash.
 *
 * DESIGN-SYSTEM.md §6 (Select on Base UI), §4.3 (Elevated popover), §7 (a11y).
 * ========================================================================== */

import * as React from "react";
import { Select as BaseSelect } from "@base-ui-components/react/select";
import { cn } from "@/lib/utils";
import { useModalPortalContainer } from "@/components/fairway/overlays/_shared";
import {
  sizeClasses,
  popupClasses,
  popupPositionerClasses,
  optionClasses,
  groupLabelClasses,
  type FieldSize,
} from "./styles";

export interface SelectOption {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
}

type BaseRootProps = React.ComponentProps<typeof BaseSelect.Root<string, false>>;

export interface SelectProps
  extends Omit<BaseRootProps, "children"> {
  /** Convenience: render a flat option list without composing subcomponents. */
  options?: SelectOption[];
  /** Placeholder shown when no value is selected. */
  placeholder?: React.ReactNode;
  /** Control size. */
  size?: FieldSize;
  /** Trigger classes. */
  className?: string;
  /** Composed children (Select.Group / Select.Item …). Ignored if `options` set. */
  children?: React.ReactNode;
}

/**
 * Select — single-value, data-driven or composed.
 */
function SelectRoot({
  options,
  placeholder = "Select…",
  size = "md",
  className,
  children,
  ...rootProps
}: SelectProps) {
  // Build a value->label lookup so <Select.Value> can render the selected
  // label (not the raw value) and the placeholder when empty.
  const labelFor = React.useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    options?.forEach((o) => map.set(o.value, o.label));
    return map;
  }, [options]);

  // Nearest ModalShell/Drawer's Dialog.Content DOM node, if this Select is
  // rendered inside one. `?? undefined` matters: Base UI's portal treats an
  // explicit `container={null}` as "wait for a real target" (renders
  // nothing), not "use document.body" — only `undefined` falls through to
  // the default. Without this, the popup portals to document.body while its
  // host Dialog traps focus via real DOM containment, so the popup can never
  // keep focus once opened (see fairway/overlays/_shared.ts docblock).
  const modalPortalContainer = useModalPortalContainer();

  return (
    <BaseSelect.Root {...rootProps}>
      <BaseSelect.Trigger
        data-slot="select-trigger"
        className={cn(
          "flex w-full items-center justify-between gap-2 font-fw-sans rounded-fw-sm",
          "bg-surface-sunken border border-border-subtle text-text-primary text-left",
          sizeClasses[size],
          "transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
          "hover:border-border-strong",
          "outline-none focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
          "data-[popup-open]:border-border-focus",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          "data-[invalid]:border-fw-danger/60",
          className,
        )}
      >
        <BaseSelect.Value data-slot="select-value" className="truncate">
          {(value: string | null) => {
            if (value == null || value === "") {
              return <span className="text-text-tertiary">{placeholder}</span>;
            }
            // Prefer the option label; fall back to the raw value.
            return labelFor.get(value) ?? value;
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon
          data-slot="select-icon"
          className="shrink-0 text-text-tertiary transition-transform [transition-duration:var(--fw-dur-fast)] data-[popup-open]:rotate-180"
        >
          <ChevronGlyph />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal container={modalPortalContainer ?? undefined}>
        <BaseSelect.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className={popupPositionerClasses}
        >
          <BaseSelect.Popup data-slot="select-popup" className={popupClasses}>
            {options
              ? options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </SelectItem>
                ))
              : children}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

/** A selectable option. */
export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      className={cn(optionClasses, className)}
      {...props}
    >
      <BaseSelect.ItemText className="truncate">{children}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className="absolute right-2.5 flex items-center text-accent-600">
        <CheckGlyph />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

/** A labelled group of options. */
export function SelectGroup({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Group> & { label?: React.ReactNode }) {
  return (
    <BaseSelect.Group
      data-slot="select-group"
      className={cn("py-0.5", className)}
      {...props}
    >
      {label ? (
        <BaseSelect.GroupLabel className={groupLabelClasses}>
          {label}
        </BaseSelect.GroupLabel>
      ) : null}
      {children}
    </BaseSelect.Group>
  );
}

/* ---- glyphs ---- */

function ChevronGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Composable namespace: `<Select.Item>`, `<Select.Group>`. */
export const Select = Object.assign(SelectRoot, {
  Item: SelectItem,
  Group: SelectGroup,
});
