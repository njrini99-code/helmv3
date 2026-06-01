/**
 * ============================================================================
 * Fairway · forms — public surface
 * ----------------------------------------------------------------------------
 * Warm, calm, trustworthy form primitives for the Fairway design system, built
 * on @base-ui-components/react for behavior + ARIA. Inline validation that
 * never shifts layout; visible labels always; full hover / focus-visible /
 * active states; reduced-motion + reduced-transparency safe.
 *
 * Render these inside a `.fairway-ds` scope on a `bg-canvas` page (see
 * src/lib/redesign/flag.ts).
 *
 *   import { Form, FormSection, FormField, Input, TextArea, Select,
 *            Combobox, NumberField, Checkbox, Switch, RadioGroup } from
 *     "@/components/fairway/forms";
 * ========================================================================== */

export { Form } from "./Form";
export type { FormProps } from "./Form";

export { FormSection } from "./FormSection";
export type { FormSectionProps } from "./FormSection";

export { FormField } from "./FormField";
export type { FormFieldProps } from "./FormField";

export { Input, TextArea } from "./Input";
export type { InputProps, TextAreaProps } from "./Input";

export { Select, SelectItem, SelectGroup } from "./Select";
export type { SelectProps, SelectOption } from "./Select";

export { Combobox } from "./Combobox";
export type {
  ComboboxProps,
  ComboboxOption,
  SingleComboboxProps,
  MultiComboboxProps,
} from "./Combobox";

export { NumberField } from "./NumberField";
export type { NumberFieldProps } from "./NumberField";

export { Checkbox, CheckboxGroup } from "./Checkbox";
export type { CheckboxProps } from "./Checkbox";

export { Switch } from "./Switch";
export type { SwitchProps } from "./Switch";

export { RadioGroup, Radio } from "./RadioGroup";
export type { RadioGroupProps, RadioProps, RadioOption } from "./RadioGroup";

export type { FieldStatus, FieldSize } from "./styles";
