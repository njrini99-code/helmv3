"use client";

/**
 * ============================================================================
 * Fairway · forms — Combobox
 * ----------------------------------------------------------------------------
 * Filterable single / multi select built on Base UI `Combobox` (typeahead
 * filtering, ARIA listbox/combobox, keyboard nav for free). Multi-select shows
 * removable chips inside the matte control. Built-in `Combobox.Empty` covers
 * the no-matches state.
 *
 * Data-driven by `options`; Base UI filters them internally as the user types.
 * The popup is the Elevated overlay (materialize motion, reduced-motion safe).
 *
 * DESIGN-SYSTEM.md §6 (Combobox/Autocomplete on Base UI), §4.3 (Elevated
 * popover), §7.3 (honest empty state), §7.4 (a11y, no color-only signal).
 * ========================================================================== */

import * as React from "react";
import { Combobox as BaseCombobox } from "@base-ui-components/react/combobox";
import { cn } from "@/lib/utils";
import { useModalPortalContainer } from "@/components/fairway/overlays/_shared";
import { popupClasses, popupPositionerClasses, optionClasses, type FieldSize } from "./styles";

export interface ComboboxOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface ComboboxBaseProps {
  /** The selectable options (filtered internally by Base UI as you type). */
  options: ComboboxOption[];
  /** Placeholder for the text input. */
  placeholder?: string;
  /** Control size. */
  size?: FieldSize;
  /** Message shown when the query matches nothing. */
  emptyMessage?: React.ReactNode;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Field name for form submission. */
  name?: string;
  /** Wrapper classes. */
  className?: string;
}

export interface SingleComboboxProps extends ComboboxBaseProps {
  multiple?: false;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
}

export interface MultiComboboxProps extends ComboboxBaseProps {
  multiple: true;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

/**
 * Combobox — typeahead single or multi select.
 */
export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = "Search…",
    size = "md",
    emptyMessage = "No matches",
    disabled,
    name,
    className,
  } = props;

  const isMulti = props.multiple === true;

  // Same ModalShell/Drawer portal-container + z-index fix as Select.tsx —
  // see fairway/overlays/_shared.ts's ModalPortalContext docblock and
  // styles.ts's popupPositionerClasses docblock for the two independent bugs
  // this addresses (focus-trap fight + z-index on the wrong element).
  const modalPortalContainer = useModalPortalContainer();

  return (
    // The generic args are erased here intentionally: the discriminated union
    // above gives callers full type-safety, and Base UI accepts string values.
    <BaseCombobox.Root
      items={options}
      multiple={isMulti as never}
      itemToStringLabel={(item: unknown) => (item as ComboboxOption).label}
      value={props.value as never}
      defaultValue={props.defaultValue as never}
      onValueChange={props.onValueChange as never}
      name={name}
      disabled={disabled}
    >
      <div
        data-slot="combobox-control"
        className={cn(
          "flex w-full flex-wrap items-center gap-1.5 rounded-fw-sm",
          "bg-surface-sunken border border-border-subtle",
          "transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
          "hover:border-border-strong",
          "focus-within:border-border-focus focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-1 focus-within:ring-offset-canvas",
          "has-[[data-invalid]]:border-fw-danger/60",
          "has-[:disabled]:opacity-50",
          // tighten vertical padding; chips/input set their own height
          size === "sm" ? "min-h-[2rem] px-2 py-1" : size === "lg" ? "min-h-[3rem] px-3 py-1.5" : "min-h-[2.5rem] px-2.5 py-1.5",
          className,
        )}
      >
        {isMulti ? (
          <BaseCombobox.Chips className="contents">
            <BaseCombobox.Value>
              {(values: ComboboxOption[]) =>
                values.map((item) => (
                  <BaseCombobox.Chip
                    key={item.value}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-fw-sm py-0.5 pl-2 pr-1",
                      "bg-accent-50 text-accent-900 text-caption font-medium",
                    )}
                  >
                    {item.label}
                    <BaseCombobox.ChipRemove
                      aria-label={`Remove ${item.label}`}
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full text-accent-700/70",
                        "transition-colors [transition-duration:var(--fw-dur-fast)] hover:bg-accent-200/60 hover:text-accent-900",
                        "outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70",
                      )}
                    >
                      <CloseGlyph />
                    </BaseCombobox.ChipRemove>
                  </BaseCombobox.Chip>
                ))
              }
            </BaseCombobox.Value>
          </BaseCombobox.Chips>
        ) : null}

        <BaseCombobox.Input
          data-slot="combobox-input"
          placeholder={placeholder}
          className={cn(
            "min-w-[6rem] flex-1 bg-transparent font-fw-sans text-text-primary outline-none",
            "placeholder:text-text-tertiary",
            size === "sm" ? "py-0.5 text-body-sm" : size === "lg" ? "py-1 text-body-lg" : "py-0.5 text-body",
          )}
        />
        <BaseCombobox.Icon
          data-slot="combobox-icon"
          className="shrink-0 text-text-tertiary"
        >
          <ChevronGlyph />
        </BaseCombobox.Icon>
      </div>

      <BaseCombobox.Portal container={modalPortalContainer ?? undefined}>
        <BaseCombobox.Positioner sideOffset={6} className={popupPositionerClasses}>
          <BaseCombobox.Popup data-slot="combobox-popup" className={popupClasses}>
            <BaseCombobox.Empty className="px-3 py-6 text-center text-caption text-text-tertiary">
              {emptyMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List>
              {(item: ComboboxOption) => (
                <BaseCombobox.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled}
                  className={optionClasses}
                >
                  <BaseCombobox.ItemIndicator className="absolute right-2.5 flex items-center text-accent-600">
                    <CheckGlyph />
                  </BaseCombobox.ItemIndicator>
                  <span className="truncate">{item.label}</span>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
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

function CloseGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none">
      <path
        d="m4 4 8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
