/**
 * ============================================================================
 * Fairway · forms — shared style recipes (LOCAL to this primitive group)
 * ----------------------------------------------------------------------------
 * Self-contained Tailwind class recipes shared across the forms primitives.
 * Kept inside the forms/ folder (NOT a top-level shared file) so this group
 * stays composable on its own. Every class resolves to a Fairway token-backed
 * utility (bg-surface-sunken, border-border-subtle, ring-border-focus,
 * text-text-*, font-fw-sans, rounded-fw-sm …) defined in tailwind.config.ts +
 * src/styles/design-tokens.css. These components are designed to render inside
 * a `.fairway-ds` scope on a `bg-canvas` page.
 *
 * Design bar (DESIGN-SYSTEM.md §4 / §7): warm matte opaque controls, calm
 * inputs that do NOT shift layout on validation, visible green focus-visible
 * ring that survives black + cream, >=24px hit targets, slow 180ms motion.
 * ========================================================================== */

/**
 * Validity status a control can surface. `validating` = async validation in
 * flight. Mirrors the Base UI Field validity surface but reduced to what the
 * UI cares about. Layout never shifts between states — see FormField.
 */
export type FieldStatus = "idle" | "validating" | "error" | "success";

/**
 * Control sizes. `sm` keeps the >=24px target floor; `md` is the calm default
 * (40px, the roomy Fairway control); `lg` is for hero / spacious forms.
 */
export type FieldSize = "sm" | "md" | "lg";

/** Height + horizontal padding + text size per control size. */
export const sizeClasses: Record<FieldSize, string> = {
  sm: "min-h-[2rem] px-3 py-1.5 text-body-sm", // 32px — still >=24px target
  md: "min-h-[2.5rem] px-3.5 py-2 text-body", // 40px — DEFAULT, roomy
  lg: "min-h-[3rem] px-4 py-2.5 text-body-lg", // 48px — hero forms
};

/**
 * The warm matte control surface every text-like input shares — the single
 * canonical recipe (no second near-identical variant, to avoid token drift).
 *
 * Resting = sunken warm well + subtle warm hairline (border, NOT shadow).
 * Hover = stronger border (no layout shift). Focus-visible = green ring that
 * survives cream + black. Validity is driven by Base UI's Field, which passes
 * `data-invalid` / `data-valid` / `data-dirty` / `data-touched` down to the
 * control — so error tinting happens in pure CSS and never reflows.
 */
export const fieldControlBase = [
  "block w-full font-fw-sans text-text-primary rounded-fw-sm",
  "bg-surface-sunken border border-border-subtle",
  "placeholder:text-text-tertiary",
  "transition-[border-color,box-shadow,background-color] [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
  "hover:border-border-strong",
  "outline-none focus-visible:border-border-focus",
  "focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-subtle",
  // validity (driven by Field) — error wins
  "data-[invalid]:border-fw-danger/60 data-[invalid]:focus-visible:ring-fw-danger/40 data-[invalid]:focus-visible:border-fw-danger",
].join(" ");

/** Visible label — General Sans `label` role (13/16, 500), always shown (never placeholder-only). */
export const labelClasses =
  "flex items-center gap-1.5 font-fw-sans text-body-sm font-medium text-text-primary select-none";

/** Required-marker styling (the green dot/asterisk). */
export const requiredMarkClasses = "text-accent-600 leading-none";

/** Optional tag — recessive warm meta. */
export const optionalTagClasses =
  "font-fw-sans text-caption font-medium text-text-tertiary";

/** Inline help / description — warm secondary, sits below the control. */
export const helpClasses = "font-fw-sans text-caption text-text-secondary";

/** Inline error message — danger, sits in the reserved message row. */
export const errorClasses =
  "flex items-start gap-1.5 font-fw-sans text-caption font-medium text-fw-danger";

/** Inline success message — success green, same reserved row. */
export const successClasses =
  "flex items-start gap-1.5 font-fw-sans text-caption font-medium text-fw-success";

/** Inline validating message — warm secondary with a quiet spinner. */
export const validatingClasses =
  "flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary";

/**
 * The reserved message row. CRITICAL: min-height is reserved so toggling
 * between help / error / success / validating NEVER shifts surrounding layout
 * (DESIGN-SYSTEM.md §7.5 CLS, the "inline validation that does not shift
 * layout" requirement). One line of caption + a little breathing room.
 */
export const messageRowClasses = "min-h-[1.125rem] pt-1.5";

/** Popup surface shared by Select / Combobox / Autocomplete — the Elevated overlay. */
export const popupClasses = [
  "z-dropdown max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] overflow-y-auto",
  "rounded-fw-md bg-elevated border border-border-subtle shadow-raise",
  "p-1.5 font-fw-sans text-body text-text-primary",
  "outline-none",
  // materialize — opacity + tiny scale (honors reduced motion via the keyframe util)
  "origin-[var(--transform-origin)]",
  "transition-[opacity,transform] [transition-duration:var(--fw-dur-medium)] [transition-timing-function:var(--fw-ease-emph)]",
  "data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]",
  "data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]",
].join(" ");

/** A selectable option row inside a Select/Combobox popup. */
export const optionClasses = [
  "relative flex cursor-default select-none items-center gap-2 rounded-fw-sm",
  "py-2 pl-3 pr-8 text-body text-text-primary",
  "outline-none transition-colors [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]",
  // highlighted (keyboard/pointer) + selected
  "data-[highlighted]:bg-accent-50 data-[highlighted]:text-accent-900",
  "data-[selected]:font-medium",
  "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
].join(" ");

/** Group label inside a popup. */
export const groupLabelClasses =
  "px-3 pb-1 pt-2 font-fw-sans text-eyebrow uppercase text-text-tertiary";
